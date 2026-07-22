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
		"createdAt": 1784629905,
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
}
