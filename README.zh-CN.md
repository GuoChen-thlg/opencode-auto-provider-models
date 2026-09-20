# opencode-auto-provider-models

> 该项目不是 OpenCode 团队官方开发，且不存在任何隶属关系。

[English](./README.md) | 简体中文

给现有 `opencode` 自定义 provider 自动同步模型列表的本地插件。

适用场景：

- 你已经在 `opencode.jsonc` 里配置了自定义 provider
- provider 是 OpenAI 兼容接口
- 该服务支持 `GET /models`
- 你不想每次新增模型都手工改 `provider.<name>.models`

## 行为

插件在 `opencode` 启动时执行一次：

1. 读取目标 provider 的 `baseURL`
2. 请求 `${baseURL}/models`
3. 把返回的模型注入到 `provider.<name>.models`
4. 保留你原有的手工配置项；如果已有同名模型，手工配置优先

如果远端拉取失败，插件只会打印警告，不会阻止 `opencode` 启动。

## 文件

- `opencode-auto-provider-models.js`: OpenCode v1 插件实现
- `opencode-auto-provider-models-v2.js`: OpenCode v2 插件实现（`/v2` 入口）

## 安装

在 opencode 项目中安装本包：

```bash
# 从 GitHub Packages（需要 ~/.npmrc 作用域 registry 配置）：
#   @guochen-thlg:registry=https://npm.pkg.github.com
npm install @guochen-thlg/opencode-auto-provider-models
bun install @guochen-thlg/opencode-auto-provider-models

# 或者从 GitHub 直接安装（无需 registry 配置）：
npm install guochen-thlg/opencode-auto-provider-models
bun install guochen-thlg/opencode-auto-provider-models
```

然后在 `opencode.jsonc` 中添加插件配置。

## OpenCode v2

OpenCode v2 使用全新的插件 API，插件从 `plugins` 数组加载。v2 入口位于
`@guochen-thlg/opencode-auto-provider-models/v2` 子路径（或本地
`./opencode-auto-provider-models-v2.js` 文件）：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "@guochen-thlg/opencode-auto-provider-models/v2",
      "options": {
        "provider": "custom-provider"
      }
    }
  ]
}
```

使用本地 checkout：

```jsonc
{
  "plugins": [
    {
      "package": "./opencode-auto-provider-models-v2.js",
      "options": {
        "provider": "custom-provider"
      }
    }
  ]
}
```

v2 入口从运行时 catalog 读取 provider 的 `settings.baseURL`，因此已有 v1 风格
provider（其 `options.baseURL` 会被规范化为 v2 的 `settings`）无需额外配置即可
工作。下面的所有选项同样适用。模型通过 `ctx.catalog.transform` 注入，写入原生
v2 模型结构（`capabilities.tools`、`capabilities.input`、`capabilities.output`、
`limit`、`family`），且已有 catalog 条目始终优先于远端数据。

## 配置方式

### 单个供应商

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

### 多个供应商

`provider` 直接传数组即可：

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

每个条目也支持对象形式，以覆盖单个供应商的专属配置（如不同的 `apiKeyEnv`）：

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

### 过滤模型

如果你想只同步部分模型：

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

`include` 和 `exclude` 对多供应商同样生效：

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

### API 密钥

如果 provider 的 `options.apiKey` 不是最终要用的 key，也可以显式指定环境变量名：

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

## 启动性能

插件在每次启动时都会对每个 provider 的 `${baseURL}/models` 发起 HTTP 请求。以下选项可以控制这一行为：

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "timeout": 5000,
        "cacheTTL": 300000
      }
    ]
  ]
}
```

| 选项 | 默认值 | 说明 |
|---|---|---|
| `timeout` | `5000` | 等待 `/models` 响应的最长时间（毫秒）。防止慢响应或不可用的 provider 阻塞启动。 |
| `cacheTTL` | `0` | 复用上次拉取的模型列表的时间（毫秒）。设为 `300000`（5 分钟）可在大部分重启时跳过请求。`0` 表示不缓存。 |

## 模型增强（可选）

插件可以额外从 `https://models.dev/models.json` 获取模型的补充元数据（如描述、家族、能力等），并自动填充到模型条目中缺失的字段。

这是一个可选功能，默认关闭。启用方式：

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "enrich": true
      }
    ]
  ]
}
```

启用后，插件会：
1. 启动时请求 `https://models.dev/models.json`
2. 将返回的元数据与远程 provider 返回的模型 ID 进行匹配（精确匹配 -> 后缀匹配 -> 尾部匹配）
3. 对匹配到的模型，补充以下缺失字段：`name`, `description`, `family`, `reasoning`, `attachment`, `tool_call`, `structured_output`, `temperature`, `knowledge`, `open_weights`, `release_date`, `last_updated`, `modalities`, `limit`

如果 models.dev 请求失败，插件只会打印警告，不影响正常模型同步。

## 远端返回格式

插件按 OpenAI 兼容格式读取：

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

如果远端额外返回下面这些字段，插件会尽量映射：

- `name`
- `input_modalities`
- `output_modalities`
- `modalities.input`
- `modalities.output`
- `context_window`
- `max_output_tokens`

## 注意

- 这是启动时同步，不是运行中的热更新
- 修改 `opencode` 配置或升级插件包后，需要退出并重启 `opencode`
- 该插件只负责把模型列表注入到运行时配置，不会回写你的 `opencode.jsonc`

## 发布

发布新版本到 GitHub Packages 的步骤：

1. 更新 `package.json` 里的 `version`
2. 更新 `CHANGELOG.md`
3. 提交并推送改动到 `main`
4. 创建并推送版本标签（会自动触发 GitHub Actions 创建 release + 发布包）：

```bash
git tag -a v<version> -m "v<version>"
git push origin v<version>
```
