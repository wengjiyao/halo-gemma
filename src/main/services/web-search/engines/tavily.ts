/**
 * Web Search MCP - Tavily Search Engine
 *
 * Tavily is an API-based search service optimized for AI applications.
 * Unlike DOM-scraping engines, it provides structured JSON results via REST API.
 *
 * Features:
 * - Fast, reliable API-based search
 * - No CAPTCHA or bot detection issues
 * - Structured, clean results
 * - Good fallback when Google/Bing fail
 *
 * Tavily API: https://tavily.com
 */

import { SearchEngine } from './base'
import type {
  SearchOptions,
  SearchResult,
  SearchBlockReason,
} from '../types'

// ============================================
// Tavily Search Engine
// ============================================

export class TavilyEngine extends SearchEngine {
  readonly name = 'tavily'
  readonly displayName = 'Tavily'
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
   * This tells search-context to use API execution instead of BrowserView.
   */
  readonly isApiEngine = true

  /**
   * Tavily participates in automatic selection.
   * It's positioned as a fallback after Google/Bing but before Baidu.
   */
  readonly autoSelectable = true

  /**
   * API key for Tavily service.
   * Set from config at startup.
   */
  apiKey: string = ''

  /**
   * Set the API key for this engine instance
   */
  setApiKey(key: string): void {
    this.apiKey = key
  }

  /**
   * Execute Tavily API search
   *
   * This method is called by search-context for API engines.
   * Returns structured SearchResult[] directly.
   */
  async executeApiSearch(
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    if (!this.apiKey) {
      throw new Error('Tavily API key not configured')
    }

    const url = 'https://api.tavily.com/search'
    const requestBody = {
      api_key: this.apiKey,
      query,
      max_results: maxResults,
      search_depth: 'basic', // 'basic' or 'advanced'
      include_answer: false,
      include_raw_content: false,
      include_images: false,
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Tavily API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()

    // Tavily response format:
    // {
    //   results: [
    //     {
    //       title: string,
    //       url: string,
    //       content: string,
    //       score: number
    //     }
    //   ]
    // }

    if (!data.results || !Array.isArray(data.results)) {
      return []
    }

    return data.results.map((item: any, index: number) => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.content || '',
      position: index + 1,
    }))
  }

  /**
   * Priority score for Tavily.
   *
   * Positioned as a fallback:
   * - Lower than Google (70) and Bing (80/65)
   * - Higher than Baidu for non-Chinese queries
   * - Lower than Baidu for Chinese queries (Baidu has better Chinese coverage)
   */
  override getPriorityScore(query: string): number {
    const chineseChars = (query.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
    const totalChars = query.replace(/\s/g, '').length

    if (totalChars === 0) return 30

    const chineseRatio = chineseChars / totalChars

    if (chineseRatio > 0.5) {
      // Mostly Chinese - Baidu is better
      return 25
    } else {
      // English/mixed - Tavily is a good fallback after Bing
      return 50
    }
  }

  /**
   * Tavily-specific guidance for failures
   */
  override buildBlockGuidance(reason: SearchBlockReason, query: string): string {
    const tail =
      ` Continue the task by retrying web_search with engine "bing" or "baidu", ` +
      `and tell the user that Tavily did not succeed.`

    switch (reason) {
      case 'unreachable':
        return `Tavily API appears unreachable for "${query}".` + tail
      case 'no_results':
      default:
        return `Tavily returned no results for "${query}".` + tail
    }
  }
}

// Singleton instance
export const tavilyEngine = new TavilyEngine()
