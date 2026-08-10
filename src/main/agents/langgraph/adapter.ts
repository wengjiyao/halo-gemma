/**
 * LangGraph Agent Adapter
 *
 * Provides Claude Code SDK-compatible interface for seamless migration
 * Acts as drop-in replacement with feature flag support
 */

import { LangGraphAgentBridge, createLangGraphAgent } from './bridge'

/**
 * Agent configuration (compatible with Claude Code SDK config)
 */
export interface AgentConfig {
  model?: string
  apiKey?: string // Ignored for LangGraph (no API needed)
  baseUrl?: string // Ignored for LangGraph (uses Ollama)
  pythonPath?: string // LangGraph-specific
}

/**
 * Message format (compatible with Claude SDK)
 */
export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * Agent response (compatible with Claude SDK)
 */
export interface AgentResponse {
  id: string
  type: 'message'
  role: 'assistant'
  content: Array<{ type: 'text'; text: string }>
  model: string
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence'
  usage?: {
    input_tokens: number
    output_tokens: number
  }
}

/**
 * Stream event (compatible with Claude SDK)
 */
export interface StreamEvent {
  type: 'message_start' | 'content_block_delta' | 'message_delta' | 'message_stop'
  delta?: {
    type: 'text_delta'
    text: string
  }
  message?: AgentResponse
}

/**
 * LangGraph Agent with Claude SDK-compatible interface
 *
 * Drop-in replacement for @anthropic-ai/claude-code
 */
export class LangGraphAgent {
  private bridge: LangGraphAgentBridge
  private model: string

  constructor(config: AgentConfig = {}) {
    this.model = config.model || 'gemma4:26b'
    this.bridge = createLangGraphAgent({
      model: this.model,
      pythonPath: config.pythonPath
    })
  }

  /**
   * Send a message (Claude SDK compatible)
   *
   * @param params - Message parameters
   * @returns Agent response
   */
  async messages(params: {
    messages: Message[]
    model?: string
    max_tokens?: number
    system?: string
    temperature?: number
  }): Promise<AgentResponse> {
    // Extract user message (last message in array)
    const userMessage = params.messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n')

    // Generate session ID from messages (simple hash)
    const sessionId = this._generateSessionId(params.messages)

    // Get response
    const response = await this.bridge.chat(userMessage, sessionId)

    // Format as Claude SDK response
    return this._formatResponse(response)
  }

  /**
   * Stream messages (Claude SDK compatible)
   *
   * @param params - Message parameters
   * @returns Async iterator of stream events
   */
  async *stream(params: {
    messages: Message[]
    model?: string
    max_tokens?: number
    system?: string
    temperature?: number
  }): AsyncGenerator<StreamEvent, void, unknown> {
    // Extract user message
    const userMessage = params.messages
      .filter(m => m.role === 'user')
      .map(m => m.content)
      .join('\n')

    // Generate session ID
    const sessionId = this._generateSessionId(params.messages)

    // Emit message_start event
    yield {
      type: 'message_start',
      message: {
        id: this._generateId(),
        type: 'message',
        role: 'assistant',
        content: [],
        model: this.model,
        stop_reason: 'end_turn'
      }
    }

    // Stream chunks
    for await (const chunk of this.bridge.streamAsync(userMessage, sessionId)) {
      yield {
        type: 'content_block_delta',
        delta: {
          type: 'text_delta',
          text: chunk
        }
      }
    }

    // Emit message_stop event
    yield {
      type: 'message_stop'
    }
  }

  /**
   * Format response to match Claude SDK format
   */
  private _formatResponse(text: string): AgentResponse {
    return {
      id: this._generateId(),
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: text
        }
      ],
      model: this.model,
      stop_reason: 'end_turn',
      usage: {
        input_tokens: 0, // Not tracked in POC
        output_tokens: 0
      }
    }
  }

  /**
   * Generate session ID from messages
   */
  private _generateSessionId(messages: Message[]): string {
    // Simple hash of conversation
    const content = messages.map(m => `${m.role}:${m.content}`).join('|')
    return `session_${this._simpleHash(content)}`
  }

  /**
   * Simple hash function
   */
  private _simpleHash(str: string): string {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash
    }
    return Math.abs(hash).toString(36)
  }

  /**
   * Generate unique ID
   */
  private _generateId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

/**
 * Factory function (Claude SDK compatible)
 *
 * Usage:
 *   import { createLangGraphAgent } from './agents/langgraph'
 *   const agent = createLangGraphAgent({ model: 'gemma4:26b' })
 */
export function createAgent(config?: AgentConfig): LangGraphAgent {
  return new LangGraphAgent(config)
}

/**
 * Export default for compatibility
 */
export default LangGraphAgent
