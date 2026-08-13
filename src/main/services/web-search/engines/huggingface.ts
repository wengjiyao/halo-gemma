/**
 * Web Search MCP - Hugging Face Search Engine
 *
 * Hugging Face is an API-based search engine for ML models, datasets, and spaces.
 * Uses Hugging Face's public API to search their model hub.
 *
 * Features:
 * - Fast, structured API results
 * - No API key required (public API)
 * - Good for finding ML models, datasets, AI applications
 * - Automatically used for AI/ML queries
 */

import { SearchEngine } from './base'
import type {
  SearchOptions,
  SearchResult,
  SearchBlockReason,
} from '../types'

// ============================================
// Hugging Face Search Engine
// ============================================

export class HuggingFaceEngine extends SearchEngine {
  readonly name = 'huggingface'
  readonly displayName = 'Hugging Face'
  readonly searchUrlTemplate = '' // Not used for API engines
  readonly selectors = {
    resultContainer: '',
    resultItem: '',
    title: '',
    link: '',
    snippet: '',
  }
  readonly waitForSelector = '' // Not used for API engines

  /**
   * Mark this as an API engine (not DOM-based).
   */
  readonly isApiEngine = true

  /**
   * Hugging Face participates in automatic selection for AI/ML queries.
   */
  readonly autoSelectable = true

  /**
   * Execute Hugging Face API search
   *
   * Searches models by default (can extend to datasets/spaces).
   * Returns structured SearchResult[] directly.
   */
  async executeApiSearch(
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    // Hugging Face API endpoint for models
    const url = `https://huggingface.co/api/models?search=${encodeURIComponent(query)}&limit=${maxResults}&sort=downloads&direction=-1`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Halo-Search',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Hugging Face API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()

    // Hugging Face API response format:
    // [
    //   {
    //     modelId: string,
    //     author: string,
    //     downloads: number,
    //     likes: number,
    //     tags: string[],
    //     pipeline_tag: string
    //   }
    // ]

    if (!Array.isArray(data)) {
      return []
    }

    return data.slice(0, maxResults).map((item: any, index: number) => {
      const downloads = item.downloads || 0
      const likes = item.likes || 0
      const modelId = item.modelId || item.id || 'unknown'
      const pipelineTag = item.pipeline_tag || ''
      const tags = (item.tags || []).slice(0, 3).join(', ')

      // Format downloads (K, M notation)
      const formatNumber = (num: number): string => {
        if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
        if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
        return String(num)
      }

      const stats = `${formatNumber(downloads)} downloads • ${likes} ❤️`
      const snippet = pipelineTag
        ? `${pipelineTag}${tags ? ` | Tags: ${tags}` : ''}`
        : tags || 'No description available'

      return {
        title: `${modelId} (${stats})`,
        url: `https://huggingface.co/${modelId}`,
        snippet: snippet,
        position: index + 1,
      }
    })
  }

  /**
   * Priority score for Hugging Face.
   *
   * High priority for queries that mention:
   * - "model", "dataset", "huggingface", "transformers"
   * - AI/ML terms: "llm", "vision", "nlp", "ml", "ai"
   * - Model architectures: "bert", "gpt", "llama", "gemma"
   *
   * Lower priority for general queries.
   */
  override getPriorityScore(query: string): number {
    const lowerQuery = query.toLowerCase()

    // Very high priority for explicit Hugging Face queries
    if (
      lowerQuery.includes('huggingface') ||
      lowerQuery.includes('hugging face') ||
      lowerQuery.includes('hf model')
    ) {
      return 95
    }

    // High priority for model/dataset queries
    if (
      lowerQuery.includes('model') ||
      lowerQuery.includes('dataset') ||
      lowerQuery.includes('transformer')
    ) {
      return 80
    }

    // Medium-high priority for AI/ML terms
    const aiTerms = [
      'llm', 'language model', 'vision model', 'nlp', 'ml', 'ai model',
      'bert', 'gpt', 'llama', 'gemma', 'qwen', 'mistral', 'phi',
      'stable diffusion', 'flux', 'whisper', 'clip'
    ]
    if (aiTerms.some(term => lowerQuery.includes(term))) {
      return 75
    }

    // Low priority for general queries
    return 30
  }

  /**
   * Hugging Face-specific guidance for failures
   */
  override buildBlockGuidance(reason: SearchBlockReason, query: string): string {
    const tail =
      ` Continue the task by retrying web_search with engine "github" or "bing", ` +
      `and tell the user that Hugging Face search did not succeed.`

    switch (reason) {
      case 'unreachable':
        return `Hugging Face API appears unreachable for "${query}".` + tail
      case 'no_results':
      default:
        return `Hugging Face returned no models for "${query}".` + tail
    }
  }
}

// Singleton instance
export const huggingfaceEngine = new HuggingFaceEngine()
