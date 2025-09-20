#!/bin/bash
# Development runner script

# Build the project
npm run build

# Check if mcp-grocy.yaml file exists
if [ ! -f mcp-grocy.yaml ]; then
    echo "Error: mcp-grocy.yaml file not found. Please copy mcp-grocy.yaml.example to mcp-grocy.yaml and configure it."
    exit 1
fi

echo "Starting MCP Grocy API server with configuration from mcp-grocy.yaml..."
echo "Tool configuration: mcp-grocy.yaml"

node build/main.js