# Changelog

All notable changes to this project will be documented in this file.

## [0.1.11] - 2026-07-16

- fix: include suffix keys in enrich cache for provider/org model ID matching
- fix: enrich name overrides modelId fallback when remote lacks name field
- fix: enrich modalities/limit overrides plugin defaults when remote lacks them
- test: add suffix matching test with xiaomi mimo models

## [0.1.10] - 2026-07-16

- fix: include `enrichment.js` in package files so ESM import resolves correctly

## [0.1.9] - 2026-07-16

- feat: add optional model enrichment from `https://models.dev/models.json` (configurable via `enrich` option, disabled by default)
- refactor: `enrichment.js` now exports `fetchAndBuildEnrichCache()` + `lookupEnrichment()` for batch processing
- test: add 4 test cases for enrich enable/disable/failure/override behavior
- docs: add enrichment configuration to README (EN and ZH)

## [0.1.8] - 2026-06-19

- fix: reduce `DEFAULT_TIMEOUT` from 5000ms to 1000ms to speed up startup when provider is unreachable
- fix: add overall startup timeout (`DEFAULT_STARTUP_TIMEOUT` 3000ms, configurable via `startupTimeout`) to prevent config hook from blocking UI
- feat: deduplicate concurrent `/models` requests for same `(baseURL, apiKey)` to avoid redundant network calls

## [0.1.7] - 2026-06-19

- refactor: inline `fetchWithTimeout` to reduce indirection and add structured logging with `[auto-provider-models]` prefix
- add: error logging for HTTP errors, timeouts, network errors, and invalid response bodies
- test: add test coverage for provider hook not returned in single/multi-provider mode

## [0.1.6] - 2026-05-27

- add configurable `timeout` (default 5000ms) to prevent slow provider from blocking startup
- add configurable `cacheTTL` to skip repeated `/models` fetches within TTL window
- fix: startup would hang indefinitely if provider `/models` endpoint is unreachable

## [0.1.4] - 2026-05-21

- update GitHub Actions workflows to use Node 24
- force JavaScript actions onto the Node 24 runtime to avoid Node 20 deprecation warnings
- harden the release publish workflow so an already-published version is treated as success

## [0.1.3] - 2026-05-21

- add duplicate publish guard to the GitHub Packages release workflow
- add a minimal smoke test workflow for push and pull request events
- add `CHANGELOG.md` to track released changes

## [0.1.2] - 2026-05-21

- add MIT `LICENSE`
- add minimal GitHub Release triggered workflow for GitHub Packages publishing
- document the automated release trigger in English and Simplified Chinese README files

## [0.1.1] - 2026-05-21

- add GitHub Packages installation and authentication instructions
- document the release process in English and Simplified Chinese README files

## [0.1.0] - 2026-05-21

- initial release of the OpenCode provider model sync plugin
- publish `@guochen-thlg/opencode-auto-provider-models` to GitHub Packages
- add English and Simplified Chinese README documentation
