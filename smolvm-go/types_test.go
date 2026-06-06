package smolvm

import (
	"encoding/json"
	"testing"
)

func TestCreateMachineRequestOmitsZeroFields(t *testing.T) {
	req := CreateMachineRequest{Name: "vm1"}
	out, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	got := string(out)
	want := `{"name":"vm1"}`
	if got != want {
		t.Errorf("got %s, want %s", got, want)
	}
}

func TestCreateMachineRequestSerialisesResources(t *testing.T) {
	req := CreateMachineRequest{
		Name:     "vm1",
		CPUs:     2,
		MemoryMB: 1024,
		Network:  true,
	}
	out, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	// The server expects flat fields, not a nested resources object.
	var decoded map[string]any
	if err := json.Unmarshal(out, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded["cpus"] != float64(2) {
		t.Errorf("cpus=%v, want 2", decoded["cpus"])
	}
	if decoded["memoryMb"] != float64(1024) {
		t.Errorf("memoryMb=%v, want 1024", decoded["memoryMb"])
	}
	if decoded["network"] != true {
		t.Errorf("network=%v, want true", decoded["network"])
	}
	if _, has := decoded["resources"]; has {
		t.Errorf("resources should not be present in flat request, got %v", decoded["resources"])
	}
}

func TestExecRequestTimeoutSecsPointer(t *testing.T) {
	v := int64(30)
	req := ExecRequest{Command: []string{"echo", "hi"}, TimeoutSecs: &v}
	out, _ := json.Marshal(req)
	if want := `{"command":["echo","hi"],"timeoutSecs":30}`; string(out) != want {
		t.Errorf("got %s, want %s", string(out), want)
	}

	req2 := ExecRequest{Command: []string{"x"}}
	out2, _ := json.Marshal(req2)
	if want := `{"command":["x"]}`; string(out2) != want {
		t.Errorf("got %s, want %s", string(out2), want)
	}
}

func TestMachineInfoDecodesAPIResponse(t *testing.T) {
	body := []byte(`{
		"name": "vm1",
		"state": "running",
		"cpus": 2,
		"memoryMb": 1024,
		"mounts": [{"tag":"smolvm0","source":"/host","target":"/guest","readonly":false}],
		"ports": [{"host":8080,"guest":80}],
		"network": true,
		"createdAt": 1780704724,
		"pid": 12345
	}`)
	var info MachineInfo
	if err := json.Unmarshal(body, &info); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if info.State != MachineStateRunning {
		t.Errorf("state=%q, want running", info.State)
	}
	if info.CPUs != 2 || info.MemoryMB != 1024 {
		t.Errorf("cpus/memory: got %d/%d, want 2/1024", info.CPUs, info.MemoryMB)
	}
	if len(info.Mounts) != 1 || info.Mounts[0].Tag != "smolvm0" {
		t.Errorf("mounts: %+v", info.Mounts)
	}
	if info.PID == nil || *info.PID != 12345 {
		t.Errorf("pid: %+v", info.PID)
	}
	if info.CreatedAt != 1780704724 {
		t.Errorf("createdAt=%d, want 1780704724", info.CreatedAt)
	}
}

func TestCreateMachineRequestSerialisesV1Fields(t *testing.T) {
	maxRetries := 5
	req := CreateMachineRequest{
		Name:                  "vm1",
		GPU:                   true,
		RegistryRef:           "myapp:v1",
		RegistryIdentityToken: "tok-123",
		Restart:               &RestartSpec{Policy: "on-failure", MaxRetries: &maxRetries},
	}
	out, err := json.Marshal(req)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	var decoded map[string]any
	if err := json.Unmarshal(out, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if decoded["gpu"] != true {
		t.Errorf("gpu=%v, want true", decoded["gpu"])
	}
	if decoded["registryRef"] != "myapp:v1" {
		t.Errorf("registryRef=%v, want myapp:v1", decoded["registryRef"])
	}
	if decoded["registryIdentityToken"] != "tok-123" {
		t.Errorf("registryIdentityToken=%v, want tok-123", decoded["registryIdentityToken"])
	}
	restart, ok := decoded["restart"].(map[string]any)
	if !ok {
		t.Fatalf("restart is not an object: %v", decoded["restart"])
	}
	if restart["policy"] != "on-failure" {
		t.Errorf("restart.policy=%v, want on-failure", restart["policy"])
	}
	if restart["maxRetries"] != float64(5) {
		t.Errorf("restart.maxRetries=%v, want 5", restart["maxRetries"])
	}
}

func TestRestartSpecMaxRetriesPointerSemantics(t *testing.T) {
	// A nil MaxRetries is omitted; an explicit 0 (= unlimited) must be kept.
	out, _ := json.Marshal(RestartSpec{Policy: "always"})
	if want := `{"policy":"always"}`; string(out) != want {
		t.Errorf("nil MaxRetries: got %s, want %s", out, want)
	}
	zero := 0
	out2, _ := json.Marshal(RestartSpec{Policy: "always", MaxRetries: &zero})
	if want := `{"policy":"always","maxRetries":0}`; string(out2) != want {
		t.Errorf("zero MaxRetries: got %s, want %s", out2, want)
	}
}

func TestExecRequestSerialisesStdinAndBackground(t *testing.T) {
	req := ExecRequest{Command: []string{"cat"}, Stdin: "hello", Background: true}
	out, _ := json.Marshal(req)
	if want := `{"command":["cat"],"stdin":"hello","background":true}`; string(out) != want {
		t.Errorf("got %s, want %s", out, want)
	}
	// Zero values stay omitted so existing callers' payloads are unchanged.
	out2, _ := json.Marshal(ExecRequest{Command: []string{"x"}})
	if want := `{"command":["x"]}`; string(out2) != want {
		t.Errorf("got %s, want %s", out2, want)
	}
}

func TestPullImageRequestSerialisesProxy(t *testing.T) {
	req := PullImageRequest{Image: "alpine", Proxy: "http://192.168.127.254:3128", NoProxy: "localhost,.internal"}
	out, _ := json.Marshal(req)
	want := `{"image":"alpine","proxy":"http://192.168.127.254:3128","noProxy":"localhost,.internal"}`
	if string(out) != want {
		t.Errorf("got %s, want %s", out, want)
	}
}

func TestCapacityResponseDecodesSnakeCase(t *testing.T) {
	// The server's CapacityResponse has no rename attribute, so its JSON keys
	// are snake_case unlike most response bodies.
	body := []byte(`{
		"allocated_cpus": 6,
		"allocated_memory_mb": 12288,
		"used_cpus": 2.5,
		"used_memory_mb": 4096,
		"used_disk_gb": 30
	}`)
	var resp CapacityResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.AllocatedCPUs != 6 {
		t.Errorf("AllocatedCPUs=%d, want 6", resp.AllocatedCPUs)
	}
	if resp.AllocatedMemoryMB != 12288 {
		t.Errorf("AllocatedMemoryMB=%d, want 12288", resp.AllocatedMemoryMB)
	}
	if resp.UsedCPUs != 2.5 {
		t.Errorf("UsedCPUs=%v, want 2.5", resp.UsedCPUs)
	}
	if resp.UsedMemoryMB != 4096 {
		t.Errorf("UsedMemoryMB=%d, want 4096", resp.UsedMemoryMB)
	}
	if resp.UsedDiskGB != 30 {
		t.Errorf("UsedDiskGB=%d, want 30", resp.UsedDiskGB)
	}
}
