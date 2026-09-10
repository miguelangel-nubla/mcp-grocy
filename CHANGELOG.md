## [2.7.2](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.7.1...v2.7.2) (2026-09-10)


### Bug Fixes

* add prepack script, update release configs, and fix docker workflows ([c464c05](https://github.com/miguelangel-nubla/mcp-grocy/commit/c464c054ab4f3f420647196ded7454c60f3702fc))

## [2.7.1](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.7.0...v2.7.1) (2026-09-10)

### Bug Fixes

- refuse non-recipe meal plan entries in recipes_cooking_complete before writing ([172d1f0](https://github.com/miguelangel-nubla/mcp-grocy/commit/172d1f0089b1e401736b258cec652a30d90e0215)), closes [#2](https://github.com/miguelangel-nubla/mcp-grocy/issues/2)
- send correct meal plan payload in recipes_mealplan_add_recipe ([2b180b0](https://github.com/miguelangel-nubla/mcp-grocy/commit/2b180b02b58ab03db69efab727ee53ab88caa0d0)), closes [#2](https://github.com/miguelangel-nubla/mcp-grocy/issues/2)

# [2.7.0](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.6.0...v2.7.0) (2026-08-03)

### Bug Fixes

- **server:** fix strict null check in invokeTool and add pre-commit type-check ([affc8d0](https://github.com/miguelangel-nubla/mcp-grocy/commit/affc8d0015343e26fff4cf2b2abdf21c2c4a967a))

### Features

- add serialize_structured_to_content configuration to improve compatibility with legacy clients ([4371c18](https://github.com/miguelangel-nubla/mcp-grocy/commit/4371c18bd2b9038ab68c79403cd0e5f47619c23b))

# [2.6.0](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.5.0...v2.6.0) (2026-07-06)

### Bug Fixes

- reap idle streamable HTTP sessions to prevent McpServer leak ([c55b2c4](https://github.com/miguelangel-nubla/mcp-grocy/commit/c55b2c4808dac4ac5f0c55a45936c8f995d5efc3))

### Features

- add shopping_list_update_item tool to allow modifying list items ([dcbc974](https://github.com/miguelangel-nubla/mcp-grocy/commit/dcbc9746630667bbe89330bab7f7e9f84a3f060f))
- add shopping*lists*\* configurations to example yaml ([204f03d](https://github.com/miguelangel-nubla/mcp-grocy/commit/204f03dca8c9ca17f3cfc476274f0a5b844912c7))
- configure husky git hooks ([c8ac158](https://github.com/miguelangel-nubla/mcp-grocy/commit/c8ac1582f477c6dc074166b5a9753a06608c8007))
- enhance shopping list tools with manual item support and enriched metadata resolution ([a1a8ce3](https://github.com/miguelangel-nubla/mcp-grocy/commit/a1a8ce341b61e5b24a366ae74a95a2c92e93e07c))
- enrich shopping list tool responses with product and quantity unit details ([56bd553](https://github.com/miguelangel-nubla/mcp-grocy/commit/56bd553e17d913db1f2c61fc963a900f6477f45f))
- expand shopping module with get, update, and filtered list capabilities ([d7e0e5d](https://github.com/miguelangel-nubla/mcp-grocy/commit/d7e0e5d94962c1b4daf0835a91fc275c25188673))
- make productId optional in shopping list add tool ([a427e18](https://github.com/miguelangel-nubla/mcp-grocy/commit/a427e1832a9b70e579dae062c7665ec472656359))

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
