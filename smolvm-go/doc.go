// Package smolvm provides a Go SDK for smolvm — a microVM machine management system.
//
// Quick start:
//
//	machine, err := smolvm.CreateMachine(ctx, smolvm.Config{Name: "my-machine"})
//	if err != nil {
//	    return err
//	}
//	defer machine.Delete(ctx)
//	defer machine.Stop(ctx)
//
//	result, err := machine.Exec(ctx, []string{"echo", "hello"})
//	if err != nil {
//	    return err
//	}
//	fmt.Println(result.Stdout)
//
// The package targets a smolvm server (default http://127.0.0.1:8080), started via
// `smolvm serve start`. See https://github.com/smol-machines/smolvm-sdk for details.
package smolvm
