/**
 * Request Converter: Anthropic -> OpenAI Chat Completions
 */

import type { AnthropicRequest, OpenAIChatRequest } from '../../types'
import { convertAnthropicMessagesToOpenAIChat } from '../messages'
import {
  convertAnthropicToolsToOpenAIChat,
  convertAnthropicToolChoiceToOpenAIChat,
} from '../tools'
import { supportsVisionById } from '../../../../shared/constants/model-capabilities'
import { buildStreamOptionsIncludeUsage } from './stream-options'
import { resolveOutputTokenLimit } from './max-tokens'
import type { ConvertRequestOptions } from './types'

export type { ConvertRequestOptions } from './types'

export interface ConversionResult {
  request: OpenAIChatRequest
  hasImages: boolean
  hasTools: boolean
}

/**
 * Convert Anthropic request to OpenAI Chat Completions request
 */
export function convertAnthropicToOpenAIChat(
  anthropicRequest: AnthropicRequest,
  options?: ConvertRequestOptions
): ConversionResult {
  // Strip image blocks for non-vision models. The OpenAI Chat spec encodes
  // images as `{type:'image_url', ...}`, but strict non-vision providers
  // reject this variant entirely. Image content can leak in via tool results
  // (Read on image, screenshots, MCP image returns) or mid-conv model
  // switches — the renderer UI input gate alone is not sufficient.
  // An explicit user vision override wins over the name heuristic so models
  // the blacklist misjudges (e.g. minimax-*) can still receive images.
  const stripImages = !(options?.visionOverride ?? supportsVisionById(anthropicRequest.model))

  // Convert messages
  const { messages, hasImages } = convertAnthropicMessagesToOpenAIChat(
    anthropicRequest.messages,
    anthropicRequest.system,
    { stripImages }
  )

  // Convert tools - just filter invalid ones, don't reject all
  const tools = convertAnthropicToolsToOpenAIChat(anthropicRequest.tools)

  // Build OpenAI request - only include essential parameters
  const openaiRequest: OpenAIChatRequest = {
    model: anthropicRequest.model,
    messages,
    stream: anthropicRequest.stream
  }

  // Issue #181: opt into chunk.usage so TokenUsageIndicator is not zero.
  // See `stream-options.ts` for the gateway-compat rationale.
  if (openaiRequest.stream) {
    openaiRequest.stream_options = buildStreamOptionsIncludeUsage()
  }

  // Gemma 4 via Ollama always uses max_tokens (not max_completion_tokens).
  const outputTokens = resolveOutputTokenLimit(anthropicRequest.max_tokens)
  if (outputTokens !== undefined) {
    openaiRequest.max_tokens = outputTokens
  }

  // Disable Ollama's native thinking when the Anthropic request doesn't enable it.
  // Gemma 4 generates <think> tags by default; without this, thinking tokens consume
  // the entire max_tokens budget leaving no room for actual response text.
  const thinkingEnabled = anthropicRequest.thinking?.type === 'enabled' || anthropicRequest.thinking?.type === 'adaptive'
  if (!thinkingEnabled) {
    ;(openaiRequest as any).think = false
  }

  // Add tools if present
  if (tools && tools.length > 0) {
    openaiRequest.tools = tools
    openaiRequest.tool_choice = convertAnthropicToolChoiceToOpenAIChat(anthropicRequest.tool_choice)
  }

  if (stripImages && hasImages) {
    console.log(
      `[openai-compat] Stripped image content for non-vision model: ${anthropicRequest.model}`
    )
  }

  return {
    request: openaiRequest,
    hasImages,
    hasTools: !!tools && tools.length > 0
  }
}

/**
 * Simplified conversion that returns just the request
 * (for backward compatibility)
 */
export function convertRequest(anthropicRequest: AnthropicRequest): OpenAIChatRequest {
  return convertAnthropicToOpenAIChat(anthropicRequest).request
}
