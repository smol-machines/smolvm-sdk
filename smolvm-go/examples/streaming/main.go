// Streaming exec example. Spawns a long-running command and reads stdout/stderr
// as it arrives.
//
// Run with:
//
//	go run ./examples/streaming
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

	err := smolvm.WithMachine(ctx, smolvm.Config{Name: "go-stream"},
		func(ctx context.Context, m *smolvm.Machine) error {
			events, err := m.ExecStream(ctx, []string{
				"sh", "-c",
				"for i in 1 2 3 4 5; do echo line $i; sleep 0.2; done",
			})
			if err != nil {
				return err
			}
			for ev := range events {
				switch ev.Event {
				case "stdout":
					fmt.Printf("[stdout] %s\n", ev.Data)
				case "stderr":
					fmt.Printf("[stderr] %s\n", ev.Data)
				case "exit":
					fmt.Printf("[exit]   %s\n", ev.Data)
				}
			}
			return nil
		},
	)
	if err != nil {
		log.Fatal(err)
	}
}
