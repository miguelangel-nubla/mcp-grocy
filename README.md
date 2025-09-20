# MCP Grocy

[![npm version](https://img.shields.io/npm/v/mcp-grocy.svg)](https://www.npmjs.com/package/mcp-grocy)
[![Docker Image](https://img.shields.io/badge/docker%20image-ghcr.io-blue)](https://github.com/miguelangel-nubla/mcp-grocy/pkgs/container/mcp-grocy)
[![License](https://img.shields.io/github/license/miguelangel-nubla/mcp-grocy)](LICENSE)
[![Configuration Status](https://github.com/miguelangel-nubla/mcp-grocy/actions/workflows/validate-config.yml/badge.svg)](https://github.com/miguelangel-nubla/mcp-grocy/actions/workflows/validate-config.yml)
[![CI/CD Pipeline](https://github.com/miguelangel-nubla/mcp-grocy/actions/workflows/pipeline.yml/badge.svg)](https://github.com/miguelangel-nubla/mcp-grocy/actions/workflows/pipeline.yml)
[![MCP Compatible](https://img.shields.io/badge/MCP-Compatible-blue)](https://modelcontextprotocol.io)

> **🍴 Opinionated Fork Notice**
> 
> This is a heavily opinionated fork of [saya6k/mcp-grocy-api](https://github.com/saya6k/mcp-grocy-api) that has diverged significantly to warrant a separate identity. This MCP prioritizes **usability over features**.
>
> **Why This Fork Exists:**
> - The original wrapper exposes the entire Grocy API unprocessed, leading to context overload and LLM confusion
> - Grocy's API design choices and limitations cause error-prone interactions
> - Generic API exposure increases hallucination and near-miss results
> 
> **This Fork's Philosophy:**
> - **Filters and augments data** with relevant context for better LLM comprehension
> - **Reduces API calls** by combining common operations to minimize error chains
> - **Optimizes for reliability and repeatability** over feature completeness
> - **Opinionated workflows** that may not match everyone's preferences
> 
> If you need complete API access, use the [original fork](https://github.com/saya6k/mcp-grocy-api). This version trades flexibility for focused, dependable grocery management workflows.

## 🎯 What This MCP Does

Transform your LLM into an intelligent household management assistant with focused tools for:

### 📦 **Stock Management**
- Track inventory across multiple locations with precision
- Record purchases and consumption with automatic stock updates
- Monitor expiry dates and get volatile stock alerts
- Transfer products between storage locations

### 🛒 **Smart Shopping & Planning**
- Maintain shopping lists with intelligent quantity management
- Plan meals with recipe scheduling and fulfillment checking
- Automatically add missing ingredients to shopping lists
- Track shopping locations and optimize store visits

### 🍽️ **Recipe & Meal Workflows** 
- Find recipes with fuzzy search capabilities
- Check if recipes can be made with current stock
- Complete cooking workflows with portion control
- Integrate meal planning with inventory consumption

### 🏠 **Household Management**
- Manage chores, tasks, and battery tracking
- Get product price history for budgeting
- Organize products by groups and categories
- Print labels for stock entries

## ⚡ Quick Start

1. **Get your Grocy API key** from your Grocy instance (User Settings → API Keys)
2. **Set up with Docker Compose:**
   ```bash
   # Get the project
   git clone https://github.com/miguelangel-nubla/mcp-grocy.git
   cd mcp-grocy
   
   # Configure
   cp .env.example .env
   # Edit .env with your GROCY_BASE_URL and GROCY_APIKEY_VALUE
   
   # Run
   docker compose up -d
   ```

### Try Without Grocy
Test with mock data (no real Grocy instance needed):
```bash
# In .env file, any values work for mock mode
GROCY_BASE_URL=http://mock
GROCY_APIKEY_VALUE=mock

npm install && npm run dev
```

## Installation

### NPM

```bash
git clone -b main https://github.com/miguelangel-nubla/mcp-grocy.git
cd mcp-grocy
npm install
npm run build
```

### Docker

```bash
docker run -e GROCY_APIKEY_VALUE=your_api_key -e GROCY_BASE_URL=http://your-grocy-instance ghcr.io/miguelangel-nubla/mcp-grocy:latest
```

### Docker Compose (Recommended)

Create a `docker-compose.yml`:
```yaml
services:
  mcp-grocy:
    image: ghcr.io/miguelangel-nubla/mcp-grocy:latest
    env_file:
      - .env
    restart: unless-stopped
```

Then:
```bash
cp .env.example .env
# Edit .env with your configuration
docker compose up -d
```

## ⚙️ Configuration

### Quick Setup

1. **Get your Grocy API key:**
   - Open your Grocy instance → **User Settings** → **API Keys**
   - Create a new API key and copy it

2. **Configure the server:**
   ```bash
   cp .env.example .env
   # Edit .env with your GROCY_BASE_URL and GROCY_APIKEY_VALUE
   ```

3. **Essential variables:**
   - `GROCY_BASE_URL` - Your Grocy instance URL
   - `GROCY_APIKEY_VALUE` - Your Grocy API key

### Configuration Options

| Method | Use Case | Command |
|--------|----------|---------|
| **`.env` file** | Recommended for most users | `cp .env.example .env` |
| **Environment variables** | CI/CD, containers | `GROCY_BASE_URL=... GROCY_APIKEY_VALUE=... mcp-grocy` |
| **Tool configuration** | Customize functionality | Edit `tools` section in `mcp-grocy.yaml` |

📖 **For complete configuration reference:** See [Configuration Guide](src/resources/config.md)

## 🚀 Usage Modes

### Production Mode
Start with your real Grocy instance:
```bash
npm start
```

### Development/Testing Mode
Use mock data (no Grocy instance required):
```bash
npm run dev
```

### HTTP Server Mode  
Enable web-based access via HTTP/SSE:
```bash
# In .env: ENABLE_HTTP_SERVER=true
npm start
# Access via http://localhost:8080/mcp
```


## 📚 Documentation & Resources

| Resource | Purpose | When to Use |
|----------|---------|-------------|
| [📖 API Reference](src/resources/api-reference.md) | Complete tool documentation | Tool usage and examples |
| [⚙️ Configuration Guide](src/resources/config.md) | Advanced configuration reference | Detailed setup, presets, troubleshooting |
| [📋 .env.example](.env.example) | Environment configuration template | Copy and customize for your setup |
| [🧪 MCP Inspector](https://github.com/modelcontextprotocol/inspector) | Protocol debugging | Debug MCP interactions |

### 🆘 Troubleshooting

#### Common Issues

**"Connection refused" or "Cannot connect to Grocy"**
- Verify `GROCY_BASE_URL` is correct and accessible
- Check that your Grocy instance is running
- For HTTPS URLs, ensure SSL certificate is valid or disable verification with `GROCY_ENABLE_SSL_VERIFY=false`

**"Invalid API key" or "Authentication failed"**
- Verify your `GROCY_APIKEY_VALUE` is correct
- Check that the API key exists in your Grocy instance (User Settings → API Keys)
- Ensure the API key has proper permissions

**"Tool not found" errors**
- Check if the tool is enabled in your `mcp-grocy.yaml` file
- Verify you're using the correct tool names from the API reference

**Large response errors**
- Increase `REST_RESPONSE_SIZE_LIMIT` if you have many products/stock entries
- Consider disabling unused tools in `mcp-grocy.yaml`

#### Debug Mode

Enable detailed logging and use the MCP inspector:
```bash
# Launch MCP inspector for protocol debugging
npm run inspector

# Run with mock data for testing
npm run dev
```

## 🛠️ Development

### Prerequisites

- Node.js 18 or higher
- Grocy instance (optional with mock mode)

### Development Setup

```bash
# Clone and install
git clone https://github.com/miguelangel-nubla/mcp-grocy.git
cd mcp-grocy
npm install

# Configure for development
cp .env.example .env
# Edit .env with your settings (or use mock values)

# Build and run
npm run build
npm start
```

### Development Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Build TypeScript to JavaScript |
| `npm run watch` | Watch mode for development |
| `npm run dev` | Start with mock data (no Grocy needed) |
| `npm test` | Run test suite |
| `npm run test:watch` | Run tests in watch mode |
| `npm run inspector` | Launch MCP protocol inspector |

### Debugging

Use the MCP inspector to debug protocol interactions:
```bash
npm run inspector
```

This launches a web interface for testing MCP tools and viewing protocol messages.

## 🤝 Contributing

This is an **opinionated fork** focused on LLM usability and workflow reliability. Contributions are welcome but must align with the core philosophy:

### ✅ Welcome Contributions
- Bug fixes and reliability improvements
- Better error handling and validation  
- Documentation improvements
- Test coverage enhancements
- Performance optimizations

### ❌ Contributions Requiring Discussion
- New tool additions (must demonstrate clear LLM workflow benefits)
- API design changes that increase complexity
- Features that expose raw Grocy API behavior

### Development Workflow
1. Fork the repository
2. Create a feature branch
3. Make your changes with tests
4. Run `npm test` and ensure all tests pass  
5. Submit a pull request with clear description

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

**🏠 Made for reliable household management with LLMs**  
*Prioritizing workflow efficiency over feature completeness*
