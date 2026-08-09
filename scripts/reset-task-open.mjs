import fs from 'fs';
const f = 'data/tasks/tasks.json';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
const t = d['task_9abf720b-9e0'];
if (t) {
  t.status = 'open';
  t.claimedBy = null;
  t.claimedAt = null;
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
  console.log('Task reset to open status');
} else {
  console.error('Task not found!');
  process.exit(1);
}
