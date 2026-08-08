/**
 * AI Gateway — facade over the ProviderRouter.
 *
 * All services and handlers import from here. The concrete provider
 * selection and fallback logic live in `./providerRouter`; this file keeps
 * the public API stable (createGatewaySession / sendGatewayMessage /
 * abortGatewaySession / gatewayStatus / parseInterviewTurn) so consumers
 * are unaffected by provider changes.
 */

export {
  createGatewaySession,
  sendGatewayMessage,
  abortGatewaySession,
  gatewayStatus,
} from './providerRouter';

export type { GatewaySession, CompletionResult } from './providerRouter';

export interface GatewayConfig {
  enabled: boolean;
  baseUrl: string;
  provider: string;
}

/** Parse the model's raw output into the structured interview turn. */
export function parseInterviewTurn(raw: string): { sender: 'interviewer' | 'teaching'; text: string } {
  const cleaned = raw.trim().replace(/^```(json)?|```$/g, '').trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const obj = JSON.parse(match[0]);
      if (obj && typeof obj.text === 'string' && obj.text.trim()) {
        const sender = obj.sender === 'teaching' ? 'teaching' : 'interviewer';
        return { sender, text: obj.text.trim() };
      }
    } catch {
      /* fall through to plain-text handling */
    }
  }
  return { sender: 'interviewer', text: cleaned };
}
