// File upload/download example.
//
// Run with:
//
//	go run ./examples/files
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

	err := smolvm.WithMachine(ctx, smolvm.Config{Name: "go-files"},
		func(ctx context.Context, m *smolvm.Machine) error {
			payload := []byte("hello from the host\n")
			if _, err := m.UploadFile(ctx, "workspace/greeting.txt", payload); err != nil {
				return fmt.Errorf("upload: %w", err)
			}

			result, err := m.Exec(ctx, []string{"cat", "/workspace/greeting.txt"})
			if err != nil {
				return fmt.Errorf("exec: %w", err)
			}
			fmt.Printf("guest sees: %s", result.Stdout)

			downloaded, err := m.DownloadFile(ctx, "workspace/greeting.txt")
			if err != nil {
				return fmt.Errorf("download: %w", err)
			}
			fmt.Printf("downloaded: %s", string(downloaded))
			return nil
		},
	)
	if err != nil {
		log.Fatal(err)
	}
}
