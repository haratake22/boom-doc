package main

import (
	"fmt"
	"io"
	"os"
)

func main() {
	os.Exit(run(os.Args[1:], os.Stderr))
}

func run(args []string, stderr io.Writer) int {
	var err error
	switch {
	case len(args) >= 3 && args[0] == "generate":
		err = generate(args[1], args[2], args[3:])
	case len(args) == 3:
		err = update(args[0], args[1], args[2])
	default:
		fmt.Fprintln(stderr, "usage: go run ./internal/manual generate <record> <directory> [chapters...] | go run ./internal/manual <previous-draft> <manual> <new-draft>")
		return 2
	}
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	return 0
}
