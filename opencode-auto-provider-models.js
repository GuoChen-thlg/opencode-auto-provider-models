/**
 * OpenCode plugin: auto-sync models for existing OpenAI-compatible providers.
 *
 * It fetches `${baseURL}/models` at startup for each configured provider and
 * injects the discovered list into `config.provider[providerId].models`.
 * Existing local model definitions are kept and merged so manual metadata
 * still wins when present.
 *
 * `provider` accepts a single ID string or an array of ID strings / config
 * objects `{ id, baseURL?, apiKey?, apiKeyEnv? }`.
 */

const DEFAULT_INPUT_MODALITIES = ["text"]
const DEFAULT_OUTPUT_MODALITIES = ["text"]
const DEFAULT_TIMEOUT = 1000
const DEFAULT_STARTUP_TIMEOUT = 3000

const modelCache = new Map()
const inflightRequests = new Map()

function getCacheKey(baseURL, apiKey) {
  return `${baseURL}|${apiKey || ""}`
}

function normalizeBaseUrl(baseURL) {
  if (typeof baseURL !== "string" || !baseURL.trim()) return null
  return baseURL.replace(/\/+$/, "")
}

function normalizeModelId(value) {
  if (typeof value !== "string") return null
  const id = value.trim()
  return id ? id : null
}

function looksLikeReasoningModel(modelId) {
  return /(reason|thinking|o1|o3|o4|r1|r\d|deepseek|glm-5|minimax-m2\.5)/i.test(modelId)
}

function deriveLimit(model) {
  const context =
    Number(model?.context_window) ||
    Number(model?.contextWindow) ||
    Number(model?.input_token_limit) ||
    Number(model?.inputTokenLimit) ||
    Number(model?.max_input_tokens) ||
    Number(model?.maxInputTokens) ||
    null

  const output =
    Number(model?.max_output_tokens) ||
    Number(model?.maxOutputTokens) ||
    Number(model?.output_token_limit) ||
    Number(model?.outputTokenLimit) ||
    null

  if (!context && !output) return undefined
  return {
    ...(context ? { context } : {}),
    ...(output ? { output } : {}),
  }
}

function deriveModalities(model) {
  const rawInput = Array.isArray(model?.input_modalities)
    ? model.input_modalities
    : Array.isArray(model?.modalities?.input)
      ? model.modalities.input
      : null

  const rawOutput = Array.isArray(model?.output_modalities)
    ? model.output_modalities
    : Array.isArray(model?.modalities?.output)
      ? model.modalities.output
      : null

  const input = rawInput?.filter((item) => typeof item === "string" && item.trim()) || DEFAULT_INPUT_MODALITIES
  const output = rawOutput?.filter((item) => typeof item === "string" && item.trim()) || DEFAULT_OUTPUT_MODALITIES

  return { input, output }
}

function toDisplayName(modelId, remoteModel) {
  if (typeof remoteModel?.name === "string" && remoteModel.name.trim()) return remoteModel.name.trim()
  return modelId
}

function buildModelEntry(modelId, remoteModel, existingEntry) {
  const generated = {
    name: toDisplayName(modelId, remoteModel),
    modalities: deriveModalities(remoteModel),
    ...(looksLikeReasoningModel(modelId) ? { reasoning: true } : {}),
    ...(deriveLimit(remoteModel) ? { limit: deriveLimit(remoteModel) } : {}),
  }

  if (!existingEntry || typeof existingEntry !== "object") return generated

  return {
    ...generated,
    ...existingEntry,
    modalities: existingEntry.modalities || generated.modalities,
    limit: existingEntry.limit || generated.limit,
  }
}

function getApiKey(options, perProviderOpts, globalOpts) {
  const envName = typeof perProviderOpts.apiKeyEnv === "string"
    ? perProviderOpts.apiKeyEnv
    : typeof globalOpts.apiKeyEnv === "string"
      ? globalOpts.apiKeyEnv
      : null
  if (envName && process.env[envName]) return process.env[envName]
  if (typeof perProviderOpts.apiKey === "string" && perProviderOpts.apiKey.trim()) return perProviderOpts.apiKey.trim()
  if (typeof globalOpts.apiKey === "string" && globalOpts.apiKey.trim()) return globalOpts.apiKey.trim()
  if (typeof options?.apiKey === "string" && options.apiKey.trim()) return options.apiKey.trim()
  return null
}

