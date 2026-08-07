/**
 * Web Search MCP - Bing Search Engine
 *
 * Bing is the primary search engine for international queries.
 * It has good coverage, relatively stable DOM structure, and
 * less aggressive anti-bot measures compared to Google.
 */

import { SearchEngine } from './base'
import { BING_CONFIG } from '../config/selectors'
import type { EngineSelectors, SearchOptions, SearchBlockReason } from '../types'

// ============================================
// Bing Search Engine
// ============================================

export class BingEngine extends SearchEngine {
  readonly name = BING_CONFIG.name
  readonly displayName = BING_CONFIG.displayName
  readonly searchUrlTemplate = BING_CONFIG.searchUrlTemplate
  readonly selectors: EngineSelectors = BING_CONFIG.selectors
  readonly fallbackSelectors: EngineSelectors = BING_CONFIG.fallbackSelectors
  readonly waitForSelector = BING_CONFIG.waitForSelector
  readonly extraWaitMs = BING_CONFIG.extraWaitMs

  /**
   * Build Bing search URL with optional language/region parameters
   *
   * Bing URL parameters:
   * - q: search query
   * - setlang: interface language (en, zh-cn, etc.)
   * - cc: country code (us, cn, etc.)
   * - count: results per page (max 50)
   */
  override buildSearchUrl(query: string, options: SearchOptions = {}): string {
    const params = new URLSearchParams()
    params.set('q', query)

    // Set interface language based on query content
    if (this.detectChinese(query)) {
      params.set('setlang', 'zh-cn')
      // Use China region for better Chinese results
      params.set('cc', 'cn')
    } else {
      params.set('setlang', 'en')
      params.set('cc', 'us')
    }

    // Request more results than needed (some may be filtered)
    const count = Math.min((options.maxResults || 8) + 5, 30)
    params.set('count', String(count))

    return `https://www.bing.com/search?${params.toString()}`
  }

  /**
   * Detect Bing's "Verify you are human" CAPTCHA page.
   *
   * Bing shows this verification page when it suspects bot traffic, particularly
   * for queries with operators like `site:github.com` in headless/automated
   * sessions. The page has no search results and cannot be parsed normally.
   */
  override buildBlockDetectionScript(): string {
    return `(function() {
      var title = document.title || '';
      var bodyText = document.body ? document.body.innerText.slice(0, 2000) : '';
      if (/verify you are human/i.test(title) || /verify you are human/i.test(bodyText)) {
        return 'captcha';
      }
      if (document.querySelector('#b_captcha') || document.querySelector('[data-bm="captcha"]')) {
        return 'captcha';
      }
      return null;
    })()`
  }

  /**
   * Bing-specific guidance for CAPTCHA failures.
   *
   * When Bing shows a verification page, direct the model to use the AI
   * browser tools to navigate to Bing and solve the CAPTCHA interactively,
   * or fall back to searching GitHub directly.
   */
  override buildBlockGuidance(reason: SearchBlockReason, query: string): string {
    if (reason === 'captcha') {
      const searchUrl = this.buildSearchUrl(query)
      const githubUrl = `https://github.com/search?q=${encodeURIComponent(query)}&type=repositories`
      return (
        `Bing returned a "Verify you are human" verification page for "${query}". ` +
        `Use the AI browser to handle this:\n` +
        `1. Call browser_navigate to: ${searchUrl}\n` +
        `2. Call browser_snapshot to screenshot the CAPTCHA\n` +
        `3. Solve the CAPTCHA (click the checkbox or follow the instructions)\n` +
        `4. Extract search results from the page with browser_evaluate\n` +
        `Or search GitHub directly: browser_navigate to ${githubUrl}`
      )
    }
    return super.buildBlockGuidance(reason, query)
  }

  /**
   * Bing priority score
   *
   * Bing is preferred for:
   * - English queries (score: 80)
   * - Mixed language queries (score: 60)
   * - Pure Chinese queries (score: 40, Baidu is better)
   */
  override getPriorityScore(query: string): number {
    const chineseChars = (query.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
    const totalChars = query.replace(/\s/g, '').length

    if (totalChars === 0) return 50

    const chineseRatio = chineseChars / totalChars

    if (chineseRatio === 0) {
      // Pure English/other - Bing is excellent
      return 80
    } else if (chineseRatio < 0.5) {
      // Mixed, mostly non-Chinese - Bing is good
      return 65
    } else if (chineseRatio < 0.8) {
      // Mixed, mostly Chinese - slight preference for Baidu
      return 45
    } else {
      // Pure Chinese - Baidu is better
      return 35
    }
  }
}

// Singleton instance
export const bingEngine = new BingEngine()
