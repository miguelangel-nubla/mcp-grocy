# [2.5.0](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.4.4...v2.5.0) (2026-03-30)

### Bug Fixes

- add read permissions for contents in release workflow to support nested publish-docker job ([5a055a6](https://github.com/miguelangel-nubla/mcp-grocy/commit/5a055a62cf07fa3f0f03d4319e485350c111804a))
- improve test build isolation and commit-specific tagging ([b1875cc](https://github.com/miguelangel-nubla/mcp-grocy/commit/b1875ccc080111c6d56700aab9c493e418d155be))

### Features

- improve tool call error handling, and implement multi-server shutdown management ([4d19cfb](https://github.com/miguelangel-nubla/mcp-grocy/commit/4d19cfb35dc238a41a92d2fba505998b6a59e1ae))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Release notes are appended automatically by [semantic-release](https://semantic-release.gitbook.io/) using `@semantic-release/changelog`.

## [Unreleased]

### ⚠️ Breaking Changes

- **MCP resource URIs** use the **`mcp-grocy://`** scheme (from `package.json` `name`, generated into `SERVER_NAME` at build time). Bundled docs: `mcp-grocy://examples`, `mcp-grocy://response-format`, `mcp-grocy://config`. Clients, prompts, or bookmarks that used **`grocy-api://…`** must be updated.

### Added

- **MCP tool `annotations.readOnlyHint: true`** on read-only tools (inventory/recipes/shopping/household/system getters and lookups only—no `*_print_*`, dev tools, or mutating calls). Optional hint for clients; not a security boundary.
