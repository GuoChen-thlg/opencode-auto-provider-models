import { describe, it, before, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import plugin from "../opencode-auto-provider-models.js"

const PROVIDER_A_MODELS = {
  data: [
    { id: "claude-3-opus", name: "Claude 3 Opus", context_window: 200000, max_output_tokens: 4096 },
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", context_window: 200000 },
    { id: "claude-3-haiku", name: "Claude 3 Haiku", context_window: 200000 },
  ],
}

const PROVIDER_B_MODELS = {
  data: [
    { id: "gpt-4o", name: "GPT-4o", context_window: 128000, max_output_tokens: 16384 },
    { id: "o1-preview", name: "O1 Preview", context_window: 200000, max_output_tokens: 32768 },
    { id: "o3-mini", name: "O3 Mini", context_window: 200000, max_output_tokens: 65536 },
    { id: "deepseek-r1", name: "DeepSeek R1", context_window: 131072 },
    { id: "glm-5", name: "GLM-5", context_window: 131072 },
  ],
}

function createMockServer(modelsPayload, authToken) {
  return http.createServer((req, res) => {
    if (authToken) {
      const provided = req.headers.authorization
      if (!provided || provided !== `Bearer ${authToken}`) {
        res.writeHead(401)
        res.end(JSON.stringify({ error: "unauthorized" }))
        return
      }
    }

    if (req.url === "/v1/models" || req.url === "/models") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify(modelsPayload))
    } else {
      res.writeHead(404)
      res.end(JSON.stringify({ error: "not found" }))
    }
  })
}

async function withServer(server, port) {
  return new Promise((resolve) => server.listen(port, resolve))
}

async function stopServer(server) {
  return new Promise((resolve) => server.close(resolve))
}

function getPort() {
  return 18900 + Math.floor(Math.random() * 1000)
}

describe("integration with real HTTP servers", () => {
  let serverA
  let serverB
  let portA
  let portB

  before(async () => {
    portA = getPort()
    portB = getPort()
    serverA = createMockServer(PROVIDER_A_MODELS)
    serverB = createMockServer(PROVIDER_B_MODELS, "sk-secret")
    await Promise.all([withServer(serverA, portA), withServer(serverB, portB)])
  })

  after(async () => {
    await Promise.all([stopServer(serverA), stopServer(serverB)])
  })

  it("syncs models for a single provider pointing to a real server", async () => {
    const result = await plugin(null, { provider: "provider-a" })
    const config = {
      provider: {
        "provider-a": { options: { baseURL: `http://127.0.0.1:${portA}/v1` } },
      },
    }
    await result.config(config)

    assert.ok(config.provider["provider-a"].models["claude-3-opus"])
    assert.equal(config.provider["provider-a"].models["claude-3-opus"].name, "Claude 3 Opus")
    assert.equal(config.provider["provider-a"].models["claude-3-opus"].limit.context, 200000)
    assert.equal(config.provider["provider-a"].models["claude-3-opus"].limit.output, 4096)
  })

  it("syncs models for multiple providers from different real servers", async () => {
    const result = await plugin(null, {
      provider: ["provider-a", "provider-b"],
    })
    const config = {
      provider: {
        "provider-a": { options: { baseURL: `http://127.0.0.1:${portA}/v1` } },
        "provider-b": { options: { baseURL: `http://127.0.0.1:${portB}/v1`, apiKey: "sk-secret" } },
      },
    }
    await result.config(config)

    assert.equal(config.provider["provider-a"].models["claude-3-opus"].name, "Claude 3 Opus")
    assert.equal(config.provider["provider-b"].models["gpt-4o"].name, "GPT-4o")
    assert.equal(config.provider["provider-b"].models["o1-preview"].reasoning, true)
    assert.equal(config.provider["provider-b"].models["deepseek-r1"].reasoning, true)
  })

  it("uses per-provider apiKeyEnv override with real server", async () => {
    const envBak = process.env.MY_CUSTOM_KEY
    process.env.MY_CUSTOM_KEY = "sk-secret"

    const result = await plugin(null, {
      provider: [
        { id: "provider-b", apiKeyEnv: "MY_CUSTOM_KEY" },
      ],
    })
    const config = {
      provider: {
        "provider-b": { options: { baseURL: `http://127.0.0.1:${portB}/v1`, apiKey: "wrong-key" } },
      },
    }
    await result.config(config)

    assert.ok(config.provider["provider-b"].models["gpt-4o"])

    if (envBak === undefined) delete process.env.MY_CUSTOM_KEY
    else process.env.MY_CUSTOM_KEY = envBak
  })

  it("handles non-array server response gracefully", async () => {
    const server = createMockServer({ data: "not-an-array" })
    const port = getPort()
    await withServer(server, port)

    const warnings = []
    const origWarn = console.warn
    console.warn = (msg) => warnings.push(msg)

    const result = await plugin(null, { provider: "broken" })
    const config = {
      provider: {
        broken: { options: { baseURL: `http://127.0.0.1:${port}/v1` } },
      },
    }
    await result.config(config)

    assert.ok(warnings.some((w) => w.includes("failed to sync")))

    console.warn = origWarn
    await stopServer(server)
  })

  it("one server failure does not affect the other", async () => {
    const deadPort = getPort()
    const result = await plugin(null, {
      provider: ["provider-a", "provider-b"],
    })
    const config = {
      provider: {
        "provider-a": { options: { baseURL: `http://127.0.0.1:${deadPort}/v1` } },
        "provider-b": { options: { baseURL: `http://127.0.0.1:${portB}/v1`, apiKey: "sk-secret" } },
      },
    }

    const warnings = []
    const origWarn = console.warn
    console.warn = (msg) => warnings.push(msg)

    await result.config(config)

    assert.ok(warnings.some((w) => w.includes("provider-a")))
    assert.ok(config.provider["provider-b"].models["gpt-4o"])

    console.warn = origWarn
  })

  it("preserves existing local models when syncing from real server", async () => {
    const result = await plugin(null, { provider: "provider-a" })
    const config = {
      provider: {
        "provider-a": {
          options: { baseURL: `http://127.0.0.1:${portA}/v1` },
          models: {
            "local-model": { name: "Local Kept" },
          },
        },
      },
    }
    await result.config(config)

    assert.ok(config.provider["provider-a"].models["local-model"])
    assert.equal(config.provider["provider-a"].models["local-model"].name, "Local Kept")
    assert.ok(config.provider["provider-a"].models["claude-3-opus"])
  })
})
