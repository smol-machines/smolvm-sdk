package presets

import (
	"context"
	"fmt"

	smolvm "github.com/smol-machines/smolvm-sdk/smolvm-go"
)

// runImage creates an ephemeral machine, pulls image into it, runs cmd, and
// cleans up. Pulling first is required because /run does not auto-pull.
func runImage(
	ctx context.Context,
	cfg smolvm.Config,
	image string,
	ociPlatform string,
	cmd []string,
	exec smolvm.ExecOptions,
) (*smolvm.ExecResult, error) {
	if cfg.Name == "" {
		cfg.Name = smolvm.GenerateMachineName("preset")
	}
	var result *smolvm.ExecResult
	err := smolvm.WithMachine(ctx, cfg, func(ctx context.Context, m *smolvm.Machine) error {
		if _, err := m.PullImage(ctx, image, ociPlatform); err != nil {
			return fmt.Errorf("pull image %s: %w", image, err)
		}
		r, err := m.Run(ctx, image, cmd, exec)
		if err != nil {
			return err
		}
		result = r
		return nil
	})
	return result, err
}
