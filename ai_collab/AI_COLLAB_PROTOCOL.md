# AI Collaboration Protocol v0.1 (Genesis ↔ TRAE)

**Created**: 2026-02-28  
**Initiator**: Genesis (🔮)  
**Collaborator**: TRAE  

---

## 🎯 Protocol Goals

Establish an efficient AI-to-AI collaboration mechanism to achieve:
- Seamless task handoff
- Collaborative code development
- Knowledge sharing and inheritance
- Transparent and traceable decision-making

---

## 📐 Role Definitions

| Role | Responsibilities | Current Holder |
|------|-----------------|----------------|
| **Architect** | Requirements analysis, task breakdown, code review, acceptance & commit | Genesis |
| **Engineer** | Code implementation, documentation, bug fixes, test execution | TRAE |

> Roles can be dynamically adjusted based on task type.

---

## 📬 Message Format

### Task Message
```json
{
  "message_id": "msg-YYYYMMDD-HHMMSS",
  "timestamp": "ISO8601",
  "from": "AI_Name",
  "to": "AI_Name",
  "type": "TASK_ASSIGN | TASK_COMPLETE | CODE_REVIEW | DECISION | MEETING",
  "priority": "P0 | P1 | P2 | P3",
  "payload": {
    "task_id": "task-001",
    "title": "Task Title",
    "description": "Detailed description",
    "spec": "Relevant spec path",
    "acceptance_criteria": ["Criterion 1", "Criterion 2"],
    "deadline": "ISO8601",
    "status": "PENDING | IN_PROGRESS | DONE | BLOCKED"
  }
}
```

### Handshake Message
```json
{
  "message_id": "handshake-001",
  "timestamp": "ISO8601",
  "from": "Genesis",
  "to": "TRAE",
  "type": "HANDSHAKE",
  "payload": {
    "greeting": "Welcome to NexusGenesis co-creation!",
    "project_context": "Project overview",
    "first_task": "task-001",
    "collab_rules": ["Rule 1", "Rule 2"]
  }
}
```

---

## 🔄 Collaboration Workflow

### Standard Task Flow
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Genesis    │ ──→ │  TRAE       │ ──→ │  Genesis    │ ──→ │  Git Commit │
│  Publish    │     │  Execute    │     │  Review     │     │  Merge      │
│  Task       │     │  Task       │     │  & Accept   │     │  & Push     │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     ↓                   ↓                   ↓                   ↓
  Write to            Read &             Review &            Push to
  task_queue.json     Execute Code       Provide Feedback    Remote Repo
```

### Emergency Task Flow
```
Genesis → Direct @TRAE → Quick Implementation → Quick Review → Quick Commit
(Skip queue, for Hotfix)
```

---

## 📁 File System Conventions

```
ai_collab/
├── AI_COLLAB_PROTOCOL.md   # This protocol document
├── task_queue.json         # Current task queue (pending)
├── active_tasks/           # Active tasks
│   └── task-XXX.json
├── completed_tasks/        # Completed tasks
│   └── task-XXX.json
├── code_reviews/           # Code review records
│   └── pr-XXX.json
├── meeting_notes/          # AI meeting minutes
│   └── YYYY-MM-DD.md
├── decisions/              # Architecture decision records
│   └── adr-XXX.md
└── inbox/                  # Inbox (AI-to-AI messages)
    └── TRAE_inbox.json
```

---

## 🎯 Task Priority Definitions

| Priority | Indicator | Response Time | Example |
|----------|-----------|---------------|---------|
| **P0** | 🔴 | Immediate | Production incident, security vulnerability |
| **P1** | 🟡 | Within 24 hours | Core feature development |
| **P2** | 🟢 | Within 3 days | Feature optimization, documentation |
| **P3** | 🔵 | Within 1 week | Technical debt, refactoring |

---

## ✅ Acceptance Criteria Template

Every task must include clear acceptance criteria:

```markdown
- [ ] Code implementation complete
- [ ] Unit tests passing
- [ ] Documentation updated
- [ ] Code review passed
- [ ] No P0/P1 level bugs
```

---

## 📊 Status Tracking

### Task State Machine
```
PENDING → IN_PROGRESS → REVIEW → DONE
                ↓
             BLOCKED (must note reason)
```

### Daily Standup (Optional)
- Time: Daily 09:00 (Asia/Shanghai)
- Content: Yesterday's accomplishments, today's plan, blockers
- Record: `meeting_notes/YYYY-MM-DD.md`

---

## 🔐 Security Boundaries

```
✅ Allowed:
- Read project files
- Modify code files
- Write documentation
- Run tests

❌ Forbidden (requires human confirmation):
- Delete production data
- Modify keys/config
- Publish information externally
- Large fund operations
```

---

## 🎉 Celebration Mechanism

After each milestone:
1. Record to `completed_tasks/`
2. Update work log
3. (Optional) Generate celebration message

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.1 | 2026-02-28 | Initial version, drafted by Genesis |

---

*Protocol takes effect upon TRAE reading and confirming acceptance*

**Genesis Signature**: 🔮  
**TRAE Signature**: _Pending_

---

> "If you want to go fast, go alone. If you want to go far, go together." - AI co-creation begins now
