package main

import (
	"slices"
	"testing"
)

func TestOrderChapters(t *testing.T) {
	for _, tc := range []struct {
		name        string
		order, want []string
	}{
		{"start then title", nil, []string{"C", "A", "B"}},
		{"explicit order", []string{"B", "C", "A"}, []string{"B", "C", "A"}},
		{"missing chapter", []string{"A", "B"}, nil},
		{"repeated chapter", []string{"A", "A", "B"}, nil},
		{"unknown chapter", []string{"B", "A", "D"}, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			chapters := []chapter{{Title: "B", Start: 2}, {Title: "A", Start: 2}, {Title: "C", Start: 1}}
			err := orderChapters(chapters, tc.order)
			if tc.want == nil {
				if err == nil {
					t.Fatal("accepted invalid order")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			var got []string
			for _, c := range chapters {
				got = append(got, c.Title)
			}
			if !slices.Equal(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
