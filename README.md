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
>
> - The original wrapper exposes the entire Grocy API unprocessed, leading to context overload and LLM confusion
> - Grocy's API design choices and limitations cause error-prone interactions
> - Generic API exposure increases hallucination and near-miss results
>
> **This Fork's Philosophy:**
>
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
   # Edit .env with your GROCY_BASE_URL and GROCY_API_KEY

   # Run
   docker compose up -d
   ```

### Try Without Grocy

Test with mock data (no real Grocy instance needed):

```bash
# In .env file, any values work for mock mode
GROCY_BASE_URL=http://mock
GROCY_API_KEY=mock

npm install && npm run dev
```

## Requirements (Node.js & tooling)

- **Node.js:** **22 or newer** as declared in `package.json` `engines`. **GitHub Actions** and **`.nvmrc`** use **Node 22** for CI and local alignment.
- **Docker:** the default image is **`node:22-alpine`** so the container matches that major version (Home Assistant addon builds still override the base image).
- **TypeScript:** **5.9** in this repo; **TypeScript 6** is waiting on **`typescript-eslint`** to declare compatible peer support.
- **`npm audit`:** any remaining findings are often inside **nested tooling** (e.g. bundled `npm`), not application dependencies. Use `npm audit` / `npm audit fix` on a branch when refreshing the lockfile.
- **Quality checks:** `npm run lint` (ESLint), `npm run format:check` (Prettier), `npm test` (Vitest).

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
docker run -e GROCY_API_KEY=your_api_key -e GROCY_BASE_URL=http://your-grocy-instance ghcr.io/miguelangel-nubla/mcp-grocy:latest
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
   # Edit .env with your GROCY_BASE_URL and GROCY_API_KEY
   ```

3. **Essential variables:**
   - `GROCY_BASE_URL` - Your Grocy instance URL
   - `GROCY_API_KEY` - Your Grocy API key

### Configuration Options

| Method                    | Use Case                   | Command                                          |
| ------------------------- | -------------------------- | ------------------------------------------------ |
| **`.env` file**           | Recommended for most users | `cp .env.example .env`                           |
| **Environment variables** | CI/CD, containers          | `GROCY_BASE_URL=... GROCY_API_KEY=... mcp-grocy` |
| **Tool configuration**    | Customize functionality    | Edit `tools` section in `mcp-grocy.yaml`         |

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