async function fetchRemoteModels(baseURL, apiKey, timeoutMs) {
  const cacheKey = getCacheKey(baseURL, apiKey)

  const inflight = inflightRequests.get(cacheKey)
  if (inflight) return inflight

  const promise = (async () => {
    const headers = { "content-type": "application/json" }
    if (apiKey) headers.authorization = `Bearer ${apiKey}`
    const reqUrl = `${baseURL}/models`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(reqUrl, { headers, signal: controller.signal })
      clearTimeout(timer)

      if (!response.ok) {
        console.error(`[auto-provider-models] request failed: HTTP ${response.status} ${response.statusText} for ${reqUrl}`)
        throw new Error(`request failed with status ${response.status}`)
      }

      const payload = await response.json()
      if (!Array.isArray(payload?.data)) {
        console.error(`[auto-provider-models] invalid response body for ${reqUrl}: ${JSON.stringify(payload).slice(0, 200)}`)
        throw new Error("response is not an OpenAI-compatible models payload")
      }

      return payload.data
    } catch (error) {
      clearTimeout(timer)
      if (error.name === "AbortError") {
        console.error(`[auto-provider-models] timeout after ${timeoutMs}ms for ${reqUrl}`)
        throw new Error(`timeout after ${timeoutMs}ms`)
      }
      if (error instanceof TypeError) {
        console.error(`[auto-provider-models] network error for ${reqUrl}: ${error.message}`)
      }
      throw error
    }
  })()

  const result = promise.finally(() => {
    if (inflightRequests.get(cacheKey) === result) {
      inflightRequests.delete(cacheKey)
    }
  })

  inflightRequests.set(cacheKey, result)
  return result
}

function shouldKeepModel(modelId, pluginOptions) {
  const include = Array.isArray(pluginOptions.include)
    ? new Set(pluginOptions.include.filter((item) => typeof item === "string"))
    : null
  const exclude = Array.isArray(pluginOptions.exclude)
    ? new Set(pluginOptions.exclude.filter((item) => typeof item === "string"))
    : null

  if (include && !include.has(modelId)) return false
  if (exclude && exclude.has(modelId)) return false
  return true
}

function resolveProviderEntries(pluginOptions) {
  if (Array.isArray(pluginOptions.provider)) return pluginOptions.provider
  if (typeof pluginOptions.provider === "string") return [pluginOptions.provider]
  return []
}

function normalizeProviderEntry(entry) {
  if (typeof entry === "string") return { id: entry }
  if (entry && typeof entry === "object") {
    const id = typeof entry.id === "string" && entry.id.trim() ? entry.id.trim() : null
    if (!id) return null
    return {
      id,
      ...(entry.baseURL ? { baseURL: normalizeBaseUrl(entry.baseURL) } : {}),
      ...(entry.apiKey ? { apiKey: entry.apiKey.trim() } : {}),
      ...(entry.apiKeyEnv ? { apiKeyEnv: entry.apiKeyEnv } : {}),
    }
  }
  return null
}

async function syncProvider(config, providerEntry, globalOpts) {
  const providerId = providerEntry.id

  const providerConfig = config?.provider?.[providerId]
  if (!providerConfig || typeof providerConfig !== "object") {
    console.warn(`[auto-provider-models] provider not found in config: ${providerId}`)
    return
  }

  const baseURL = providerEntry.baseURL || normalizeBaseUrl(providerConfig?.options?.baseURL || globalOpts.baseURL)
  if (!baseURL) {
    console.warn(`[auto-provider-models] missing baseURL for provider: ${providerId}`)
    return
  }

  const timeoutMs = Number.isFinite(globalOpts.timeout) ? globalOpts.timeout : DEFAULT_TIMEOUT
  const cacheTTL = Number.isFinite(globalOpts.cacheTTL) ? globalOpts.cacheTTL : 0

  const existingModels =
    providerConfig.models && typeof providerConfig.models === "object" ? providerConfig.models : {}

  try {
    const apiKey = getApiKey(providerConfig.options, providerEntry, globalOpts)

    const cacheKey = getCacheKey(baseURL, apiKey)
    const cached = cacheTTL > 0 ? modelCache.get(cacheKey) : null
    if (cached && Date.now() - cached.timestamp < cacheTTL) {
      providerConfig.models = cached.models
      return
    }

    const remoteModels = await fetchRemoteModels(baseURL, apiKey, timeoutMs)
    const nextModels = { ...existingModels }

    for (const remoteModel of remoteModels) {
      const modelId = normalizeModelId(remoteModel?.id)
      if (!modelId || !shouldKeepModel(modelId, globalOpts)) continue
      nextModels[modelId] = buildModelEntry(modelId, remoteModel, existingModels[modelId])
    }

    providerConfig.models = nextModels

    if (cacheTTL > 0) {
      modelCache.set(cacheKey, { timestamp: Date.now(), models: nextModels })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[auto-provider-models] failed to sync models for ${providerId}: ${message}`)
  }
}

export default async function autoProviderModelsPlugin(_input, pluginOptions = {}) {
  return {
    config: async (config) => {
      const rawEntries = resolveProviderEntries(pluginOptions)
      if (rawEntries.length === 0) {
        console.warn("[auto-provider-models] missing required option: provider")
        return
      }

      const entries = rawEntries
        .map(normalizeProviderEntry)
        .filter((e) => e !== null)

      const startupTimeout = Number.isFinite(pluginOptions.startupTimeout)
        ? pluginOptions.startupTimeout
        : DEFAULT_STARTUP_TIMEOUT

      const syncPromise = Promise.all(
        entries.map((entry) => syncProvider(config, entry, pluginOptions))
      )

      const overallTimer = new Promise((resolve) => {
        setTimeout(() => {
          console.warn(`[auto-provider-models] startup timed out after ${startupTimeout}ms, models may be incomplete`)
          resolve()
        }, startupTimeout)
      })

      await Promise.race([syncPromise, overallTimer])
    },
  }
}
