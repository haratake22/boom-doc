package main

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestUnchangedDraftPreservesEditedFiles(t *testing.T) {
	dir := t.TempDir()
	const draft = "Open\n"
	if err := saveDraft(dir, draft); err != nil {
		t.Fatal(err)
	}
	manual := filepath.Join(dir, "manual.md")
	if err := os.WriteFile(manual, []byte("Edited\n"), 0600); err != nil {
		t.Fatal(err)
	}
	files := []string{manual, filepath.Join(dir, ".boom-base.md")}
	stamp := time.Unix(1700000000, 0)
	for _, path := range files {
		if err := os.Chtimes(path, stamp, stamp); err != nil {
			t.Fatal(err)
		}
	}
	if err := saveDraft(dir, draft); err != nil {
		t.Fatal(err)
	}
	for _, path := range files {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if !info.ModTime().Equal(stamp) {
			t.Fatalf("unchanged generation rewrote %s", path)
		}
	}
}

func TestUpdateEditedManual(t *testing.T) {
	const base = "Open\n\nDetails\n\nSave\n"
	for _, tc := range []struct {
		name, manual, draft, want string
		conflict                  bool
	}{
		{"edit already matches new draft", "New\n", "New\n", "New\n", false},
		{"append note", base + "Note\n", "New\n", "New\nNote\n", false},
		{"separate edits", "Start\n\nDetails\n\nSave\n", "Open\n\nDetails\n\nSubmit\n", "Start\n\nDetails\n\nSubmit\n", false},
		{"overlapping edits", "Human\n\nDetails\n\nSave\n", "Generated\n\nDetails\n\nSave\n", "Human\n\nDetails\n\nSave\n", true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			file := func(name, contents string) string {
				t.Helper()
				path := filepath.Join(dir, name)
				if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
					t.Fatal(err)
				}
				return path
			}
			manual := file("manual.md", tc.manual)
			err := update(file("base.md", base), manual, file("new.md", tc.draft))
			if (err != nil) != tc.conflict {
				t.Fatalf("unexpected merge outcome: %v", err)
			}
			got, err := os.ReadFile(manual)
			if err != nil {
				t.Fatal(err)
			}
			if string(got) != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}
