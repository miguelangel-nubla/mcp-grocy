# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Building and Development
- `npm run build` - Build TypeScript to JavaScript (outputs to `build/` directory)
- `npm run watch` - Watch mode for development (auto-rebuild on changes)
- `npm run prepare` - Runs build automatically (used by npm)
- `npm run prebuild` - Pre-build script that sets up version templating

### Testing
- `npm test` - Run all tests using Vitest
- `npm run test:watch` - Run tests in watch mode
- Tests are located in `tests/` directory with `.test.ts` files, plus co-located test files in `src/tools/`

### Development and Debugging
- `npm run inspector` - Launch MCP inspector for debugging protocol interactions
- Set `GROCY_BASE_URL` and `GROCY_API_KEY` environment variables before starting
- Use built executable: `./build/main.js` (runs from any directory after build)

### Scripts and Utilities
- `npm run update-api-docs` - Fetch and update Grocy API documentation
- `npm run docker-build` - Build Docker image
- `npm run check-tools` - Verify build tools and dependencies
- Various release management scripts for version handling and semantic releases

## Architecture Overview

### MCP Server Structure
This is a **Model Context Protocol (MCP) server** that wraps the Grocy API, built using `@modelcontextprotocol/sdk`. The architecture has been significantly refactored for improved modularity and performance.

**Main Entry Point**: `src/main.ts`
- Simplified startup process using `GrocyMcpServer.create()`
- Unified configuration loading from YAML and environment variables
- Comprehensive error handling with graceful shutdown

### Key Components

#### Core Server (`src/server/mcp-server.ts`)
- **`GrocyMcpServer`** - Main MCP server implementation with factory pattern
- Manages tool registration, validation, and execution
- Handles authentication and request/response processing
- Supports both stdio and HTTP/SSE transport protocols
- Implements acknowledgment token functionality for tool confirmations

#### HTTP Server (`src/server/http-server.ts`)
- Provides HTTP and SSE endpoints for MCP protocol
- Streamable HTTP transport on configurable port (default: 8080)
- Session management for stateful connections
- Endpoints:
  - `/` - Health check and service info
  - `/mcp` - POST for streamable HTTP transport
  - `/mcp/sse` - GET for Server-Sent Events
  - `/mcp/messages` - POST for SSE message handling

#### Configuration System (`src/config/`)
- **Dual configuration approach**: Environment variables + YAML file
- `src/config/index.ts` - Unified ConfigManager with Zod validation
- `src/config/yaml-config.ts` - YAML-specific configuration handling
- **Config file resolution**: Checks current directory first, then project root (supports running from any directory)
- Schema validation with detailed error reporting

#### Tool Module System (`src/tools/`)
**Modular architecture** with 5 tool categories:
- **`household/`** - Chores, tasks, batteries, equipment management
- **`inventory/`** - Stock, products, transactions, locations  
- **`recipes/`** - Recipe management, meal planning, cooking operations
- **`shopping/`** - Shopping lists and locations
- **`system/`** - System utilities, locations, units, development tools

**Module Structure** (each tool category):
- `index.ts` - Module exports and handler mapping
- `definitions.ts` - Tool definitions with input schemas
- `handlers.ts` - Implementation extending BaseToolHandler
- `handlers.test.ts` - Comprehensive test coverage

**Base Infrastructure**:
- `src/tools/base.ts` - BaseToolHandler with common functionality
- `src/tools/module-loader.ts` - Dynamic module loading with caching
- `src/tools/types.ts` - TypeScript interfaces for tools

#### API Client (`src/api/client.ts`)
- Simplified Axios-based client for Grocy API
- Automatic authentication with `GROCY-API-KEY` header
- SSL verification controls for development
- Request/response logging and error handling
- Response size limiting for memory protection

#### Utilities (`src/utils/`)
- `logger.ts` - Structured logging with categories and levels (uses stderr to avoid stdio interference)
- `errors.ts` - Centralized error handling with ErrorHandler and custom error types

### Authentication Model
- **API Key Only**: Uses `GROCY-API-KEY` header
- Environment variable: `GROCY_API_KEY`
- No Basic Auth or Bearer token support (intentionally simplified)

### Configuration Files

#### YAML Configuration (`mcp-grocy.yaml`)
Primary configuration file with three main sections:

```yaml
server:
  enable_http_server: true/false
  http_server_port: 8080

grocy:
  base_url: "https://your-grocy-instance"
  enable_ssl_verify: true/false
  response_size_limit: 10000

tools:
  tool_name:
    enabled: true/false
    ack_token: "optional_confirmation_token"
    # Tool-specific options
```

**Tool Categories Available**:
- **Inventory**: 14 tools (stock management, transactions, products)
- **Recipes**: 13 tools (management, meal planning, cooking)
- **Shopping**: 4 tools (lists, locations)
- **Household**: 8 tools (chores, tasks, batteries, equipment)
- **System**: 5 tools (locations, units, dev utilities)

#### Environment Variables
- `GROCY_API_KEY` - Your Grocy API key (required)
- `GROCY_BASE_URL` - Grocy instance URL (optional, defaults from YAML)
- `LOG_LEVEL` - Logging level (ERROR, WARN, INFO, DEBUG, TRACE)
- `LOG_CATEGORIES` - Comma-separated category filter
- `NODE_ENV` - Environment mode (development, production, test)

### Error Handling and Validation
- **Comprehensive error handling** via `src/utils/errors.js`
- **Input validation** using Zod schemas in tool definitions
- **Response size limiting** to prevent memory issues
- **Graceful degradation** with detailed error messages
- **Type-safe configuration** validation

### Acknowledgment Token System
- Optional confirmation tokens for destructive operations
- Configured per-tool in YAML configuration
- Automatically appended to successful tool responses
- Example: `ack_token: "PURPLE_TELESCOPE_SINGING"`

## Testing Strategy

Tests use **Vitest** framework with comprehensive coverage:

**Test Organization**:
- `tests/` - Integration and system tests
- `src/tools/*/handlers.test.ts` - Tool-specific unit tests
- Test files mirror source structure

**Coverage Areas**:
- API client functionality and error handling
- Configuration management and validation
- Tool module loading and execution
- Server initialization and protocol handling
- Production build verification

**Special Test Features**:
- Module loading tests for production builds
- Dynamic discovery of tool modules
- Configuration validation edge cases
- Error simulation and recovery

## Commit Convention

Uses **Conventional Commits** with commitlint configuration:
- Standard conventional commit types required
- Body and footer line length limits disabled for flexibility
- Semantic release automation based on commit messages
- Examples: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`

## Architecture Principles

1. **Modularity**: Clear separation between server, tools, config, and utilities
2. **Type Safety**: Comprehensive TypeScript usage with Zod runtime validation
3. **Performance**: Lazy loading, caching, and parallel processing where possible
4. **Reliability**: Extensive error handling and graceful fallbacks
5. **Configurability**: YAML-based configuration with environment override
6. **Testability**: Comprehensive test coverage with mocking and isolation
7. **Portability**: Can run from any directory after build