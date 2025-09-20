# Installation

Instructions on how to install this project.

## Claude

Edit `claude_desktop_config.json`(for Claude Desktop) or `.cursor/mcp.json`(for Cursor):

```json
{
  "mcpServers": {
    "mcp-grocy": {
      "command": "npx",
      "args": [
        "-y",
        "miguelangel-nubla/mcp-grocy"
      ], 
      "env": {
        "GROCY_BASE_URL": "",
        "GROCY_API_KEY": "",
        "GROCY_ENABLE_SSL_VERIFY": "False",
        "REST_RESPONSE_SIZE_LIMIT": "10000"
      }
    }
  }
}
```
Or you can use Docker:
```json
{
  "mcpServers": {
    "mcp-grocy": {
      "command": "docker",
      "args": [
        "run",
        "ghcr.io/miguelangel-nubla/mcp-grocy",
        "tini",
        "--",
        "node",
        "build/main.js"
        ],
      "env": {
        "GROCY_BASE_URL": "",
        "GROCY_API_KEY": "",
        "GROCY_ENABLE_SSL_VERIFY": "False",
        "REST_RESPONSE_SIZE_LIMIT": "10000"
      }
    }
  }
}
```

## Node.js

To install using Node.js, you will need to have Node.js and npm (or yarn) installed.

Clone the repository:
```bash
git clone -b main https://github.com/miguelangel-nubla/mcp-grocy.git
cd mcp-grocy
```

Install dependencies:
```bash
npm install
# or
yarn install
```

Then you can run the server:
```bash
npm start
# or
yarn start
```

## npx

You can also run the server directly using npx (Node.js 12.x or newer):

```bash
npx -y mcp-grocy
```

## Docker

To run using Docker, you first need to build the Docker image:

```bash
docker build -t ghcr.io/miguelangel-nubla/mcp-grocy .
```

Then run the container with tini:

```bash
docker run -p mcp-grocy tini -- node build/main.js
```

## HTTP/SSE Transport

The MCP Grocy API server supports the following transports:

- **stdio** (default, Context7 MCP protocol)
- **HTTP** (streamable, Context7-compatible, opt-in)
- **SSE** (Server-Sent Events, for backward compatibility)

To enable HTTP/SSE transport, set the following environment variable:

```bash
ENABLE_HTTP_SERVER=true
HTTP_SERVER_PORT=8080 # (optional, default: 8080)
```

- POST requests to `/mcp` for streamable HTTP (NDJSON or JSON)
- GET requests to `/mcp/sse` for SSE (Server-Sent Events)

All transports use the same MCP protocol and core logic.