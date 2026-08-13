/**
 * Web Search MCP - GitLab Search Engine
 *
 * GitLab is an API-based search engine for code repositories.
 * Uses GitLab's REST API to search projects (repositories).
 *
 * Features:
 * - Fast, structured API results
 * - No API key required for public repos
 * - Good alternative to GitHub for finding open source projects
 * - Automatically used for code/project queries
 */

import { SearchEngine } from './base'
import type {
  SearchOptions,
  SearchResult,
  SearchBlockReason,
} from '../types'

// ============================================
// GitLab Search Engine
// ============================================

export class GitLabEngine extends SearchEngine {
  readonly name = 'gitlab'
  readonly displayName = 'GitLab'
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
   * GitLab participates in automatic selection for code-related queries.
   */
  readonly autoSelectable = true

  /**
   * Execute GitLab API search
   *
   * Searches GitLab projects (repositories).
   * Returns structured SearchResult[] directly.
   */
  async executeApiSearch(
    query: string,
    maxResults: number
  ): Promise<SearchResult[]> {
    // GitLab API endpoint for project search
    const url = `https://gitlab.com/api/v4/projects?search=${encodeURIComponent(query)}&per_page=${maxResults}&order_by=star_count`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Halo-Search',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`GitLab API error (${response.status}): ${errorText}`)
    }

    const data = await response.json()

    // GitLab API response format:
    // [
    //   {
    //     id: number,
    //     name: string,
    //     path_with_namespace: string,
    //     description: string,
    //     web_url: string,
    //     star_count: number,
    //     forks_count: number
    //   }
    // ]

    if (!Array.isArray(data)) {
      return []
    }

    return data.map((item: any, index: number) => {
      const stars = item.star_count || 0
      const forks = item.forks_count || 0
      const name = item.path_with_namespace || item.name || 'unknown'
      const snippet = item.description || 'No description available'

      return {
        title: `${name} ⭐${stars} 🔱${forks}`,
        url: item.web_url || `https://gitlab.com/${name}`,
        snippet: snippet,
        position: index + 1,
      }
    })
  }

  /**
   * Priority score for GitLab.
   *
   * Medium-high priority for queries that mention:
   * - "gitlab", "repository", "repo", "open source", "project"
   * - Programming language names
   *
   * Lower priority than GitHub (GitHub is more popular).
   */
  override getPriorityScore(query: string): number {
    const lowerQuery = query.toLowerCase()

    // Very high priority for explicit GitLab queries
    if (lowerQuery.includes('gitlab')) {
      return 90
    }

    // Medium-high priority for repository/project queries
    if (
      lowerQuery.includes('repository') ||
      lowerQuery.includes('repo ') ||
      lowerQuery.includes('open source') ||
      lowerQuery.includes('project')
    ) {
      return 65
    }

    // Medium priority for technical/code terms
    const techTerms = [
      'library', 'framework', 'sdk', 'api', 'cli', 'tool',
      'python', 'javascript', 'typescript', 'java', 'go', 'rust'
    ]
    if (techTerms.some(term => lowerQuery.includes(term))) {
      return 55
    }

    // Low priority for general queries
    return 35
  }

  /**
   * GitLab-specific guidance for failures
   */
  override buildBlockGuidance(reason: SearchBlockReason, query: string): string {
    const tail =
      ` Continue the task by retrying web_search with engine "github" or "bing", ` +
      `and tell the user that GitLab search did not succeed.`

    switch (reason) {
      case 'unreachable':
        return `GitLab API appears unreachable for "${query}".` + tail
      case 'no_results':
      default:
        return `GitLab returned no projects for "${query}".` + tail
    }
  }
}

// Singleton instance
export const gitlabEngine = new GitLabEngine()
