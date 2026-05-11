// Preset helpers example: PythonCode and NodeCode.
//
// The presets always enable networking and pull the image into the ephemeral
// machine before running, so first-call runs may take longer while the image
// downloads.
//
// Run with:
//
//	go run ./examples/presets
package main

import (
	"context"
	"fmt"
	"log"
	"time"

	smolvm "github.com/smol-machines/smolvm-sdk/smolvm-go"
	"github.com/smol-machines/smolvm-sdk/smolvm-go/presets"
)

func main() {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	fmt.Println("=== Python ===")
	pyResult, err := presets.PythonCode(ctx, `
import sys, json
print(json.dumps({"version": sys.version_info[:3], "msg": "hello"}))
`, presets.PythonOptions{})
	if err != nil {
		log.Fatalf("PythonCode: %v", err)
	}
	fmt.Print(pyResult.Stdout)

	fmt.Println("=== Node.js ===")
	nodeResult, err := presets.NodeCode(ctx, `
const data = { version: process.version, msg: "hello" };
console.log(JSON.stringify(data));
`, presets.NodeOptions{})
	if err != nil {
		log.Fatalf("NodeCode: %v", err)
	}
	fmt.Print(nodeResult.Stdout)

	// QuickRun does not auto-pull. For lower-level use, pull the image into
	// the machine yourself before invoking Run.
	fmt.Println("=== Manual pull + run ===")
	err = smolvm.WithMachine(ctx, smolvm.Config{Name: "presets-manual", Network: true},
		func(ctx context.Context, m *smolvm.Machine) error {
			if _, err := m.PullImage(ctx, "alpine", ""); err != nil {
				return err
			}
			r, err := m.Run(ctx, "alpine",
				[]string{"sh", "-c", "echo from-alpine"},
				smolvm.ExecOptions{Timeout: 60})
			if err != nil {
				return err
			}
			fmt.Print(r.Stdout)
			return nil
		})
	if err != nil {
		log.Fatalf("Manual run: %v", err)
	}
}
