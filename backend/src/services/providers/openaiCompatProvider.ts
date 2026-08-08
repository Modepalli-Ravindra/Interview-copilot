/**
 * OpenAI-compatible provider adapter — talks to any server exposing
 * `POST /v1/chat/completions` (e.g. OmniRoute on http://localhost:20128).
 * Stateless: every send passes the full conversation history, which also
 * makes cross-provider fallback replay trivial.
 */

import { randomUUID } from 'crypto';
import type { ChatMessage, ProviderAdapter, ProviderSendResult } from './types';

export interface OpenAICompatOptions {
  name: string;
  envUrl: string;
  envKey: string;
  envModel: string;
  envTimeout: string;
  defaultUrl: string;
  defaultModel: string;
}

export class OpenAICompatProvider implements ProviderAdapter {
  readonly name: string;
  readonly baseUrl: string;

  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private envUrl: string;

  constructor(opts: OpenAICompatOptions) {
    this.name = opts.name;
    this.envUrl = opts.envUrl;
    this.baseUrl = (process.env[opts.envUrl] || opts.defaultUrl).replace(/\/+$/, '');
    this.apiKey = process.env[opts.envKey] || '';
    this.model = process.env[opts.envModel] || opts.defaultModel;
    this.timeoutMs = Number(process.env[opts.envTimeout] || 90000);
  }

  isConfigured(): boolean {
    return process.env[this.envUrl] !== 'disabled';
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
          ...(init?.headers || {}),
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async createSession(_title = 'Interview'): Promise<string> {
    const res = await this.fetch('/v1/models', { method: 'GET' });
    await res.arrayBuffer().catch(() => null);
    return randomUUID();
  }

  async send(
    _providerSessionId: string,
    history: ChatMessage[],
    _nextContent: string,
    _continueOnly: boolean,
  ): Promise<ProviderSendResult> {
    const res = await this.fetch('/v1/chat/completions', {
      method: 'POST',
      body: JSON.stringify({
        model: this.model,
        messages: history,
        stream: false,
      }),
    });
    if (!res.ok) {
      throw new Error(`openai-compatible http ${res.status} ${res.statusText}`);
    }
    const body: any = await res.json();
    const text = body?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('openai-compatible response contained no message content');
    }
    return { text: text.trim(), provider: this.name, model: this.model };
  }

  async abort(_providerSessionId: string): Promise<void> {
    /* stateless — nothing to abort server-side */
  }
}
