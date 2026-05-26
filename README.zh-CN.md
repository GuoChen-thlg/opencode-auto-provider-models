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

- `opencode-auto-provider-models.js`: 插件实现

## 配置方式

从 GitHub 直接安装：

```bash
npm install guochen-thlg/opencode-auto-provider-models
```

在你的 `~/.config/opencode/opencode.jsonc` 里加入：

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

如果你想只同步部分模型：

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "include": ["gpt-5.4", "gpt-5.4-mini", "glm-5"]
      }
    ]
  ]
}
```

如果要排除部分模型：

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "exclude": ["internal-test-model"]
      }
    ]
  ]
}
```

如果 provider 的 `options.apiKey` 不是最终要用的 key，也可以显式指定环境变量名：

```jsonc
{
  "plugin": [
    [
      "@guochen-thlg/opencode-auto-provider-models",
      {
        "provider": "custom-provider",
        "apiKeyEnv": "CUSTOM_PROVIDER_API_KEY"
      }
    ]
  ]
}
```

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
2. 提交并推送本次发布相关改动
3. 发布包：

```bash
npm publish --registry=https://npm.pkg.github.com
```

4. 创建并推送对应版本标签：

```bash
git tag -a v<version> -m "v<version>"
git push origin v<version>
```

5. 为同一个 tag 创建 GitHub release
6. 如果仓库 workflow 已启用，发布 release 时也可以触发自动发布 GitHub Packages 的任务
