/**
 * Built-in LLM Providers Configuration — Ollama / Gemma 4 only.
 *
 * Simplified from the original multi-provider setup.
 * Uses 'openai' as the provider id so the OpenAI-compat router handles it.
 */

import type { AuthType, ModelOption, ProviderId } from '../types/ai-sources'

// ============================================================================
// Provider Configuration Interface
// ============================================================================

export interface BuiltinProvider {
  id: ProviderId
  name: string
  authType: AuthType
  apiUrl: string
  apiType?: 'chat_completions' | 'responses' | 'anthropic_passthrough'
  modelsUrl?: string
  models: ModelOption[]
  description?: string
  website?: string
  region: 'cn' | 'global'
  recommended?: boolean
  icon?: string
  notes?: string
}

// ============================================================================
// Built-in Providers List
// ============================================================================

export const BUILTIN_PROVIDERS: BuiltinProvider[] = [
  {
    id: 'openai',
    name: 'Ollama (Local)',
    authType: 'api-key',
    apiUrl: 'http://localhost:11434/v1',
    modelsUrl: 'http://localhost:11434/v1/models',
    models: [
      { id: 'gemma4:26b', name: 'Gemma 4 27B' },
      { id: 'gemma4:12b', name: 'Gemma 4 12B' },
      { id: 'gemma4:4b', name: 'Gemma 4 4B' },
    ],
    description: 'Local Gemma 4 models via Ollama. No API key required.',
    website: 'https://ollama.com/',
    region: 'global',
    recommended: true,
    icon: 'cpu',
    notes: 'Run "ollama pull gemma4:26b" to download the model. Ollama must be running at localhost:11434.',
  },
]

// ============================================================================
// Helper Functions
// ============================================================================

export function getBuiltinProvider(id: ProviderId): BuiltinProvider | undefined {
  return BUILTIN_PROVIDERS.find(p => p.id === id)
}

export function isBuiltinProvider(id: string): boolean {
  return BUILTIN_PROVIDERS.some(p => p.id === id)
}

export function getRecommendedProviders(): BuiltinProvider[] {
  return BUILTIN_PROVIDERS.filter(p => p.recommended)
}

export function getProvidersByRegion(region: 'cn' | 'global'): BuiltinProvider[] {
  return BUILTIN_PROVIDERS.filter(p => p.region === region)
}

export function getApiKeyProviders(): BuiltinProvider[] {
  return BUILTIN_PROVIDERS.filter(p => p.authType === 'api-key')
}

export function getProviderDisplayInfo(id: ProviderId): { name: string; icon: string; description: string } {
  const provider = getBuiltinProvider(id)
  if (provider) {
    return { name: provider.name, icon: provider.icon || 'server', description: provider.description || '' }
  }
  return { name: id, icon: 'server', description: '' }
}

export function getDefaultModel(id: ProviderId): string | undefined {
  return getBuiltinProvider(id)?.models[0]?.id
}

export function isOAuthProvider(id: ProviderId): boolean {
  return getBuiltinProvider(id)?.authType === 'oauth'
}

export function isAnthropicProvider(id: ProviderId): boolean {
  return id === 'anthropic'
}

export function getAllProviderIds(): ProviderId[] {
  return BUILTIN_PROVIDERS.map(p => p.id)
}
