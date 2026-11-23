package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

func update(base, manual, draft string) error {
	current, err := os.ReadFile(manual)
	if err != nil {
		return err
	}
	previous, err := os.ReadFile(base)
	if err != nil {
		return err
	}
	var result []byte
	if bytes.HasPrefix(current, previous) && bytes.HasSuffix(previous, []byte("\n")) {
		result, err = os.ReadFile(draft)
		if err != nil {
			return err
		}
		result = append(result, current[len(previous):]...)
	} else {
		result, err = exec.Command("git", "merge-file", "--stdout", "--", manual, base, draft).Output()
		if err != nil {
			return fmt.Errorf("could not merge the drafts; review the changes to %s: %w", manual, err)
		}
	}
	if bytes.Equal(current, result) {
		return nil
	}
	info, err := os.Stat(manual)
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(manual), ".boom-doc-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err = tmp.Write(result); err == nil {
		err = tmp.Chmod(info.Mode().Perm())
	}
	closeErr := tmp.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	return os.Rename(tmp.Name(), manual)
}
