#!/usr/bin/env bash
set -euo pipefail

node --check src/*.mjs
node ./src/cli.mjs --help >/dev/null

echo "smoke test passed"
