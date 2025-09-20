# MCP Grocy Configuration Guide

Advanced configuration reference for the MCP Grocy server. For basic setup, see the [README](../../README.md).

## 🔧 Configuration Variables

### Core Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GROCY_BASE_URL` | Your Grocy instance URL | `http://localhost:9283` | ✅ |
| `GROCY_API_KEY` | Your Grocy API key | - | ✅ |

### Optional Variables

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `GROCY_ENABLE_SSL_VERIFY` | SSL certificate verification | `true` | `false` |
| `REST_RESPONSE_SIZE_LIMIT` | Response size limit (bytes) | `10000` | `50000` |

## 🌐 HTTP Server Configuration

Enable HTTP/SSE transport for web-based access:

| Variable | Description | Default | Example |
|----------|-------------|---------|---------|
| `ENABLE_HTTP_SERVER` | Enable HTTP/SSE transport | `false` | `true` |
| `HTTP_SERVER_PORT` | HTTP server port | `8080` | `3000` |

### Transport Modes
- **stdio** (default) - Standard MCP protocol for CLI/desktop clients
- **HTTP** - Streamable HTTP for web applications (`POST /mcp`)
- **SSE** - Server-Sent Events for real-time web clients (`GET /mcp/sse`)

## 🛠️ Tool Configuration

Tools are configured using the YAML configuration file `mcp-grocy.yaml`. 

Copy `mcp-grocy.yaml.example` to `mcp-grocy.yaml` and customize the `tools` section to enable/disable specific functionality.

All available tools and their configuration options are documented in `mcp-grocy.yaml.example`.

### Acknowledgment Tokens

All tools support acknowledgment tokens - unique confirmation words that provide end-to-end verification that actions were actually executed rather than hallucinated by the LLM.

When an acknowledgment token is configured for a tool, the server will return that exact token in the response only if the operation truly succeeded. The key principle is that acknowledgment tokens should be **completely unknown to the LLM beforehand** - using random, unrelated word combinations that the LLM would be extremely unlikely to guess or generate on its own.

If the LLM returns your specific acknowledgment token (like "PURPLE_TELESCOPE_SINGING" or "CRYSTAL_VOLCANO_WHISPERING"), it's strong evidence the action was genuinely performed rather than hallucinated.

Example configuration and usage patterns are shown in `mcp-grocy.yaml.example`.

## 📋 Configuration Examples

Configuration examples for common use cases are provided in `mcp-grocy.yaml.example`.

## 🔒 Security Considerations

### API Key Security
- Never commit API keys to version control
- Use `.env` files for local development
- Use secure environment variable management in production

### Tool Access Control
- Disable unused tools to reduce attack surface
- Use read-only mode for information-gathering use cases
- Be cautious with tools that modify data (`inventory_transactions_purchase`, `inventory_stock_entry_consume`, etc.)

### Network Security
- Use HTTPS for production Grocy instances
- Consider SSL verification settings carefully
- Limit response sizes to prevent memory issues

## 📝 Environment File Examples

### Development Configuration
```bash
# .env for development
GROCY_BASE_URL=http://localhost:9283
GROCY_API_KEY=dev_api_key_here
GROCY_ENABLE_SSL_VERIFY=false
REST_RESPONSE_SIZE_LIMIT=50000

# Enable HTTP server for testing
ENABLE_HTTP_SERVER=true
HTTP_SERVER_PORT=8080
```

### Production Configuration
```bash
# .env for production
GROCY_BASE_URL=https://grocy.yourdomain.com
GROCY_API_KEY=secure_production_key
GROCY_ENABLE_SSL_VERIFY=true
REST_RESPONSE_SIZE_LIMIT=20000
```

Tool configuration should be done via `mcp-grocy.yaml` file.

## 🔄 Configuration Management

### Loading Order
1. Default values
2. Environment variables
3. `.env` file (if present)

### Validation
- Server validates all tool names at startup
- Invalid configuration prevents server start
- Error messages show valid options

### Runtime Changes
- Configuration changes require server restart
- Use process managers (PM2, systemd) for production restarts
- Docker containers need to be recreated with new environment

## 🐛 Troubleshooting Configuration

### Common Issues

**Tool configuration not working**
- Check YAML syntax and indentation
- Verify tool names match current naming convention
- Ensure `mcp-grocy.yaml` file is in the correct location

**SSL/TLS connection errors**
- Set `GROCY_ENABLE_SSL_VERIFY=false` for self-signed certificates
- Verify Grocy URL is accessible
- Check firewall and network settings

**Large response errors**
- Increase `REST_RESPONSE_SIZE_LIMIT`
- Consider disabling unused tools to reduce response size
- Check Grocy instance has reasonable data volumes

### Debugging Configuration
```bash
# Use mock mode to test configuration
npm run dev

# Enable MCP inspector for protocol debugging  
npm run inspector

# Check configuration loading
# (Server logs show loaded configuration at startup)
```