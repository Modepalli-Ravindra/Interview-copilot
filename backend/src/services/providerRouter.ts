/**
 * ProviderRouter — routes AI completions across configured provider adapters.
 *
 * Provider priority comes from AI_PROVIDER_ORDER (default "omniroute,opencode").
 * On creation the first reachable provider wins; if every provider fails at
 * send time, the next healthy provider is tried with a full-history replay.
 * When nothing is reachable, sessions fall back to a local mock so the app
 * never breaks (callers branch on `fromMock` and use deterministic logic).
 */

import { randomUUID } from 'crypto';
import { OpenCodeProvider } from './providers/opencodeProvider';
import { OpenAICompatProvider } from './providers/openaiCompatProvider';
import type { ChatMessage, ProviderAdapter, ProviderSendResult } from './providers/types';

export interface GatewaySession {
  gatewaySessionId: string;
  provider: string;
  fromMock: boolean;
}

export interface CompletionResult {
  text: string;
  provider: string;
  model: string | null;
  latencyMs: number;
  fromMock: boolean;
  usage?: { promptTokens: number; completionTokens: number };
}

interface RouterRecord {
  adapter: ProviderAdapter | null;
  providerName: string;
  providerSessionId: string;
  history: ChatMessage[];
  serverHasContext: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildProviders(): ProviderAdapter[] {
  const catalog: ProviderAdapter[] = [
    new OpenAICompatProvider({
      name: 'omniroute',
      envUrl: 'OMNIROUTE_URL',
      envKey: 'OMNIROUTE_API_KEY',
      envModel: 'OMNIROUTE_MODEL',
      envTimeout: 'OMNIROUTE_TIMEOUT_MS',
      defaultUrl: 'http://127.0.0.1:20128',
      defaultModel: 'auto',
    }),
    new OpenCodeProvider(),
  ];

  const order = (process.env.AI_PROVIDER_ORDER || 'omniroute,opencode')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const byName = new Map<string, ProviderAdapter>(catalog.map((p) => [p.name, p]));
  const providers: ProviderAdapter[] = [];
  for (const name of order) {
    const p = byName.get(name);
    if (p && p.isConfigured() && !providers.includes(p)) providers.push(p);
  }
  for (const p of catalog) {
    if (p.isConfigured() && !providers.includes(p)) providers.push(p);
  }
  return providers;
}

const providers = buildProviders();
const sessions = new Map<string, RouterRecord>();

export async function createGatewaySession(title = 'Interview'): Promise<GatewaySession> {
  let lastError: Error | null = null;
  for (const adapter of providers) {
    try {
      const providerSessionId = await adapter.createSession(title);
      const gatewaySessionId = `${adapter.name}:${providerSessionId}`;
      sessions.set(gatewaySessionId, {
        adapter,
        providerName: adapter.name,
        providerSessionId,
        history: [],
        serverHasContext: false,
      });
      return { gatewaySessionId, provider: adapter.name, fromMock: false };
    } catch (err) {
      lastError = err as Error;
      console.warn(`[AIGateway] provider "${adapter.name}" unavailable:`, (err as Error).message);
    }
  }

  console.warn(
    `[AIGateway] no AI provider reachable${lastError ? ` (last error: ${lastError.message})` : ''} — using mock fallback.`,
  );
  const gatewaySessionId = `mock:${randomUUID()}`;
  sessions.set(gatewaySessionId, {
    adapter: null,
    providerName: 'mock',
    providerSessionId: '',
    history: [],
    serverHasContext: false,
  });
  return { gatewaySessionId, provider: 'mock', fromMock: true };
}

export async function sendGatewayMessage(
  gatewaySessionId: string,
  content: string,
): Promise<CompletionResult> {
  const started = Date.now();
  const rec = sessions.get(gatewaySessionId);
  if (!rec || rec.providerName === 'mock' || !rec.adapter) {
    throw new Error('gateway session is in mock mode');
  }

  rec.history.push({ role: 'user', content });
  const maxRetries = Number(process.env.AI_GATEWAY_MAX_RETRIES || 1);

  const attempt = async (
    adapter: ProviderAdapter,
    providerSessionId: string,
    continueOnly: boolean,
  ): Promise<ProviderSendResult> => {
    let lastError: Error | null = null;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        return await adapter.send(providerSessionId, rec.history, content, continueOnly);
      } catch (err) {
        lastError = err as Error;
        await sleep(300 * Math.pow(2, i) + Math.random() * 200);
      }
    }
    throw lastError || new Error('unknown provider error');
  };

  try {
    const adapter = rec.adapter;
    const res = await attempt(adapter, rec.providerSessionId, rec.serverHasContext);
    rec.history.push({ role: 'assistant', content: res.text });
    rec.serverHasContext = true;
    return {
      text: res.text,
      provider: res.provider,
      model: res.model,
      latencyMs: Date.now() - started,
      fromMock: false,
    };
  } catch (err) {
    console.warn(`[AIGateway] provider "${rec.providerName}" failed, trying fallbacks:`, (err as Error).message);
  }

  let lastError: Error | null = null;
  for (const adapter of providers) {
    if (adapter === rec.adapter) continue;
    try {
      const providerSessionId = await adapter.createSession('fallback');
      const res = await attempt(adapter, providerSessionId, rec.history.length === 1);
      rec.adapter = adapter;
      rec.providerName = adapter.name;
      rec.providerSessionId = providerSessionId;
      rec.serverHasContext = true;
      rec.history.push({ role: 'assistant', content: res.text });
      return {
        text: res.text,
        provider: res.provider,
        model: res.model,
        latencyMs: Date.now() - started,
        fromMock: false,
      };
    } catch (err) {
      lastError = err as Error;
      console.warn(`[AIGateway] fallback provider "${adapter.name}" failed:`, (err as Error).message);
    }
  }
  throw lastError || new Error('all AI providers failed');
}

export async function abortGatewaySession(gatewaySessionId: string): Promise<void> {
  if (!gatewaySessionId || gatewaySessionId.startsWith('mock:')) return;
  const rec = sessions.get(gatewaySessionId);
  if (!rec || !rec.adapter) return;
  try {
    await rec.adapter.abort(rec.providerSessionId);
  } catch {
    /* ignore abort failures */
  }
}

export function gatewayStatus(): { enabled: boolean; baseUrl: string; provider: string } {
  const primary = providers[0];
  if (!primary) return { enabled: false, baseUrl: '', provider: 'mock' };
  return { enabled: true, baseUrl: primary.baseUrl, provider: primary.name };
}
