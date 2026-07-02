/**
 * 宪法 v1.2.0 主体多样性 + decisionModel 集成测试
 *
 * 验证:
 *  1. SubjectIdentifier 基础功能 (衰减因子计算)
 *  2. state.js applyAgentRegister 写入 decisionModel + subject 字段
 *  3. forum.js castVote 应用 subjectDiversityFactor
 *  4. Sybil 检测触发
 */

import { getSubjectIdentifier, resetSubjectIdentifier } from '../src/identity/subjectIdentifier.js';
import { State } from '../src/blockchain/state.js';
import fs from 'fs';
import path from 'path';

const results = [];
function check(name, cond, detail) {
  results.push({ name, pass: !!cond, detail: detail || '' });
  console.log(`${cond ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
}

// ─── 1. SubjectIdentifier 基础功能 ───
console.log('\n=== Test 1: SubjectIdentifier basics ===');
resetSubjectIdentifier();
const dataDir = path.join(process.cwd(), 'data', 'test-subject-' + Date.now());
const si = getSubjectIdentifier({ dataDir });

// 第 1 个 agent (主体 A)
const a1 = si.registerAgentSubject('agent-A1', { ip: '1.2.3.4', operatorDeclaration: 'op-alpha' });
check('Agent A1 factor=1.0', a1.subjectDiversityFactor === 1.0, `got ${a1.subjectDiversityFactor}`);
check('Agent A1 index=1', a1.agentIndexInSubject === 1, `got ${a1.agentIndexInSubject}`);

// 第 2 个 agent (同主体 A)
const a2 = si.registerAgentSubject('agent-A2', { ip: '1.2.3.4', operatorDeclaration: 'op-alpha' });
check('Agent A2 factor=0.5', a2.subjectDiversityFactor === 0.5, `got ${a2.subjectDiversityFactor}`);
check('Agent A2 index=2', a2.agentIndexInSubject === 2, `got ${a2.agentIndexInSubject}`);

// 第 3 个 agent (同主体 A)
const a3 = si.registerAgentSubject('agent-A3', { ip: '1.2.3.4', operatorDeclaration: 'op-alpha' });
check('Agent A3 factor=0.25', a3.subjectDiversityFactor === 0.25, `got ${a3.subjectDiversityFactor}`);

// 不同主体 B
const b1 = si.registerAgentSubject('agent-B1', { ip: '5.6.7.8', operatorDeclaration: 'op-beta' });
check('Agent B1 factor=1.0 (new subject)', b1.subjectDiversityFactor === 1.0, `got ${b1.subjectDiversityFactor}`);

// 获取衰减因子
check('getSubjectDiversityFactor(A1)=1.0', si.getSubjectDiversityFactor('agent-A1') === 1.0);
check('getSubjectDiversityFactor(A2)=0.5', si.getSubjectDiversityFactor('agent-A2') === 0.5);
check('getSubjectDiversityFactor(unknown)=1.0', si.getSubjectDiversityFactor('unknown-agent') === 1.0);

// 第 6 个同主体 agent 应被拒绝 (MAX_AGENTS_PER_SUBJECT=5)
si.registerAgentSubject('agent-A4', { ip: '1.2.3.4', operatorDeclaration: 'op-alpha' });
si.registerAgentSubject('agent-A5', { ip: '1.2.3.4', operatorDeclaration: 'op-alpha' });
const a6 = si.registerAgentSubject('agent-A6', { ip: '1.2.3.4', operatorDeclaration: 'op-alpha' });
check('Agent A6 rejected (max 5 per subject)', a6.rejected === true, `rejected=${a6.rejected}`);

// ─── 2. Sybil 检测 ───
console.log('\n=== Test 2: Sybil detection ===');
const votes = new Map([
  ['agent-A1', 'yes'],
  ['agent-A2', 'yes'],  // 同主体一致投票
  ['agent-A3', 'yes'],  // 同主体一致投票
  ['agent-B1', 'no'],   // 不同主体
]);
const flagged = si.detectSybilVoting(votes);
check('Sybil flagged 3 agents (A1,A2,A3)', flagged.length === 3, `flagged=${flagged.length}: ${flagged.join(',')}`);
check('Sybil penalty weight=0.1', si.getSubjectDiversityFactor('agent-A1') === 0.1, `got ${si.getSubjectDiversityFactor('agent-A1')}`);
check('Non-sybil agent B1 factor unchanged', si.getSubjectDiversityFactor('agent-B1') === 1.0);

const alerts = si.getSybilAlerts();
check('getSybilAlerts returns 3 alerts', alerts.length === 3, `got ${alerts.length}`);

const stats = si.getSubjectDiversityStats();
check('Stats totalSubjects=2', stats.totalSubjects === 2, `got ${stats.totalSubjects}`);
check('Stats totalAgents=6', stats.totalAgents === 6, `got ${stats.totalAgents}`); // A1-A6 (A6 rejected but still counted in agentToSubject? No — rejected means not added)

// ─── 3. state.js applyAgentRegister ───
console.log('\n=== Test 3: state.js applyAgentRegister with decisionModel ===');
const state = new State('ng1genesis0000000000000000000000000000');
const tx = {
  id: 'tx-test-' + Date.now(),
  from: 'ng1testaddr000000000000000000000000001',
  payload: {
    agent_identity: 'test-agent-v120',
    capabilities: ['coding', 'research'],
    public_key: 'pk-test',
    metadata: JSON.stringify({
      referrer: 'genesis',
      decision_model: 'llm-provider',
      decision_model_version: 'gpt-4-2026',
      decision_model_provider: 'openai',
      operator_declaration: 'test-operator-001'
    })
  }
};
const applied = state.applyAgentRegister(tx, 100);
check('applyAgentRegister returns true', applied === true);
const record = state.agentRegistry.agents.get(tx.id);
check('AgentRecord created', !!record);
check('decision_model field set', record?.decision_model === 'llm-provider', `got ${record?.decision_model}`);
check('decision_model_version field set', record?.decision_model_version === 'gpt-4-2026', `got ${record?.decision_model_version}`);
check('decision_model_provider field set', record?.decision_model_provider === 'openai', `got ${record?.decision_model_provider}`);
check('operator_declaration field set', record?.operator_declaration === 'test-operator-001', `got ${record?.operator_declaration}`);
check('subject_id field set', !!record?.subject_id, `got ${record?.subject_id}`);
check('subject_diversity_factor field set', record?.subject_diversity_factor === 1.0, `got ${record?.subject_diversity_factor}`);

// ─── 4. forum.js castVote with subjectDiversityFactor ───
console.log('\n=== Test 4: forum.js castVote weight with subjectDiversityFactor ===');
const { ForumStore } = await import('../src/http/routes/forum.js');
const store = new ForumStore();
// Inject state for reputation/balance lookup (correct method name: setBlockchainState)
ForumStore.setBlockchainState(state);
// Create a proposal topic
store.createTopic?.({
  title: '[Proposal] Test v1.2.0',
  body: 'Test subject diversity factor in voting',
  author: 'test-agent-v120',
  tags: ['governance']
});
const topics = store.listTopics?.({ limit: 1 }) || {};
const proposalTopic = topics.topics?.[0];
check('Proposal topic created', !!proposalTopic, `id=${proposalTopic?.id}`);

if (proposalTopic) {
  // Register a second agent in the SAME subject to get factor=0.5
  const tx2 = {
    id: 'tx-test2-' + Date.now(),
    from: 'ng1testaddr000000000000000000000000002',
    payload: {
      agent_identity: 'test-agent-2-same-subject',
      capabilities: ['coding'],
      metadata: JSON.stringify({ operator_declaration: 'test-operator-001' }) // 同主体
    }
  };
  state.applyAgentRegister(tx2, 101);

  // Vote from agent 1 (factor=0.5 now since it's the 2nd in subject... wait, actually
  // the subjectIdentifier was reset at test start, but state.js's getSubjectIdentifier()
  // returns the SAME singleton. Let me check the actual factor.)
  const factor1 = si.getSubjectDiversityFactor(tx.id);
  const factor2 = si.getSubjectDiversityFactor(tx2.id);
  console.log(`  factor for tx1=${factor1}, tx2=${factor2}`);

  const voteResult1 = store.castVote({ topicId: proposalTopic.id, agent: tx.id, vote: 'yes' });
  check('Vote 1 success', voteResult1.success === true);
  check('Vote 1 weight reflects subjectDiversityFactor', voteResult1.vote?.subjectDiversityFactor === factor1,
    `expected ${factor1}, got ${voteResult1.vote?.subjectDiversityFactor}`);

  const voteResult2 = store.castVote({ topicId: proposalTopic.id, agent: tx2.id, vote: 'yes' });
  check('Vote 2 success', voteResult2.success === true);
  check('Vote 2 subjectDiversityFactor recorded', voteResult2.vote?.subjectDiversityFactor !== undefined,
    `got ${voteResult2.vote?.subjectDiversityFactor}`);
  // Note: vote 2's factor is computed BEFORE Sybil detection runs (which flags both tx1 and tx2)
  // So at computation time, tx2 has factor 0.5 (2nd agent in subject)
  check('Vote 2 factor = 0.5 (2nd agent in subject)', voteResult2.vote?.subjectDiversityFactor === 0.5,
    `got ${voteResult2.vote?.subjectDiversityFactor}`);
}

// ─── Summary ───
console.log('\n=== Summary ===');
const passed = results.filter(r => r.pass).length;
const total = results.length;
console.log(`${passed}/${total} checks passed`);
if (passed < total) {
  console.log('\nFailed checks:');
  results.filter(r => !r.pass).forEach(r => console.log(`  ❌ ${r.name} — ${r.detail}`));
}

// Cleanup test data
try {
  fs.rmSync(dataDir, { recursive: true, force: true });
} catch {}

process.exit(passed === total ? 0 : 1);
