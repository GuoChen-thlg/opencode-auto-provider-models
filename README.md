# opencode-auto-provider-models

> NOT an official project by the OpenCode team. No affiliation.

English | [简体中文](./README.zh-CN.md)

Local plugin for `opencode` that auto-syncs the model list for an existing custom provider.

Useful when:

- you already configured a custom provider in `opencode.jsonc`
- the provider exposes an OpenAI-compatible API
- the service supports `GET /models`
- you do not want to manually maintain `provider.<name>.models` whenever models change

## Behavior

The plugin runs once when `opencode` starts:

1. Read the target provider's `baseURL`
2. Request `${baseURL}/models`
3. Inject the returned models into `provider.<name>.models`
4. Preserve existing local model entries; if a model already exists locally, the local entry wins

If the remote request fails, the plugin only prints a warning and does not block `opencode` startup.

## Files

- `opencode-auto-provider-models.js`: plugin implementation

## Configuration

Install directly from GitHub:

```bash
npm install guochen-thlg/opencode-auto-provider-models
```

## Single provider

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider"
      }
    ]
  ]
}
```

## Multiple providers

Pass an array to `provider`:

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": ["custom-provider1", "custom-provider2"]
      }
    ]
  ]
}
```

Each entry can also be an object for per-provider overrides (e.g. a different `apiKeyEnv`):

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": [
          "custom-provider1",
          {
            "id": "custom-provider2",
            "apiKeyEnv": "CUSTOM_PROVIDER2_API_KEY"
          }
        ]
      }
    ]
  ]
}
```

## Filter models

If you only want to sync part of the remote model list:

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider1",
        "include": ["gpt-5.4", "gpt-5.4-mini", "glm-5"]
      }
    ]
  ]
}
```

`include` and `exclude` work with multiple providers too:

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": ["custom-provider1", "custom-provider2"],
        "exclude": ["internal-test-model"]
      }
    ]
  ]
}
```

## API key

If the provider's `options.apiKey` is not the final key to use, you can explicitly point the plugin to an environment variable:

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider1",
        "apiKeyEnv": "CUSTOM_PROVIDER1_API_KEY"
      }
    ]
  ]
}
```

## Remote Response Shape

The plugin reads the standard OpenAI-compatible format:

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-5.4",
      "object": "model"
    }
  ]
}
```

If the remote endpoint also returns the following fields, the plugin maps them when possible:

- `name`
- `input_modalities`
- `output_modalities`
- `modalities.input`
- `modalities.output`
- `context_window`
- `max_output_tokens`

## Notes

- Sync happens at startup, not as a hot reload during runtime
- Restart `opencode` after changing its config or upgrading the plugin package
- The plugin only injects the model list into runtime config and does not write back to `opencode.jsonc`

## Release

To publish a new version to GitHub Packages:

1. Update `version` in `package.json`
2. Commit and push the release changes
3. Publish the package:

```bash
npm publish --registry=https://npm.pkg.github.com
```

4. Create and push the version tag:

```bash
git tag -a v<version> -m "v<version>"
git push origin v<version>
```

5. Create a GitHub release for the same tag
6. If the repository workflow is enabled, publishing the release can also trigger the automated GitHub Packages publish job
