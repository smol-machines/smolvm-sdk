package smolvm

import (
	"io"
	"strings"
	"testing"
)

func TestScanSSEParsesEventsAndMultilineData(t *testing.T) {
	// SSE spec: multiple data: lines for the same event are joined with \n.
	// Comments (": ...") are ignored. Blank lines flush the event.
	body := strings.NewReader(
		": comment-ignored\n" +
			"event: stdout\n" +
			"data: line one\n" +
			"data: line two\n" +
			"\n" +
			"event: exit\n" +
			"data: {\"exitCode\":0}\n" +
			"\n",
	)

	var got []StreamEvent
	scanSSE(io.NopCloser(body), func(ev StreamEvent) {
		got = append(got, ev)
	})

	if len(got) != 2 {
		t.Fatalf("got %d events, want 2: %+v", len(got), got)
	}
	if got[0].Event != "stdout" || got[0].Data != "line one\nline two" {
		t.Errorf("event[0] = %+v", got[0])
	}
	if got[1].Event != "exit" || got[1].Data != `{"exitCode":0}` {
		t.Errorf("event[1] = %+v", got[1])
	}
}

func TestScanSSEHandlesNoSpaceAfterColon(t *testing.T) {
	// Some servers emit "data:foo" without the space; the parser must accept it.
	body := strings.NewReader("event:stdout\ndata:hello\n\n")

	var got []StreamEvent
	scanSSE(io.NopCloser(body), func(ev StreamEvent) {
		got = append(got, ev)
	})

	if len(got) != 1 || got[0].Event != "stdout" || got[0].Data != "hello" {
		t.Errorf("got %+v", got)
	}
}
