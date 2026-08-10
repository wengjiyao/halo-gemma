/**
 * Node.js Bridge to LangGraph Python Agent
 *
 * Provides a TypeScript interface to the Python LangGraph agent,
 * allowing Electron to use it as a drop-in replacement for Claude Code SDK
 */

import { spawn, ChildProcess } from 'child_process'
import path from 'path'
import { EventEmitter } from 'events'

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface AgentResponse {
  response?: string
  chunk?: string
  error?: string
}

/**
 * LangGraph Agent Bridge
 *
 * Compatible interface with Claude Code SDK for easy migration
 */
export class LangGraphAgentBridge extends EventEmitter {
  private pythonPath: string
  private agentScriptPath: string
  private model: string

  constructor(options: {
    pythonPath?: string
    model?: string
  } = {}) {
    super()

    // Use system Python or conda environment
    this.pythonPath = options.pythonPath || 'python3'
    this.model = options.model || 'gemma4:26b'

    // Path to Python agent script
    this.agentScriptPath = path.join(__dirname, 'agent.py')
  }

  /**
   * Send a message and get response (non-streaming)
   *
   * @param message - User message
   * @param sessionId - Session identifier
   * @returns Assistant response
   */
  async chat(message: string, sessionId: string = 'default'): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        this.agentScriptPath,
        'chat',
        message,
        '--session-id', sessionId,
        '--model', this.model
      ]

      const python = spawn(this.pythonPath, args)
      let stdout = ''
      let stderr = ''

      python.stdout.on('data', (data) => {
        stdout += data.toString()
      })

      python.stderr.on('data', (data) => {
        stderr += data.toString()
      })

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python agent failed: ${stderr}`))
          return
        }

        try {
          const result: AgentResponse = JSON.parse(stdout.trim())
          if (result.error) {
            reject(new Error(result.error))
          } else {
            resolve(result.response || '')
          }
        } catch (e) {
          reject(new Error(`Failed to parse response: ${stdout}`))
        }
      })
    })
  }

  /**
   * Send a message and stream response chunks
   *
   * @param message - User message
   * @param sessionId - Session identifier
   * @param onChunk - Callback for each chunk
   * @param onComplete - Callback when streaming completes
   * @param onError - Callback for errors
   */
  stream(
    message: string,
    sessionId: string = 'default',
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): ChildProcess {
    const args = [
      this.agentScriptPath,
      'stream',
      message,
      '--session-id', sessionId,
      '--model', this.model
    ]

    const python = spawn(this.pythonPath, args)
    let buffer = ''

    python.stdout.on('data', (data) => {
      buffer += data.toString()

      // Process complete JSON lines
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const result: AgentResponse = JSON.parse(line)
          if (result.chunk) {
            onChunk(result.chunk)
          }
          if (result.error) {
            onError?.(new Error(result.error))
          }
        } catch (e) {
          // Ignore parse errors for incomplete lines
        }
      }
    })

    python.stderr.on('data', (data) => {
      console.error('[LangGraph Agent Error]', data.toString())
    })

    python.on('close', (code) => {
      if (code !== 0 && onError) {
        onError(new Error(`Python agent exited with code ${code}`))
      } else if (onComplete) {
        onComplete()
      }
    })

    return python
  }

  /**
   * Stream response with async iterator (modern API)
   *
   * @param message - User message
   * @param sessionId - Session identifier
   * @returns Async iterator of response chunks
   */
  async *streamAsync(
    message: string,
    sessionId: string = 'default'
  ): AsyncGenerator<string, void, unknown> {
    const args = [
      this.agentScriptPath,
      'stream',
      message,
      '--session-id', sessionId,
      '--model', this.model
    ]

    const python = spawn(this.pythonPath, args)
    let buffer = ''

    for await (const chunk of python.stdout) {
      buffer += chunk.toString()

      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue

        try {
          const result: AgentResponse = JSON.parse(line)
          if (result.chunk) {
            yield result.chunk
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    }
  }
}

/**
 * Factory function for creating agent bridge
 *
 * Usage:
 *   const agent = createLangGraphAgent({ model: 'gemma4:26b' })
 *   const response = await agent.chat('Hello!')
 */
export function createLangGraphAgent(options?: {
  pythonPath?: string
  model?: string
}): LangGraphAgentBridge {
  return new LangGraphAgentBridge(options)
}
