#!/bin/bash

# Extract json_escape from loop.sh
JSON_ESCAPE_FUNC=$(sed -n '/^json_escape() {/,/^}/p' aloop/bin/loop.sh)
eval "$JSON_ESCAPE_FUNC"

test_json_escape() {
    local input="$1"
    local name="$2"
    
    local escaped=$(json_escape "$input")
    local json="{\"value\":\"$escaped\"}"
    
    # Use a simpler Node script to avoid multiline quoting issues in bash
    local node_script="const fs=require('fs'); const input=fs.readFileSync(0,'utf8'); try { const parsed=JSON.parse(input); process.stdout.write(parsed.value || ''); } catch (e) { process.stderr.write('INVALID JSON: ' + e.message + '\n'); process.stderr.write('JSON was: ' + input + '\n'); process.exit(1); }"
    
    local roundtrip=$(printf '%s' "$json" | node -e "$node_script" 2>&1)
    local exit_code=$?
    
    if [ $exit_code -eq 0 ] && [ "$roundtrip" = "$input" ]; then
        echo "PASS: $name"
    else
        echo "FAIL: $name"
        if [ $exit_code -ne 0 ]; then
            echo "  Error: $roundtrip"
        else
            echo "  Expected: [$input]" | cat -v
            echo "  Actual:   [$roundtrip]" | cat -v
        fi
        echo "  Escaped:  [$escaped]" | cat -v
        return 1
    fi
}

failed=0

test_json_escape "simple" "Simple string" || failed=1
test_json_escape "quote\"quote" "Double quote" || failed=1
test_json_escape "back\\slash" "Backslash" || failed=1
test_json_escape "line1
line2" "Newline" || failed=1

# Use printf to be safe with carriage returns and tabs
test_json_escape "$(printf 'line1\rline2')" "Carriage return" || failed=1
test_json_escape "$(printf 'tab1\ttab2')" "Tab" || failed=1

# Mixed multiline and escapes
mixed="mixed \"quote\" \\back\\
next line	tab
carriage$(printf '\r')return"
test_json_escape "$mixed" "Mixed" || failed=1

test_json_escape "" "Empty input" || failed=1

# Mixed multiline stderr simulation
stderr_sim="Error: something went wrong
  at process.run (node:internal/process/task_queues:95:5)
  at async Task.run (/path/to/file.js:10:5)
[ERROR] 404 Not Found"
test_json_escape "$stderr_sim" "Multiline stderr" || failed=1

if [ $failed -eq 0 ]; then
    echo "All tests passed!"
    exit 0
else
    echo "Some tests failed!"
    exit 1
fi
