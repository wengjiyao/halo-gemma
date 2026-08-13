/**
 * Web Search MCP - Engine Registry
 *
 * Central registry for all search engines.
 * Provides engine lookup, auto-selection, and fallback ordering.
 */

import type { SearchEngine } from './base'
import { bingEngine } from './bing'
import { baiduEngine } from './baidu'
import { googleEngine } from './google'
import { tavilyEngine } from './tavily'
import { githubEngine } from './github'
import { gitlabEngine } from './gitlab'
import { huggingfaceEngine } from './huggingface'

// ============================================
// Types
// ============================================

export type EngineName = 'bing' | 'baidu' | 'google' | 'tavily' | 'github' | 'gitlab' | 'huggingface'

// ============================================
// Engine Registry
// ============================================

/**
 * All available search engines.
 *
 * Note: an engine being registered here does not mean it participates in
 * automatic selection. Engines with `autoSelectable = false` (e.g. Google) are
 * only used when requested by name — see {@link resolveEngines}.
 */
const engines: Record<EngineName, SearchEngine> = {
  bing: bingEngine,
  baidu: baiduEngine,
  google: googleEngine,
  tavily: tavilyEngine,
  github: githubEngine,
  gitlab: gitlabEngine,
  huggingface: huggingfaceEngine,
}

/**
 * Engines eligible for automatic selection and fallback, in registry order.
 */
function getAutoSelectableEngines(): SearchEngine[] {
  return Object.values(engines).filter(engine => engine.autoSelectable)
}

// ============================================
// Engine Initialization
// ============================================

/**
 * Check if Google is available/reachable AND not showing CAPTCHA.
 * Used at startup to determine if Google should participate in automatic selection.
 *
 * Performs a real search to detect CAPTCHA, not just domain availability.
 */
async function checkGoogleAvailability(): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    // Try a simple test search
    const testUrl = 'https://www.google.com/search?q=test&hl=en&gl=us'
    const response = await fetch(testUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      console.log('[WebSearch] Google availability check failed: HTTP', response.status)
      return false
    }

    // Check response for CAPTCHA indicators
    const html = await response.text()
    const hasCaptcha =
      html.includes('/sorry/') ||
      html.includes('captcha') ||
      html.includes('unusual traffic') ||
      html.includes('consent.google') ||
      html.includes('Before you continue')

    if (hasCaptcha) {
      console.log('[WebSearch] Google availability check failed: CAPTCHA detected')
      return false
    }

    // Check if we got actual search results (has #search or #rso div)
    const hasResults = html.includes('id="search"') || html.includes('id="rso"')

    if (!hasResults) {
      console.log('[WebSearch] Google availability check failed: No results container found')
      return false
    }

    return true
  } catch (error) {
    console.log('[WebSearch] Google availability check failed:', (error as Error).message)
    return false
  }
}

/**
 * Initialize search engines.
 * Call this at app startup to:
 * - Check Google availability and enable/disable auto-selection
 * - Configure Tavily API key
 * - Adjust engine priorities
 *
 * @param config - Optional configuration
 */
export async function initializeEngines(config?: {
  tavilyApiKey?: string
}): Promise<void> {
  console.log('[WebSearch] Initializing search engines...')

  // 1. Check Google availability
  const googleAvailable = await checkGoogleAvailability()
  console.log(`[WebSearch] Google available: ${googleAvailable}`)

  if (googleAvailable) {
    // Enable Google for automatic selection
    // TypeScript: cast to mutable to override readonly property
    ;(googleEngine as any).autoSelectable = true
    // Adjust Google's priority: high for English, but respect Baidu for pure Chinese
    ;(googleEngine as any).getPriorityScore = function(query: string): number {
      const chineseChars = (query.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length
      const totalChars = query.replace(/\s/g, '').length
      if (totalChars === 0) return 90

      const chineseRatio = chineseChars / totalChars
      if (chineseRatio > 0.8) {
        // Pure Chinese - let Baidu win (Baidu=85, Google=75)
        return 75
      } else if (chineseRatio > 0.5) {
        // Mostly Chinese - Google still good but lower
        return 80
      } else {
        // English/mixed - Google is best
        return 95
      }
    }
    console.log('[WebSearch] Google enabled as primary engine')
  } else {
    console.log('[WebSearch] Google disabled, Bing will be primary')
  }

  // 2. Configure Tavily API key
  if (config?.tavilyApiKey) {
    tavilyEngine.setApiKey(config.tavilyApiKey)
    console.log('[WebSearch] Tavily API key configured')
  } else {
    // Disable Tavily if no API key
    ;(tavilyEngine as any).autoSelectable = false
    console.log('[WebSearch] Tavily disabled (no API key)')
  }

  console.log('[WebSearch] Initialization complete')
}

// ============================================
// Public API
// ============================================

/**
 * Get a search engine by name
 *
 * @param name - Engine name
 * @returns Search engine instance
 * @throws Error if engine not found
 */
export function getEngine(name: EngineName): SearchEngine {
  const engine = engines[name]
  if (!engine) {
    throw new Error(`Unknown search engine: ${name}`)
  }
  return engine
}

/**
 * Get all available engines
 *
 * @returns Array of all engine instances
 */
export function getAllEngines(): SearchEngine[] {
  return Object.values(engines)
}

/**
 * Get all engine names
 *
 * @returns Array of engine names
 */
export function getEngineNames(): EngineName[] {
  return Object.keys(engines) as EngineName[]
}

/**
 * Select the best engine for a query
 *
 * Uses priority scoring from each engine to determine
 * the best match. Higher score = better match.
 *
 * @param query - Search query
 * @returns Best matching engine
 */
export function selectBestEngine(query: string): SearchEngine {
  let bestEngine: SearchEngine = bingEngine
  let bestScore = -1

  for (const engine of getAutoSelectableEngines()) {
    const score = engine.getPriorityScore(query)
    if (score > bestScore) {
      bestScore = score
      bestEngine = engine
    }
  }

  return bestEngine
}

/**
 * Get engines in fallback order for a query
 *
 * Returns engines sorted by priority score (highest first).
 * Used when the primary engine fails and we need to try alternatives.
 *
 * @param query - Search query
 * @returns Engines sorted by priority
 */
export function getEnginesInFallbackOrder(query: string): SearchEngine[] {
  const enginesWithScores = getAutoSelectableEngines().map(engine => ({
    engine,
    score: engine.getPriorityScore(query),
  }))

  // Sort by score descending
  enginesWithScores.sort((a, b) => b.score - a.score)

  return enginesWithScores.map(e => e.engine)
}

/**
 * Resolve engine selection
 *
 * @param engineOption - User's engine preference ('auto', 'bing', 'baidu')
 * @param query - Search query (used for auto-selection)
 * @returns Array of engines to try in order
 */
export function resolveEngines(
  engineOption: 'auto' | EngineName | undefined,
  query: string
): SearchEngine[] {
  if (!engineOption || engineOption === 'auto') {
    // Auto mode: only auto-selectable engines, sorted by priority.
    // Engines like Google (autoSelectable = false) are intentionally excluded.
    return getEnginesInFallbackOrder(query)
  }

  // Specific engine requested: return just that one
  // (no fallback - if user explicitly chose an engine, respect that)
  return [getEngine(engineOption)]
}

// ============================================
// Re-exports
// ============================================

export { SearchEngine } from './base'
export { bingEngine } from './bing'
export { baiduEngine } from './baidu'
export { googleEngine } from './google'
export { tavilyEngine } from './tavily'
export { githubEngine } from './github'
export { gitlabEngine } from './gitlab'
export { huggingfaceEngine } from './huggingface'
