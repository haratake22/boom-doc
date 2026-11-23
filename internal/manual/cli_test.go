package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func put(t *testing.T, path, contents string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(contents), 0600); err != nil {
		t.Fatal(err)
	}
}

func contents(t *testing.T, path string) string {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(data)
}

func TestRejectedGenerationPreservesFiles(t *testing.T) {
	const valid = `[{"Title":"Settings","Steps":[{"Title":"Save","Image":"AQ=="}]}]`
	for _, tc := range []struct {
		name, input string
		order       []string
	}{
		{"missing record", "", nil},
		{"malformed JSON", "[", nil},
		{"empty run", "[]", nil},
		{"unknown chapter", valid, []string{"Absent"}},
		{"assets path occupied", valid, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dir := t.TempDir()
			record := filepath.Join(dir, "run.json")
			if tc.input != "" {
				put(t, record, tc.input)
			}
			if tc.name == "assets path occupied" {
				put(t, filepath.Join(dir, "assets"), "user file")
			}
			manual, base := filepath.Join(dir, "manual.md"), filepath.Join(dir, ".boom-base.md")
			put(t, manual, "Human note\n")
			put(t, base, "Old draft\n")
			var stderr bytes.Buffer
			if code := run(append([]string{"generate", record, dir}, tc.order...), &stderr); code != 1 || stderr.Len() == 0 {
				t.Fatalf("code=%d stderr=%q", code, stderr.String())
			}
			if contents(t, manual) != "Human note\n" || contents(t, base) != "Old draft\n" {
				t.Fatal("failed generation overwrote existing files")
			}
		})
	}
}

func TestCommandUsageAndSuccess(t *testing.T) {
	var stderr bytes.Buffer
	if code := run(nil, &stderr); code != 2 || !strings.Contains(stderr.String(), "usage:") {
		t.Fatalf("code=%d stderr=%q", code, stderr.String())
	}
	stderr.Reset()
	dir := t.TempDir()
	record := filepath.Join(dir, "run.json")
	put(t, record, `[{"Title":"Settings","Steps":[{"Title":"Save"}]}]`)
	if code := run([]string{"generate", record, dir, "Settings"}, &stderr); code != 0 {
		t.Fatal(stderr.String())
	}
	manual, base := filepath.Join(dir, "manual.md"), filepath.Join(dir, ".boom-base.md")
	original := contents(t, manual)
	if !strings.Contains(original, "1. Save") || original != contents(t, base) {
		t.Fatal("incorrect initial manual")
	}
	next := filepath.Join(dir, "new.md")
	put(t, next, "Updated\n")
	put(t, manual, original+"Note\n")
	if code := run([]string{base, manual, next}, &stderr); code != 0 || contents(t, manual) != "Updated\nNote\n" {
		t.Fatalf("update failed: %s", stderr.String())
	}
}

func TestMissingMergeInputs(t *testing.T) {
	for _, missing := range []string{"base", "manual", "next"} {
		t.Run(missing, func(t *testing.T) {
			dir := t.TempDir()
			for _, name := range []string{"base", "manual", "next"} {
				if name != missing {
					put(t, filepath.Join(dir, name), "Old\n")
				}
			}
			err := update(filepath.Join(dir, "base"), filepath.Join(dir, "manual"), filepath.Join(dir, "next"))
			if !os.IsNotExist(err) {
				t.Fatalf("expected missing input, got %v", err)
			}
			if missing != "manual" && contents(t, filepath.Join(dir, "manual")) != "Old\n" {
				t.Fatal("manual overwritten")
			}
		})
	}
}

func TestConflictingDraftPreservesBaseline(t *testing.T) {
	dir := t.TempDir()
	manual, base := filepath.Join(dir, "manual.md"), filepath.Join(dir, ".boom-base.md")
	put(t, base, "Old\n")
	put(t, manual, "User edit\n")
	if err := saveDraft(dir, "New\n"); err == nil {
		t.Fatal("expected conflict")
	}
	if contents(t, manual) != "User edit\n" || contents(t, base) != "Old\n" {
		t.Fatal("conflict changed manual or baseline")
	}
}
