/**
 * Provider abstraction types shared by the AI gateway router and its adapters.
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ProviderSendResult {
  text: string;
  provider: string;
  model: string | null;
}

export interface ProviderAdapter {
  readonly name: string;
  readonly baseUrl: string;
  isConfigured(): boolean;
  /** Prepare a provider-side session. Should throw when the provider is unreachable. */
  createSession(title: string): Promise<string>;
  /**
   * Send a turn and await the assistant reply.
   * @param continueOnly true when the provider session already holds the prior turns;
   *   false when the full `history` must be replayed into a fresh session.
   */
  send(
    providerSessionId: string,
    history: ChatMessage[],
    nextContent: string,
    continueOnly: boolean,
  ): Promise<ProviderSendResult>;
  abort(providerSessionId: string): Promise<void>;
}
