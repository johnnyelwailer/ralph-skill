#!/bin/bash
set -e

# Setup temp home
TEMP_HOME=$(mktemp -d)
echo "Using temp home: $TEMP_HOME"

# Try to run setup
cd aloop/cli
# We need to use the current repo's code. 
# We'll use tsx to run the cli.
export HOME=$TEMP_HOME
npx tsx ./src/index.ts setup --non-interactive --project-root $(pwd) --home-dir $TEMP_HOME

rm -rf "$TEMP_HOME"
