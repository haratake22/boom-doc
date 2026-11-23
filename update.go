// Apply a newly generated Markdown draft to the user's edited manual.
// Usage: go run . <previous-draft.md> <edited-manual.md> <new-draft.md>
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

func main() {
	var err error
	switch {
	case len(os.Args) >= 4 && os.Args[1] == "generate":
		err = generate(os.Args[2], os.Args[3], os.Args[4:])
	case len(os.Args) == 4:
		err = update(os.Args[1], os.Args[2], os.Args[3])
	default:
		fmt.Fprintln(os.Stderr, "usage: go run . generate <record> <directory> [chapters...] | go run . <previous-draft> <manual> <new-draft>")
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
