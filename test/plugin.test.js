import { describe, it, mock, before, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import plugin from "../opencode-auto-provider-models.js"

// ---- helpers ----

const MODELS_PAYLOAD = {
  data: [
    { id: "gpt-4o", name: "GPT-4o", context_window: 128000 },
    { id: "o1-preview", name: "O1 Preview", context_window: 200000, max_output_tokens: 32768 },
    { id: "deepseek-chat", name: "DeepSeek Chat" },
    { id: "internal-test", name: "Internal Test" },
  ],
}

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

function mockFetch(status = 200, payload = MODELS_PAYLOAD) {
  return mock.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  }))
}

function makeConfig(providerId, overrides = {}) {
  return {
    provider: {
      [providerId]: {
        options: {
          baseURL: "https://api.example.com/v1",
          apiKey: "sk-default",
          ...overrides.options,
        },
        ...(overrides.models ? { models: overrides.models } : {}),
      },
    },
  }
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

// ---- unit tests (mocked fetch) ----

describe("plugin entry", () => {
  before(() => mock.method(globalThis, "fetch"))
  after(() => mock.restoreAll())

  it("returns config hook", async () => {
    const result = await plugin(null, { provider: "test" })
    assert.equal(typeof result, "object")
    assert.equal(typeof result.config, "function")
  })

  it("warns when provider option is missing", async () => {
    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))

    const result = await plugin(null, {})
    await result.config(makeConfig("test"))

    assert.ok(warnings.some((w) => w.includes("missing required option")))
  })

  it("warns when provider not found in config", async () => {
    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))

    const result = await plugin(null, { provider: "nonexistent" })
    await result.config(makeConfig("test"))

    assert.ok(warnings.some((w) => w.includes("provider not found")))
  })

  it("warns when baseURL is missing", async () => {
    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))

    const result = await plugin(null, { provider: "test" })
    await result.config({ provider: { test: { options: {} } } })

    assert.ok(warnings.some((w) => w.includes("missing baseURL")))
  })

  it("syncs models for a single provider (string)", async () => {
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, { provider: "test" })
    const config = makeConfig("test")
    await result.config(config)

    assert.equal(config.provider.test.models["gpt-4o"].name, "GPT-4o")
    assert.equal(config.provider.test.models["o1-preview"].reasoning, true)
    assert.equal(config.provider.test.models["internal-test"].name, "Internal Test")
  })

  it("syncs models for multiple providers (array)", async () => {
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, {
      provider: ["provider-a", "provider-b"],
    })
    const config = {
      provider: {
        "provider-a": { options: { baseURL: "https://a.example.com/v1", apiKey: "sk-a" } },
        "provider-b": { options: { baseURL: "https://b.example.com/v1", apiKey: "sk-b" } },
      },
    }
    await result.config(config)

    assert.ok(config.provider["provider-a"].models["gpt-4o"])
    assert.ok(config.provider["provider-b"].models["gpt-4o"])
  })

  it("supports mixed array of string and object entries", async () => {
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const envBak = process.env.CUSTOM_API_KEY
    process.env.CUSTOM_API_KEY = "sk-override"

    const result = await plugin(null, {
      provider: [
        "provider-a",
        { id: "provider-b", apiKeyEnv: "CUSTOM_API_KEY" },
      ],
    })
    const config = {
      provider: {
        "provider-a": { options: { baseURL: "https://a.example.com/v1", apiKey: "sk-a" } },
        "provider-b": { options: { baseURL: "https://b.example.com/v1", apiKey: "sk-b" } },
      },
    }
    await result.config(config)

    assert.ok(config.provider["provider-a"].models["gpt-4o"])
    assert.ok(config.provider["provider-b"].models["gpt-4o"])

    if (envBak === undefined) delete process.env.CUSTOM_API_KEY
    else process.env.CUSTOM_API_KEY = envBak
  })

  it("applies include filter", async () => {
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, {
      provider: "test",
      include: ["gpt-4o", "o1-preview"],
    })
    const config = makeConfig("test")
    await result.config(config)

    assert.ok(config.provider.test.models["gpt-4o"])
    assert.ok(config.provider.test.models["o1-preview"])
    assert.equal(config.provider.test.models["deepseek-chat"], undefined)
  })

  it("applies exclude filter", async () => {
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, {
      provider: "test",
      exclude: ["internal-test"],
    })
    const config = makeConfig("test")
    await result.config(config)

    assert.ok(config.provider.test.models["gpt-4o"])
    assert.equal(config.provider.test.models["internal-test"], undefined)
  })

  it("preserves existing local model entries", async () => {
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, { provider: "test" })
    const config = makeConfig("test", {
      models: { "local-model": { name: "Local Model" } },
    })
    await result.config(config)

    assert.ok(config.provider.test.models["local-model"])
    assert.equal(config.provider.test.models["local-model"].name, "Local Model")
  })

  it("handles fetch failure gracefully", async () => {
    const fetchMock = mockFetch(500)
    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, { provider: "test" })
    const config = makeConfig("test")
    await result.config(config)

    assert.ok(warnings.some((w) => w.includes("failed to sync")))
  })

  it("handles non-array response gracefully", async () => {
    const fetchMock = mockFetch(200, { data: "not-an-array" })
    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, { provider: "test" })
    const config = makeConfig("test")
    await result.config(config)

    assert.ok(warnings.some((w) => w.includes("failed to sync")))
  })

  it("one provider failure does not affect others", async () => {
    const failFetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }))
    const okFetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => MODELS_PAYLOAD,
    }))
    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))

    let callCount = 0
    globalThis.fetch.mock.mockImplementation(() => {
      callCount++
      return callCount === 1 ? failFetch() : okFetch()
    })

    const result = await plugin(null, {
      provider: ["broken", "working"],
    })
    const config = {
      provider: {
        broken: { options: { baseURL: "https://broken.example.com/v1" } },
        working: { options: { baseURL: "https://working.example.com/v1" } },
      },
    }
    await result.config(config)

    assert.ok(warnings.some((w) => w.includes("broken")))
    assert.ok(config.provider.working.models["gpt-4o"])
  })

  it("uses timeout option and warns on slow request", async () => {
    globalThis.fetch.mock.mockImplementation(async (_url, opts) => {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new DOMException("signal timed out", "TimeoutError"))
        }, 20_000)
        opts?.signal?.addEventListener("abort", () => {
          clearTimeout(timer)
          reject(new DOMException("The operation was aborted", "AbortError"))
        })
      })
    })

    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))

    const result = await plugin(null, { provider: "test", timeout: 50 })
    const config = makeConfig("test")
    await result.config(config)

    assert.ok(warnings.some((w) => w.includes("failed to sync")))
  })

  function makeCacheConfig(providerId, overrides = {}) {
    return {
      provider: {
        [providerId]: {
          options: {
            baseURL: `https://${providerId}.example.com/v1`,
            apiKey: "sk-default",
            ...overrides.options,
          },
        },
      },
    }
  }

  it("caches models when cacheTTL is set", async () => {
    let fetchCount = 0
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => {
      fetchCount++
      return fetchMock()
    })

    const result = await plugin(null, { provider: "cache-test", cacheTTL: 60000 })
    const config = makeCacheConfig("cache-test")
    await result.config(config)
    assert.equal(fetchCount, 1)
    assert.ok(config.provider["cache-test"].models["gpt-4o"])

    const config2 = makeCacheConfig("cache-test")
    await result.config(config2)
    assert.equal(fetchCount, 1)
    assert.ok(config2.provider["cache-test"].models["gpt-4o"])
  })

  it("cache miss when cacheTTL expires", async () => {
    let fetchCount = 0
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => {
      fetchCount++
      return fetchMock()
    })

    const result = await plugin(null, { provider: "cache-expire", cacheTTL: 5 })
    const config = makeCacheConfig("cache-expire")
    await result.config(config)
    assert.equal(fetchCount, 1)

    await new Promise((r) => setTimeout(r, 10))

    const config2 = makeCacheConfig("cache-expire")
    await result.config(config2)
    assert.equal(fetchCount, 2)
  })

  it("does not cache when cacheTTL is 0", async () => {
    let fetchCount = 0
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => {
      fetchCount++
      return fetchMock()
    })

    const result = await plugin(null, { provider: "no-cache" })
    const config = makeCacheConfig("no-cache")
    await result.config(config)
    assert.equal(fetchCount, 1)

    const config2 = makeCacheConfig("no-cache")
    await result.config(config2)
    assert.equal(fetchCount, 2)
  })

  it("derives reasoning flag for known reasoning models", async () => {
    const fetchMock = mockFetch(200, {
      data: [
        { id: "o1-preview" },
        { id: "o3-mini" },
        { id: "deepseek-r1" },
        { id: "glm-5" },
        { id: "gpt-4o" },
      ],
    })
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, { provider: "test" })
    const config = makeConfig("test")
    await result.config(config)

    assert.equal(config.provider.test.models["o1-preview"].reasoning, true)
    assert.equal(config.provider.test.models["o3-mini"].reasoning, true)
    assert.equal(config.provider.test.models["deepseek-r1"].reasoning, true)
    assert.equal(config.provider.test.models["glm-5"].reasoning, true)
    assert.equal(config.provider.test.models["gpt-4o"].reasoning, undefined)
  })

  it("enrich fills missing fields from models.dev when enabled", async () => {
    const ENRICH_PAYLOAD = {
      "gpt-4o": {
        id: "gpt-4o",
        description: "Most capable GPT-4 model",
        family: "gpt-4",
        reasoning: false,
        tool_call: true,
        structured_output: true,
        knowledge: "2024-01",
        open_weights: false,
      },
      "deepseek-chat": {
        id: "deepseek-chat",
        description: "DeepSeek chat model",
        family: "deepseek",
        reasoning: false,
        tool_call: true,
      },
    }

    let fetchCount = 0
    globalThis.fetch.mock.mockImplementation(async (url) => {
      fetchCount++
      if (url === "https://models.dev/models.json") {
        return { ok: true, status: 200, json: async () => ENRICH_PAYLOAD }
      }
      return mockFetch()()
    })

    const result = await plugin(null, { provider: "test", enrich: true })
    const config = makeConfig("test")
    await result.config(config)

    assert.equal(fetchCount, 2)
    // fields from remote
    assert.equal(config.provider.test.models["gpt-4o"].name, "GPT-4o")
    assert.equal(config.provider.test.models["gpt-4o"].modalities.input.length, 1)
    // fields filled by enrich
    assert.equal(config.provider.test.models["gpt-4o"].description, "Most capable GPT-4 model")
    assert.equal(config.provider.test.models["gpt-4o"].family, "gpt-4")
    assert.equal(config.provider.test.models["gpt-4o"].tool_call, true)
    assert.equal(config.provider.test.models["gpt-4o"].structured_output, true)
    // deepseek-chat also enriched
    assert.equal(config.provider.test.models["deepseek-chat"].description, "DeepSeek chat model")
    assert.equal(config.provider.test.models["deepseek-chat"].family, "deepseek")
  })

  it("enrich does not override existing fields", async () => {
    const ENRICH_PAYLOAD = {
      "gpt-4o": {
        id: "gpt-4o",
        name: "enrich-name-should-not-appear",
        description: "enrich description",
      },
    }

    globalThis.fetch.mock.mockImplementation(async (url) => {
      if (url === "https://models.dev/models.json") {
        return { ok: true, status: 200, json: async () => ENRICH_PAYLOAD }
      }
      return mockFetch()()
    })

    const result = await plugin(null, { provider: "test", enrich: true })
    const config = makeConfig("test", {
      models: {
        "gpt-4o": { name: "local-name" },
      },
    })
    await result.config(config)

    // local name should win over enrich
    assert.equal(config.provider.test.models["gpt-4o"].name, "local-name")
    // enrich should fill missing fields
    assert.equal(config.provider.test.models["gpt-4o"].description, "enrich description")
  })

  it("enrich failure does not block model sync", async () => {
    let fetchCall = 0
    globalThis.fetch.mock.mockImplementation(async (url) => {
      fetchCall++
      if (url === "https://models.dev/models.json") {
        return { ok: false, status: 500, json: async () => ({}) }
      }
      return mockFetch()()
    })

    const warnings = []
    mock.method(console, "warn", (msg) => warnings.push(msg))

    const result = await plugin(null, { provider: "test", enrich: true })
    const config = makeConfig("test")
    await result.config(config)

    assert.ok(config.provider.test.models["gpt-4o"])
    assert.equal(config.provider.test.models["gpt-4o"].name, "GPT-4o")
    assert.ok(warnings.some((w) => w.includes("enrich fetch failed")))
  })

  it("enrich is disabled by default", async () => {
    const fetchMock = mockFetch()
    globalThis.fetch.mock.mockImplementation(() => fetchMock())

    const result = await plugin(null, { provider: "test" })
    const config = makeConfig("test")
    await result.config(config)

    // should have basic fields but no enrich fields
    assert.equal(config.provider.test.models["gpt-4o"].name, "GPT-4o")
    assert.equal(config.provider.test.models["gpt-4o"].description, undefined)
  })
})

// ---- integration tests (real HTTP servers) ----

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

// ---- provider hook not returned ----

describe("provider hook", () => {
  it("is not returned for single provider", async () => {
    const result = await plugin(null, { provider: "test" })
    assert.equal(result.provider, undefined)
  })

  it("is not returned for multiple providers", async () => {
    const result = await plugin(null, { provider: ["a", "b"] })
    assert.equal(result.provider, undefined)
  })
})
