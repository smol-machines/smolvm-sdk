package smolvm

import (
	"bufio"
	"io"
	"strings"
)

// scanSSE reads Server-Sent Events from body, invoking onEvent for each
// parsed event. body is closed when scanning ends. Channel ownership is
// the caller's responsibility — close it after scanSSE returns.
func scanSSE(body io.ReadCloser, onEvent func(StreamEvent)) {
	defer body.Close()

	scanner := bufio.NewScanner(body)
	// Allow long log lines (default scanner buffer is 64KiB).
	buf := make([]byte, 0, 64*1024)
	scanner.Buffer(buf, 4*1024*1024)

	var (
		event string
		data  []string
	)
	flush := func() {
		if event == "" && len(data) == 0 {
			return
		}
		payload := strings.Join(data, "\n")
		if onEvent != nil {
			onEvent(StreamEvent{Event: event, Data: payload})
		}
		event = ""
		data = data[:0]
	}

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			flush()
			continue
		}
		switch {
		case strings.HasPrefix(line, "event: "):
			event = strings.TrimPrefix(line, "event: ")
		case strings.HasPrefix(line, "event:"):
			event = strings.TrimPrefix(line, "event:")
		case strings.HasPrefix(line, "data: "):
			data = append(data, strings.TrimPrefix(line, "data: "))
		case strings.HasPrefix(line, "data:"):
			data = append(data, strings.TrimPrefix(line, "data:"))
		case strings.HasPrefix(line, ":"):
			// SSE comment — ignore.
		}
	}
	flush()
}
