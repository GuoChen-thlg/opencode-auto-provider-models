import { describe, it, mock, before, after } from "node:test"
import assert from "node:assert/strict"
import plugin from "../opencode-auto-provider-models.js"

const MODELS_PAYLOAD = {
  data: [
    { id: "gpt-4o", name: "GPT-4o", context_window: 128000 },
    { id: "o1-preview", name: "O1 Preview", context_window: 200000, max_output_tokens: 32768 },
    { id: "deepseek-chat", name: "DeepSeek Chat" },
    { id: "internal-test", name: "Internal Test" },
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
})
