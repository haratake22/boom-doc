package main

import (
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
)

type chapter struct {
	Title string
	Start int64
	Steps []step
}

type step struct {
	Title    string
	Image    []byte
	filename string
}

// Hash independent images concurrently; rendering still follows the recorded order.
func hashImages(chapters []chapter, workers int) {
	jobs := make(chan *step)
	var wg sync.WaitGroup
	for range max(1, workers) {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for s := range jobs {
				s.filename = fmt.Sprintf("%x.png", sha256.Sum256(s.Image))
			}
		}()
	}
	for _, c := range chapters {
		for i := range c.Steps {
			jobs <- &c.Steps[i]
		}
	}
	close(jobs)
	wg.Wait()
}

func orderChapters(chapters []chapter, order []string) error {
	if len(chapters) == 0 {
		return fmt.Errorf("no documented steps captured")
	}
	if len(order) == 0 {
		sort.SliceStable(chapters, func(i, j int) bool {
			if chapters[i].Start == chapters[j].Start {
				return chapters[i].Title < chapters[j].Title
			}
			return chapters[i].Start < chapters[j].Start
		})
		return nil
	}
	if len(order) != len(chapters) {
		return fmt.Errorf("order must list every chapter exactly once")
	}
	byTitle := make(map[string]chapter, len(chapters))
	for _, c := range chapters {
		byTitle[c.Title] = c
	}
	for i, title := range order {
		c, ok := byTitle[title]
		if !ok {
			return fmt.Errorf("unknown or repeated chapter: %s", title)
		}
		chapters[i] = c
		delete(byTitle, title)
	}
	return nil
}

func generate(record, directory string, order []string) error {
	data, err := os.ReadFile(record)
	if err != nil {
		return err
	}
	var chapters []chapter
	if err := json.Unmarshal(data, &chapters); err != nil {
		return err
	}
	if err := orderChapters(chapters, order); err != nil {
		return err
	}
	hashImages(chapters, runtime.GOMAXPROCS(0))
	assets := filepath.Join(directory, "assets")
	if err := os.MkdirAll(assets, 0755); err != nil {
		return err
	}
	var md strings.Builder
	md.WriteString("# 操作マニュアル\n")
	for _, c := range chapters {
		fmt.Fprintf(&md, "\n## %s\n", c.Title)
		for _, s := range c.Steps {
			name := s.filename
			path := filepath.Join(assets, name)
			if _, err := os.Stat(path); os.IsNotExist(err) {
				if err := os.WriteFile(path, s.Image, 0644); err != nil {
					return err
				}
			} else if err != nil {
				return err
			}
			fmt.Fprintf(&md, "\n1. %s\n\n   ![操作後の画面](assets/%s)\n", s.Title, name)
		}
	}
	return saveDraft(directory, md.String())
}

func saveDraft(directory, draft string) error {
	base := filepath.Join(directory, ".boom-base.md")
	manual := filepath.Join(directory, "manual.md")
	old, be := os.ReadFile(base)
	_, me := os.Stat(manual)
	if be == nil && me == nil && string(old) == draft {
		return nil
	}
	next, err := os.CreateTemp(directory, ".draft-*")
	if err != nil {
		return err
	}
	defer os.Remove(next.Name())
	_, err = next.WriteString(draft)
	closeErr := next.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	switch {
	case os.IsNotExist(be) && os.IsNotExist(me):
		if err := os.WriteFile(manual, []byte(draft), 0644); err != nil {
			return err
		}
	case be == nil && me == nil:
		if err := update(base, manual, next.Name()); err != nil {
			return err
		}
	default:
		return fmt.Errorf("manual and baseline must both exist for update")
	}
	return os.Rename(next.Name(), base)
}
