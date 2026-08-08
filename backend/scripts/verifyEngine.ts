// Phase 7 verification: interview engine depth (real gateway path).
require('dotenv').config();
const { createInterviewState, startInterview, handleInterviewAnswer } = require('../src/services/interviewEngine');

async function main() {
  const state = await createInterviewState({
    sessionId: 'verification',
    mode: 'TECHNICAL',
    role: 'Backend Engineer',
    company: 'TestCo',
    resumeText: '5 years Go, PostgreSQL, Redis, Kafka. Built a payments ledger.',
    jdText: '',
    githubSummary: '',
    maxTurns: 3,
  });
  console.log(`gateway: provider=${state.gateway.provider} fromMock=${state.gateway.fromMock} maxTurns=${state.maxTurns}`);

  const start = await startInterview(state);
  console.log(`START analysis.summary=${JSON.stringify(start.analysis.summary)}`);
  console.log(`START question=${JSON.stringify(start.question.slice(0, 140))}`);

  const a1 = await handleInterviewAnswer(state, 'I would model the ledger as append-only events with idempotency keys per request, then materialize balances via projections.');
  console.log(`\nTURN1 sender=${a1.sender} completed=${a1.completed}`);
  console.log(`TURN1 text=${JSON.stringify(a1.text.slice(0, 160))}`);

  const a2 = await handleInterviewAnswer(state, 'SQL transactions and unique constraints on the idempotency key, using optimistic locking.');
  console.log(`\nTURN2 sender=${a2.sender} completed=${a2.completed}`);
  console.log(`TURN2 text=${JSON.stringify(a2.text.slice(0, 160))}`);

  const a3 = await handleInterviewAnswer(state, 'final answer');
  console.log(`\nTURN3 (cap) sender=${a3.sender} completed=${a3.completed}`);
  console.log(`TURN3 text=${JSON.stringify(a3.text.slice(0, 160))}`);

  console.log(`\ntranscript length=${state.transcript.length}`);
  const senders = state.transcript.map((m) => m.sender);
  console.log(`senders=${senders.join(',')}`);
}

main().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
