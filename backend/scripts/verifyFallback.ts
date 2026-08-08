// Phase 5 verification: fallback chain for the AI provider router.
// Usage: npx ts-node --transpile-only scripts/verifyFallback.ts <scenario>
//   scenarios: all-up | omni-down | all-down

require('dotenv').config();

const scenario = process.argv[2] || 'all-up';
console.log(`\n=== Scenario: ${scenario} ===`);

if (scenario === 'omni-down') {
  process.env.OMNIROUTE_URL = 'http://127.0.0.1:1';
} else if (scenario === 'all-down') {
  process.env.OMNIROUTE_URL = 'http://127.0.0.1:1';
  process.env.OPENCODE_SERVER_URL = 'http://127.0.0.1:1';
}

const { createGatewaySession, sendGatewayMessage, gatewayStatus } = require('../src/services/providerRouter');

async function main() {
  const status = gatewayStatus();
  console.log(`gatewayStatus() -> enabled=${status.enabled} provider=${status.provider} baseUrl=${status.baseUrl}`);

  const session = await createGatewaySession('fallback-verification');
  console.log(`createGatewaySession -> provider=${session.provider} fromMock=${session.fromMock}`);

  if (session.fromMock) {
    console.log('PASS: fell back to deterministic mock. (No real send attempted.)');
    return;
  }

  const result = await sendGatewayMessage(session.gatewaySessionId, 'Reply with exactly one word: OK');
  const clean = String(result.text).trim();
  console.log(`sendGatewayMessage -> provider=${result.provider} model=${result.model} latencyMs=${result.latencyMs} fromMock=${result.fromMock}`);
  console.log(`reply sample: ${JSON.stringify(clean.slice(0, 60))}`);
  console.log(result.fromMock === false ? 'PASS: real AI response received.' : 'FAIL: expected real response.');
}

main()
  .catch((err) => {
    console.error('FAIL:', err && err.message ? err.message : err);
    process.exit(1);
  });
