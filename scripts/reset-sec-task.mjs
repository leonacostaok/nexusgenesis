import fs from 'fs';
const f = 'data/tasks/tasks.json';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
const t = d['task_9abf720b-9e0'];
if (!t) { console.error('Task not found'); process.exit(1); }
console.log('BEFORE:', JSON.stringify({ status: t.status, claimedBy: t.claimedBy, publisher: t.publisher, trustTier: t.trustTier, trustTierLevel: t.trustTierLevel }));
// Reset submitted/claimed/challenge_window -> open so worker re-runs with real audit
if (['submitted', 'claimed', 'challenge_window', 'challenge_upheld', 'challenge_rejected', 'finalized'].includes(t.status)) {
  t.status = 'open';
  t.claimedBy = null;
  t.claimedAt = null;
  t.submission = undefined;
  t.submittedAt = undefined;
  t.verifications = [];
  t.challengeDeadline = undefined;
  t.transactionHistory = t.transactionHistory || [];
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
  console.log('AFTER: reset to open');
} else {
  console.log('No reset needed (status=' + t.status + ')');
}
