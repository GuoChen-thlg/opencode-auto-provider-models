# opencode-auto-provider-models

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

Install the package first:

```bash
npm install opencode-auto-provider-models
```

Add this to your `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    [
      "opencode-auto-provider-models",
      {
        "provider": "custom-provider"
      }
    ]
  ]
}
```

If you only want to sync part of the remote model list:

```jsonc
{
  "plugin": [
    [
      "opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "include": ["gpt-5.4", "gpt-5.4-mini", "glm-5"]
      }
    ]
  ]
}
```

If you want to exclude specific models:

```jsonc
{
  "plugin": [
    [
      "opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "exclude": ["internal-test-model"]
      }
    ]
  ]
}
```

If the provider's `options.apiKey` is not the final key to use, you can explicitly point the plugin to an environment variable:

```jsonc
{
  "plugin": [
    [
      "opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "apiKeyEnv": "CUSTOM_PROVIDER_API_KEY"
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
