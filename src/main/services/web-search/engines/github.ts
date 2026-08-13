/**
 * Web Search MCP - GitHub Search Engine
 *
 * GitHub is an API-based search engine for code repositories.
 * Uses GitHub's REST API to search repositories, code, issues, etc.
 *
 * Features:
 * - Fast, structured API results
 * - No CAPTCHA issues
 * - Good for finding open source projects
 * - Automatically used for code/project queries
 */

import { SearchEngine } from './base'
import type {
  SearchOptions,
  SearchResult,
  SearchBlockReason,
} from '../types'

// ============================================
// GitHub Search Engine
// ============================================

export class GitHubEngine extends SearchEngine {
  readonly name = 'github'
  readonly displayName = 'GitHub'
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
   * GitHub participates in automatic selection for code-related queries.
   */
  readonly autoSelectable = true

  /**
   * Execute GitHub API search
   *
   * Searches GitHub repositories by default.
   * Returns structured SearchResult[] directly.
   */
  async executeApiSearch(
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    // GitHub API endpoint
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=${maxResults}&sort=stars&order=desc`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Halo-Search',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitHub API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()

    // GitHub API response format:
    // {
    //   items: [
    //     {
    //       name: string,
    //       full_name: string,
    //       html_url: string,
    //       description: string,
    //       stargazers_count: number,
    //       language: string
    //     }
    //   ]
    // }

    if (!data.items || !Array.isArray(data.items)) {
      return []
    }

    return data.items.map((item: any, index: number) => {
      const stars = item.stargazers_count || 0
      const language = item.language ? ` (${item.language})` : ''
      const snippet = item.description || 'No description available'

      return {
        title: `${item.full_name || item.name}${language} ⭐${stars}`,
        url: item.html_url || `https://github.com/${item.full_name}`,
        snippet: snippet,
        position: index + 1,
      }
    })
  }

  /**
   * Priority score for GitHub.
   *
   * High priority for queries that mention:
   * - "github", "repository", "repo", "open source", "project"
   * - Programming language names
   * - Technical/code-related terms
   *
   * Lower priority for general queries.
   */
  override getPriorityScore(query: string): number {
    const lowerQuery = query.toLowerCase()

    // Very high priority for explicit GitHub queries
    if (
      lowerQuery.includes('github') ||
      lowerQuery.includes('repository') ||
      lowerQuery.includes('repo ')
    ) {
      return 90
    }

    // High priority for open source / project queries
    if (
      lowerQuery.includes('open source') ||
      lowerQuery.includes('opensource') ||
      lowerQuery.includes('project')
    ) {
      return 85
    }

    // Medium-high priority for technical/code terms
    const techTerms = [
      'library', 'framework', 'sdk', 'api', 'cli', 'tool',
      'python', 'javascript', 'typescript', 'java', 'go', 'rust',
      'node', 'npm', 'pip', 'gem', 'package'
    ]
    if (techTerms.some(term => lowerQuery.includes(term))) {
      return 70
    }

    // Low priority for general queries
    return 40
  }

  /**
   * GitHub-specific guidance for failures
   */
  override buildBlockGuidance(reason: SearchBlockReason, query: string): string {
    const tail =
      ` Continue the task by retrying web_search with engine "bing" or "tavily", ` +
      `and tell the user that GitHub search did not succeed.`

    switch (reason) {
      case 'unreachable':
        return `GitHub API appears unreachable for "${query}".` + tail
      case 'no_results':
      default:
        return `GitHub returned no repositories for "${query}".` + tail
    }
  }
}

// Singleton instance
export const githubEngine = new GitHubEngine()
