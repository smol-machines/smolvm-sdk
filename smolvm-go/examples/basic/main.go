// Basic usage example for the smolvm Go SDK.
//
// Prerequisites: smolvm serve running on http://127.0.0.1:8080.
//
//	smolvm serve start --listen 127.0.0.1:8080
//
// Run with:
//
//	go run ./examples/basic
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	smolvm "github.com/smol-machines/smolvm-sdk/smolvm-go"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	fmt.Println("=== Quick execution ===")
	result, err := smolvm.QuickExec(ctx, []string{"echo", "Hello from smolvm!"}, smolvm.Config{})
	if err != nil {
		log.Fatalf("QuickExec: %v", err)
	}
	fmt.Printf("stdout: %s", result.Stdout)
	fmt.Printf("exit:   %d\n\n", result.ExitCode)

	fmt.Println("=== Manual lifecycle ===")
	m, err := smolvm.CreateMachine(ctx, smolvm.Config{Name: "go-basic"})
	if err != nil {
		log.Fatalf("CreateMachine: %v", err)
	}
	defer func() {
		_ = m.Stop(ctx)
		_ = m.Delete(ctx)
	}()

	uname, err := m.Exec(ctx, []string{"uname", "-a"})
	if err != nil {
		log.Fatalf("Exec: %v", err)
	}
	fmt.Printf("uname:  %s", uname.Stdout)

	fmt.Println("\n=== WithMachine helper ===")
	err = smolvm.WithMachine(ctx, smolvm.Config{Name: "go-helper"},
		func(ctx context.Context, m *smolvm.Machine) error {
			r, err := m.Exec(ctx, []string{"hostname"})
			if err != nil {
				return err
			}
			fmt.Printf("hostname: %s", r.Stdout)
			return nil
		},
	)
	if err != nil {
		log.Fatalf("WithMachine: %v", err)
	}
}
