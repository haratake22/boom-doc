package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestManualChanges(t *testing.T) {
	dir := t.TempDir()
	record := filepath.Join(dir, "run.json")
	manual := filepath.Join(dir, "manual.md")
	base := filepath.Join(dir, ".boom-base.md")
	write := func(path string, data []byte) {
		t.Helper()
		if err := os.WriteFile(path, data, 0600); err != nil {
			t.Fatal(err)
		}
	}
	read := func(path string) []byte {
		t.Helper()
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		return data
	}
	chapters := []chapter{{Title: "A", Steps: []step{{Title: "Open", Image: []byte("first")}, {Title: "Open", Image: []byte("second")}}}, {Title: "B", Steps: []step{{Title: "Save", Image: []byte("third")}}}}
	saveRecord := func() {
		t.Helper()
		data, err := json.Marshal(chapters)
		if err != nil {
			t.Fatal(err)
		}
		write(record, data)
	}
	saveRecord()
	if err := generate(record, dir, []string{"B", "A"}); err != nil {
		t.Fatal(err)
	}
	old := read(base)
	if bytes.Index(old, []byte("## B")) >= bytes.Index(old, []byte("## A")) || bytes.Count(old, []byte("1. Open")) != 2 {
		t.Fatal("chapter order or repeated step lost")
	}
	note := []byte("\nReviewer note\n")
	write(manual, append(read(manual), note...))
	chapters[0].Steps[0].Image = []byte("changed")
	saveRecord()
	if err := generate(record, dir, []string{"B", "A"}); err != nil {
		t.Fatal(err)
	}
	changed := read(base)
	if bytes.Equal(changed, old) || !bytes.Equal(read(manual), append(changed, note...)) {
		t.Fatal("image change or note lost")
	}
	chapters = chapters[:1]
	chapters[0].Steps = chapters[0].Steps[:1]
	chapters = append(chapters, chapter{Title: "C", Steps: []step{{Title: "New"}}})
	saveRecord()
	if err := generate(record, dir, []string{"A", "C"}); err != nil {
		t.Fatal(err)
	}
	current := read(manual)
	if bytes.Contains(current, []byte("## B")) || bytes.Count(current, []byte("1. Open")) != 1 || !bytes.Contains(current, []byte("1. New")) || !bytes.HasSuffix(current, note) {
		t.Fatal("unexpected updated manual")
	}
	if err := os.Remove(base); err != nil {
		t.Fatal(err)
	}
	if err := generate(record, dir, nil); err == nil || !bytes.Equal(read(manual), current) {
		t.Fatal("missing baseline must preserve manual")
	}
}

func TestHashImages(t *testing.T) {
	chapters := []chapter{{Steps: []step{{Image: []byte("abc")}, {Image: []byte("abc")}}}}
	for _, workers := range []int{1, 8} {
		hashImages(chapters, workers)
		for _, s := range chapters[0].Steps {
			if s.filename != "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad.png" {
				t.Fatal(s.filename)
			}
		}
	}
}

func BenchmarkHashImages(b *testing.B) {
	steps := make([]step, 256)
	for i := range steps {
		steps[i].Image = make([]byte, 64*1024)
	}
	chapters := []chapter{{Steps: steps}}
	for _, mode := range []struct {
		name    string
		workers int
	}{{"serial", 1}, {"parallel", runtime.GOMAXPROCS(0)}} {
		b.Run(mode.name, func(b *testing.B) {
			b.SetBytes(256 * 64 * 1024)
			b.ReportAllocs()
			for i := 0; i < b.N; i++ {
				hashImages(chapters, mode.workers)
			}
		})
	}
}
