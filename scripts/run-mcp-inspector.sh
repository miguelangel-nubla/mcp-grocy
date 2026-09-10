#!/usr/bin/env bash
# Run official MCP Inspector CLI against a built mcp-grocy binary.
# https://github.com/modelcontextprotocol/inspector
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [[ ! -f "$ROOT/build/main.js" ]]; then
  echo "run-mcp-inspector: missing $ROOT/build/main.js — run npm run build first" >&2
  exit 1
fi

# Ensure configuration exists for tool discovery and execution
CLEANUP_CONFIG=false
if [[ ! -f "$ROOT/mcp-grocy.yaml" && ! -f "$ROOT/mcp-grocy.yml" ]]; then
  cp "$ROOT/mcp-grocy.yaml.example" "$ROOT/mcp-grocy.yaml"
  CLEANUP_CONFIG=true
fi

cleanup() {
  if [[ "$CLEANUP_CONFIG" == "true" ]]; then
    rm -f "$ROOT/mcp-grocy.yaml"
  fi
}
trap cleanup EXIT

echo "=== MCP Inspector: initialize ==="
npx --yes @modelcontextprotocol/inspector --cli node "$ROOT/build/main.js" --method initialize

echo "=== MCP Inspector: tools/list --strict ==="
npx --yes @modelcontextprotocol/inspector --cli node "$ROOT/build/main.js" --method tools/list --strict

echo "=== MCP Inspector: resources/list ==="
npx --yes @modelcontextprotocol/inspector --cli node "$ROOT/build/main.js" --method resources/list

echo "=== MCP Inspector: tools/call smoke test ==="
MOCK_API=true npx --yes @modelcontextprotocol/inspector --cli node "$ROOT/build/main.js" --method tools/call --tool-name system_locations_get

echo "All MCP Inspector checks passed successfully!"
