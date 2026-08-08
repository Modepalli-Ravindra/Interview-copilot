/**
 * OpenCode provider adapter — talks to a local `opencode serve` instance
 * (default http://127.0.0.1:4096) using its native session API:
 *   POST /session            -> create a chat session
 *   POST /session/:id/message -> send a message, wait for the reply
 *   POST /session/:id/abort   -> stop an in-flight generation
 */

import type { ChatMessage, ProviderAdapter, ProviderSendResult } from './types';

export class OpenCodeProvider implements ProviderAdapter {
  readonly name = 'opencode';
  readonly baseUrl: string;

  private username: string;
  private password: string;
  private timeoutMs: number;
  private model: string | null;

  constructor() {
    this.baseUrl = (process.env.OPENCODE_SERVER_URL || 'http://127.0.0.1:4096').replace(/\/+$/, '');
    this.username = process.env.OPENCODE_SERVER_USERNAME || 'opencode';
    this.password = process.env.OPENCODE_SERVER_PASSWORD || '';
    this.timeoutMs = Number(process.env.OPENCODE_SERVER_TIMEOUT_MS || 90000);
    this.model = process.env.OPENCODE_MODEL || null;
  }

  isConfigured(): boolean {
    return process.env.OPENCODE_SERVER_URL !== 'disabled';
  }

  private authHeader(): Record<string, string> {
    if (!this.password) return {};
    const token = Buffer.from(`${this.username}:${this.password}`).toString('base64');
    return { Authorization: `Basic ${token}` };
  }

  private async gatewayFetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...this.authHeader(),
          ...(init?.headers || {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private extractAssistantText(body: any): string | null {
    if (!body) return null;
    const parts: any[] = Array.isArray(body.parts) ? body.parts : [];
    const chunks: string[] = [];
    for (const part of parts) {
      const type = part?.type;
      const text = part?.text;
      if (typeof text !== 'string') continue;
      if (type && type !== 'text') continue;
      if (text.trim()) chunks.push(text);
    }
    if (chunks.length > 0) return chunks.join('\n').trim();
    if (typeof body.text === 'string' && body.text.trim()) return body.text.trim();
    if (typeof body.content === 'string' && body.content.trim()) return body.content.trim();
    if (body.info?.role === 'assistant') return this.extractAssistantText(body.info);
    return null;
  }

  private replayPrompt(history: ChatMessage[], nextContent: string): string {
    const prior = history
      .slice(0, -1)
      .map((m) => `[${m.role}] ${m.content}`)
      .join('\n');
    return prior
      ? `Here is the conversation so far:\n\n${prior}\n\nContinue the conversation naturally.\n\n${nextContent}`
      : nextContent;
  }

  async createSession(title = 'Interview'): Promise<string> {
    const res = await this.gatewayFetch('/session', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    if (!res.ok) throw new Error(`create session failed: ${res.status} ${res.statusText}`);
    const body: any = await res.json();
    const id = body?.id || body?.sessionID || body?.session?.id;
    if (!id) throw new Error('create session: missing id in response');
    return String(id);
  }

  async send(
    providerSessionId: string,
    history: ChatMessage[],
    nextContent: string,
    continueOnly: boolean,
  ): Promise<ProviderSendResult> {
    const content = continueOnly ? nextContent : this.replayPrompt(history, nextContent);
    const res = await this.gatewayFetch(`/session/${providerSessionId}/message`, {
      method: 'POST',
      body: JSON.stringify({
        parts: [{ type: 'text', text: content }],
        noReply: false,
        model: parseModelParam(this.model),
      }),
    });
    if (res.status === 429 || res.status >= 500) {
      throw new Error(`gateway http ${res.status} ${res.statusText}`);
    }
    if (!res.ok) {
      throw new Error(`gateway http ${res.status} ${res.statusText}`);
    }
    const body: any = await res.json();
    const text = this.extractAssistantText(body);
    if (!text) throw new Error('gateway returned no assistant text');
    return { text, provider: this.name, model: this.model };
  }

  async abort(providerSessionId: string): Promise<void> {
    try {
      await this.gatewayFetch(`/session/${providerSessionId}/abort`, { method: 'POST' });
    } catch {
      /* ignore abort failures */
    }
  }
}

/**
 * Map an OPENCODE_MODEL value to the shape the server expects.
 * "provider/model" -> { providerID, modelID }; anything else -> the raw value.
 */
function parseModelParam(model: string | null): unknown {
  if (!model) return undefined;
  const slash = model.indexOf('/');
  if (slash > 0 && slash < model.length - 1) {
    return {
      providerID: model.slice(0, slash),
      modelID: model.slice(slash + 1),
    };
  }
  return model;
}
