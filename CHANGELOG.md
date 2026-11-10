## [2.9.1](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.9.0...v2.9.1) (2026-11-10)

### Bug Fixes

- **release:** enable npm OIDC trusted publishing and format CHANGELOG ([c6e0bb3](https://github.com/miguelangel-nubla/mcp-grocy/commit/c6e0bb377c57ddbe8bf1d2632bbe2485865e021c))

# [2.9.0](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.8.0...v2.9.0) (2026-11-10)

### Bug Fixes

- **api:** surface Grocy error_message and keep the API key out of logs ([2b23451](https://github.com/miguelangel-nubla/mcp-grocy/commit/2b234511356162bd4e6f48c4e589c9c67a5df0e8))
- **docker:** install and build on the native build platform ([eb560e1](https://github.com/miguelangel-nubla/mcp-grocy/commit/eb560e1c112e5afbecbb8f97a98b79fdf91c0cff))
- **household:** let Grocy default tracked times, drop ignored note params ([4e0d1aa](https://github.com/miguelangel-nubla/mcp-grocy/commit/4e0d1aac244dfae1db6cb3db3754999b8f78182c))
- **household:** validate tracked and done times before sending them to Grocy ([39d8de9](https://github.com/miguelangel-nubla/mcp-grocy/commit/39d8de9884742792bcdb79629c00e7452fef9975))
- **inventory:** drop note params Grocy never stores, offer only real product fields ([977caab](https://github.com/miguelangel-nubla/mcp-grocy/commit/977caab603253e105179ae3a68df8194012e61ce))
- **inventory:** rank whole-word product matches first in product lookup ([27e3bca](https://github.com/miguelangel-nubla/mcp-grocy/commit/27e3bca85c0af24ae3ea3446562d346f14f32f26))
- **inventory:** record spoiled product consumes as consume transactions ([28d297e](https://github.com/miguelangel-nubla/mcp-grocy/commit/28d297e7f13643732423f15911cefa29bed81a9e))
- **inventory:** use location entries endpoint, keep lot fields when splitting ([514c7f8](https://github.com/miguelangel-nubla/mcp-grocy/commit/514c7f8cddd6feaa6cfab9d95ebf9ab9f510a29d))
- **recipes:** correct consume and shopping endpoints, servings and meal plan handling ([d1a8606](https://github.com/miguelangel-nubla/mcp-grocy/commit/d1a86060051f481f567e38b7dcfcc21bba9601e2))
- **recipes:** keep only-check ingredient amounts in their own unit, weekly plan Mon-Sun ([eafa98d](https://github.com/miguelangel-nubla/mcp-grocy/commit/eafa98df4631d8908ccdee3ab1af8e0e1f64bbb2))
- **recipes:** recipes_management_create no longer sends an instructions column ([250ba7e](https://github.com/miguelangel-nubla/mcp-grocy/commit/250ba7e7f432921d80f4de0886214b454e2deeda))
- **server:** free closed HTTP sessions, gate cross-site origins, validate env overrides ([3207ebb](https://github.com/miguelangel-nubla/mcp-grocy/commit/3207ebb6ee503cc94462acbfff4d1d73e27ebbb5))
- **shopping:** enforce valid positive productId and product existence in shopping_list_add_item ([bf7083c](https://github.com/miguelangel-nubla/mcp-grocy/commit/bf7083ce254265da9c40a6d4cf88e5f61126b8a8))
- **shopping:** send only changed columns in shopping_list_update ([b4627ce](https://github.com/miguelangel-nubla/mcp-grocy/commit/b4627ce88269b759e166286ad7f1bc5bca9bb0f2))
- **shopping:** thermal print list param, validated product changes on update ([f860bcb](https://github.com/miguelangel-nubla/mcp-grocy/commit/f860bcbb431ea3272ee9106ccd8ed7b742baacdf))
- **system:** raw API tools off unless GROCY_ENABLE_DEV_TOOLS=true and refuse unit-unsafe writes ([c1723b4](https://github.com/miguelangel-nubla/mcp-grocy/commit/c1723b4086f5f27d118622d0b081faaecf513050))
- **system:** resolve encoded and dot-segment paths in the raw write guard ([9257650](https://github.com/miguelangel-nubla/mcp-grocy/commit/925765075bdeacff0514ae9190d08f5caa5c1f32))

### Features

- **config:** read GROCY_API_KEY and MCP_HTTP_ACCESS_TOKEN from <NAME>_FILE ([0a193f7](https://github.com/miguelangel-nubla/mcp-grocy/commit/0a193f7dc77e82a10efdaab690029dbefe815aa4))
- **inventory:** improve lookup typo ranking and enrich location stock responses ([af9e818](https://github.com/miguelangel-nubla/mcp-grocy/commit/af9e81850713f88caa09e297389a88be039f5ada))
- **inventory:** omit disabled tools from lookup instructions and tool descriptions ([7306940](https://github.com/miguelangel-nubla/mcp-grocy/commit/7306940a692331107471732bce3bb96020207222))
- **recipes:** recipes_ingredients_get/add/update/delete convert amounts to the stock unit ([2bd1754](https://github.com/miguelangel-nubla/mcp-grocy/commit/2bd1754e83402a6cb4fd00e2955887c9d5894879))
- **shopping:** add allow_note_only option to shopping_list_add_item ([c759b47](https://github.com/miguelangel-nubla/mcp-grocy/commit/c759b47f89ed3d270972c137af1b373850effdbe))

### Performance Improvements

- **inventory:** return compact summaries from consume tools ([c332cd0](https://github.com/miguelangel-nubla/mcp-grocy/commit/c332cd057a4e7499ecfbc96339600475c6916145))

# [2.8.0](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.7.2...v2.8.0) (2026-09-25)

### Bug Fixes

- accept numbers and booleans encoded as strings in tool arguments ([5dfbbc7](https://github.com/miguelangel-nubla/mcp-grocy/commit/5dfbbc799fdfde36255f6fcc3665e0113f36cf14))
- advertise tool parameter descriptions in tools/list ([0418bf5](https://github.com/miguelangel-nubla/mcp-grocy/commit/0418bf5be83428f19e52c2952e2f3e5bdd078d73))
- **tools:** normalize created_object_id and id to numbers in responses ([5f613d6](https://github.com/miguelangel-nubla/mcp-grocy/commit/5f613d6b6c87f860ac3a79e6d8a473a91d19d3a7))

### Features

- add recipes_mealplan_add_note tool for meal plan notes with sections ([e80aa65](https://github.com/miguelangel-nubla/mcp-grocy/commit/e80aa651e9653bf765d361a4ebc3d285d325a23e)), closes [#2](https://github.com/miguelangel-nubla/mcp-grocy/issues/2)

## [2.7.2](https://github.com/miguelangel-nubla/mcp-grocy/compare/v2.7.1...v2.7.2) (2026-09-10)

### Bug Fixes

- add prepack script, update release configs, and fix docker workflows ([c464c05](https://github.com/miguelangel-nubla/mcp-grocy/commit/c464c054ab4f3f420647196ded7454c60f3702fc))

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
