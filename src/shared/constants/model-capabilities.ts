/**
 * Model Capabilities — Capability Detection From Model IDs
 *
 * Maintains pattern lists for capability inference from a model id string and
 * provides unified query functions. Currently covers:
 *   - Vision support: used by InputArea to block image input for non-vision
 *     models, and by the OpenAI-compat router to strip image blocks.
 *   - Reasoning model detection: used by the OpenAI-compat router to pick the
 *     correct output-length parameter (`max_completion_tokens` for reasoning
 *     models, `max_tokens` otherwise). OpenAI rejects `max_tokens` on the
 *     o1/o3/o4-mini and gpt-5-thinking families with HTTP 400.
 *
 * Resolution order (vision), from a model id alone:
 *   1. Explicit ModelOption.supportsVision (provider-declared) — highest priority
 *   2. Vision keyword whitelist (e.g. "-vl", "vision", "omni")
 *   3. Non-vision pattern blacklist (e.g. "deepseek", "glm-4")
 *   4. Default: true (unknown models pass through, no false blocking)
 *
 * Callers holding an AI source use {@link resolveModelVision} instead: it adds
 * the per-model override layer on top and is the one answer every consumer
 * (renderer hint, backend config, image fallback) must share.
 */

import type { ModelOption } from '../types/ai-sources'

// ============================================================================
// Gemma 4 Capability Preset
// ============================================================================

/**
 * Capability preset for Gemma 4 models (gemma4:4b, gemma4:12b, gemma4:26b).
 * contextWindow: 128K tokens; maxOutputTokens: 8192; vision: supported.
 */
export const GEMMA4_CAPABILITIES = {
  contextWindow: 131072,
  maxOutputTokens: 8192,
  supportsVision: true,
} as const

/**
 * Return Gemma 4 capability preset if modelId matches; otherwise undefined.
 * Callers use this to pre-fill model config without manual settings entry.
 */
export function getGemma4Preset(modelId: string | undefined | null): typeof GEMMA4_CAPABILITIES | undefined {
  if (!modelId) return undefined
  return modelId.toLowerCase().startsWith('gemma4') ? GEMMA4_CAPABILITIES : undefined
}

// ============================================================================
// Vision Capability Detection
// ============================================================================

/**
 * Known non-vision model patterns (blacklist).
 * Matched via modelId.toLowerCase().includes(pattern).
 */
const NON_VISION_PATTERNS: string[] = [
  // DeepSeek family
  'deepseek',
  // GLM family (glm-4v is rescued by VISION_KEYWORDS)
  'glm-4', 'glm-5', 'chatglm',
  // Meta Llama (text-only variants)
  'llama-2', 'llama-3.1', 'llama-3.3', 'codellama',
  // Mistral family
  'mixtral', 'mistral-large', 'mistral-medium', 'mistral-nemo', 'codestral',
  // Qwen text/code variants
  'qwen-coder', 'qwen2.5-coder', 'qwen3-coder', 'qwen-math', 'qwq',
  // Microsoft Phi family
  'phi-2', 'phi-3-mini', 'phi-3-small', 'phi-3-medium', 'phi-4-mini',
  // Google legacy Gemma (non-vision variants)
  'gemma-2', 'codegemma',
  // NVIDIA
  'nemotron',
  // MiniMax
  'minimax', 'abab',
  // Other known text-only models
  'command-r', 'dbrx', 'olmo', 'starcoder',
  'solar', 'mercury', 'lfm', 'palmyra', 'internlm', 'baichuan',
]

/**
 * Keywords that indicate vision support — takes priority over blacklist.
 * Prevents false positives (e.g. "glm-4v" matched by "glm-4" pattern).
 */
const VISION_KEYWORDS: string[] = [
  'vision', '-vl', 'pixtral', 'paligemma', 'cogvlm',
  'glm-4v', 'glm-ocr', 'multimodal', 'omni',
]

/**
 * Infer vision support from model ID using blacklist/whitelist patterns.
 */
function inferVisionSupport(modelId: string): boolean {
  const lower = modelId.toLowerCase()

  // Vision keywords take priority — rescue false positives
  if (VISION_KEYWORDS.some(kw => lower.includes(kw))) return true

  // Check blacklist
  if (NON_VISION_PATTERNS.some(p => lower.includes(p))) return false

  // Unknown models default to vision-capable (no false blocking)
  return true
}

/**
 * Check if a model supports vision (image) input.
 *
 * Resolution order:
 *   1. Explicit ModelOption.supportsVision (provider or user set) — highest priority
 *   2. Blacklist/keyword inference from model ID
 *   3. Default true (unknown models pass through)
 */
export function supportsVision(model: ModelOption): boolean {
  if (model.supportsVision !== undefined) return model.supportsVision
  return inferVisionSupport(model.id)
}

/**
 * Check vision support by model ID alone.
 *
 * Used by the openai-compat router where only the request body's `model`
 * string is available (no `ModelOption` reference). Skips the explicit
 * `ModelOption.supportsVision` override — for full UI-facing checks use
 * {@link supportsVision} with the resolved ModelOption.
 *
 * Behavior matches {@link supportsVision} step 2-3 (keyword/blacklist
 * inference, default true for unknown IDs).
 */
export function supportsVisionById(modelId: string | undefined | null): boolean {
  if (!modelId) return true
  return inferVisionSupport(modelId)
}

/**
 * Minimal shape {@link resolveModelVision} reads from an AI source. Declared
 * structurally so the renderer, the source manager and tests can all pass what
 * they hold without importing the full AISource type.
 */
export interface VisionCapabilitySource {
  modelOverrides?: Record<string, { vision?: boolean } | undefined>
  availableModels?: ModelOption[]
}

/**
 * Effective vision capability for `modelId` within `source` — the single
 * answer to "can this model accept image blocks".
 *
 * Renderer (input hint), source manager (backend config) and the image
 * fallback must agree: a split decision shows the user "images go through OCR"
 * while the request still carries image parts, which strict providers reject
 * outright. Every caller resolves through here.
 *
 * Resolution order:
 *   1. `modelOverrides[modelId].vision` — the user's Model Config setting, or
 *      a capability the provider's catalog declared. Keyed by the wire model
 *      id, the same key Model Config writes.
 *   2. Provider-declared `ModelOption.supportsVision`
 *   3. Blacklist/keyword inference from the model id
 */
export function resolveModelVision(
  source: VisionCapabilitySource | null | undefined,
  modelId: string | undefined | null
): boolean {
  if (!source || !modelId) return supportsVisionById(modelId)

  const override = source.modelOverrides?.[modelId]?.vision
  if (typeof override === 'boolean') return override

  const model = source.availableModels?.find(m => m.id === modelId)
  return model ? supportsVision(model) : supportsVisionById(modelId)
}