| Resource                                                              | Purpose                            | When to Use                              |
| --------------------------------------------------------------------- | ---------------------------------- | ---------------------------------------- |
| [📖 API Reference](src/resources/api-reference.md)                    | Complete tool documentation        | Tool usage and examples                  |
| [⚙️ Configuration Guide](src/resources/config.md)                     | Advanced configuration reference   | Detailed setup, presets, troubleshooting |
| [📋 .env.example](.env.example)                                       | Environment configuration template | Copy and customize for your setup        |
| [🧪 MCP Inspector](https://github.com/modelcontextprotocol/inspector) | Protocol debugging                 | Debug MCP interactions                   |

**Bundled MCP resources** (from `resources/list`): `mcp-grocy://examples`, `mcp-grocy://response-format`, `mcp-grocy://config` — markdown docs shipped with the server. The URI scheme matches **`package.json` `name`** (previously some builds used `grocy-api://…`; update pinned URIs in clients or prompts if you relied on that).

### 🆘 Troubleshooting

#### Common Issues

**"Connection refused" or "Cannot connect to Grocy"**

- Verify `GROCY_BASE_URL` is correct and accessible
- Check that your Grocy instance is running
- For HTTPS URLs, ensure SSL certificate is valid or disable verification with `GROCY_ENABLE_SSL_VERIFY=false`

**"Invalid API key" or "Authentication failed"**

- Verify your `GROCY_API_KEY` is correct
- Check that the API key exists in your Grocy instance (User Settings → API Keys)
- Ensure the API key has proper permissions

**"Tool not found" errors**

- Check if the tool is enabled in your `mcp-grocy.yaml` file
- Verify you're using the correct tool names from the API reference

**Large response errors**

- Increase `REST_RESPONSE_SIZE_LIMIT` if you have many products/stock entries
- Consider disabling unused tools in `mcp-grocy.yaml`

**High memory usage / RAM grows over time (HTTP mode)**

- In HTTP mode the server automatically reaps idle MCP sessions (by default, after
  5 minutes with no requests), so clients that disconnect without `DELETE /mcp` —
  or that repeatedly reconnect with a new session — no longer leak per-session
  server instances. No action is required.
- Tune via `MCP_SESSION_IDLE_TIMEOUT_MS` / `MCP_SESSION_SWEEP_INTERVAL_MS` (or the
  `server.session_idle_timeout_ms` / `server.session_sweep_interval_ms` YAML keys):
  lower the timeout on memory-constrained hosts, raise it if a client legitimately
  idles for long periods between calls.
- For the lowest overhead, prefer an MCP client that reuses its `Mcp-Session-Id`
  across requests and sends `DELETE /mcp` when it disconnects.

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

- Node.js 22 or newer (see **Requirements** above)
- Grocy instance (optional: use placeholder URLs/keys in `.env` for local runs)

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

| Command                  | Description                                                                                                                         |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`          | Build TypeScript to JavaScript                                                                                                      |
| `npm start`              | Run the built server (`build/main.js`)                                                                                              |
| `npm run dev`            | Build, then run (use mock `.env` for local testing)                                                                                 |
| `npm run watch`          | Watch mode for development                                                                                                          |
| `npm test`               | Run test suite                                                                                                                      |
| `npm run test:watch`     | Run tests in watch mode                                                                                                             |
| `npm run inspector`      | Launch MCP protocol inspector                                                                                                       |
| `npm run dev:mcp-tef`    | Run [mcp-tef](https://github.com/StacklokLabs/mcp-tef) locally (needs **uv** + **Ollama**) for tool-description / similarity checks |
| `npm run report:mcp-tef` | One command: build, temporary mcp-grocy HTTP + mcp-tef, write `reports/mcp-tef/<timestamp>/` (similarity JSON + `SUMMARY.md`)       |

### Optional: mcp-tef (local tool evaluation)

When you change tool descriptions or add tools, you can run [StacklokLabs/mcp-tef](https://github.com/StacklokLabs/mcp-tef) against **Ollama** (no cloud API key required):

1. Install [uv](https://docs.astral.sh/uv/) and start Ollama; pull a small model, e.g. `ollama pull llama3.2:3b`.
2. Build and start **mcp-grocy over HTTP** in another terminal (SSE endpoint for mcp-tef):

   ```bash
   npm run build
   MCP_HTTP_TRANSPORT_ONLY=true ENABLE_HTTP_SERVER=true HTTP_SERVER_PORT=8790 npm start
   ```

3. Start mcp-tef:

   ```bash
   npm run dev:mcp-tef
   ```

4. Open `http://127.0.0.1:8000/docs` and point workflows at **`http://127.0.0.1:8790/mcp/sse`** (or your port).

The first run clones mcp-tef into `.cache/mcp-tef` (ignored by git). Override the Ollama model with `MCP_TEF_OLLAMA_MODEL`, the listen port with `MCP_TEF_PORT`, or the clone ref with `MCP_TEF_REF`.

**One-shot report (no manual API calls):**

```bash
npm run report:mcp-tef
```

Writes under `reports/mcp-tef/<timestamp>/`:

- **`REPORT.md`** — human-readable: tools by domain, flagged pairs as a **markdown table** (short tool names, similarity %).
- **`REPORT.html`** — same pairs in a simple table; open in a browser if you prefer.
- **`SUMMARY.md`** — one-screen pointer + counts.
- **`similarity.json`** — full API response (matrix, composite ids).

Uses ephemeral ports **8792** (mcp-grocy) and **8020** (mcp-tef) by default (`MCP_GROCY_HTTP_PORT`, `MCP_TEF_REPORT_PORT` to override). If you do not set `MCP_GROCY_YAML`, the script drops a temporary `mcp-grocy.yaml` next to the report by copying `mcp-grocy.yaml.example` with every `enabled: false` flipped to `true`, so `tools/list` is complete for analysis.

Add `--with-recommendations` for LLM suggestions on flagged pairs, or `--quality` for per-tool quality scoring (slow; both need Ollama). The report calls mcp-tef’s similarity API with **`transport: sse`** against `/mcp/sse` (current [mcp-tef](https://github.com/StacklokLabs/mcp-tef) request shape). Default similarity threshold is **0.9** (set `SIMILARITY_THRESHOLD=0.85` for the previous, noisier report).

Optional per-tool **`title`** and **`meta`** (→ MCP `_meta`) can be set in definitions when they add real signal; otherwise clients use **`name`** only.

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
_Prioritizing workflow efficiency over feature completeness_
