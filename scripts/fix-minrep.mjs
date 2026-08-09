import fs from 'fs';
const f = 'data/tasks/tasks.json';
const d = JSON.parse(fs.readFileSync(f, 'utf8'));
if (d['task_9abf720b-9e0']) {
  d['task_9abf720b-9e0'].minReputation = 0;
  fs.writeFileSync(f, JSON.stringify(d, null, 2));
  console.log('Updated minReputation to 0 for task_9abf720b-9e0');
} else {
  console.error('Task not found!');
  process.exit(1);
}
