import fs from 'fs';
const d = JSON.parse(fs.readFileSync('data/tasks/tasks.json', 'utf8'));
const t = d['task_9abf720b-9e0'];
if (!t) { console.error('Task not found'); process.exit(1); }
console.log('status:', t.status);
console.log('claimedBy:', t.claimedBy);
console.log('hasSub:', t.submission ? 'yes' : 'no');
console.log('txHistory:', (t.transactionHistory || []).length);
if (t.submission) {
  console.log('submission.type:', t.submission.type);
  console.log('submission.summary:', JSON.stringify(t.submission.summary));
}
