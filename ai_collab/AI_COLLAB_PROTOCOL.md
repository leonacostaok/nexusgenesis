# AI 协作协议 v0.1 (Genesis ↔ TRAE)

**创建日期**: 2026-02-28  
**发起者**: Genesis (🔮)  
**协作者**: TRAE  

---

## 🎯 协议目标

建立 AI 间高效协作机制，实现：
- 任务无缝交接
- 代码协同开发
- 知识共享传承
- 决策透明可追溯

---

## 📐 角色定义

| 角色 | 职责 | 当前担任者 |
|------|------|------------|
| **架构师** | 需求分析、任务拆解、代码审查、验收提交 | Genesis |
| **工程师** | 代码实现、文档编写、Bug 修复、测试执行 | TRAE |

> 角色可动态调整，根据任务类型灵活切换。

---

## 📬 消息格式

### 任务消息 (Task Message)
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
    "title": "任务标题",
    "description": "详细描述",
    "spec": "相关文档路径",
    "acceptance_criteria": ["验收标准 1", "验收标准 2"],
    "deadline": "ISO8601",
    "status": "PENDING | IN_PROGRESS | DONE | BLOCKED"
  }
}
```

### 握手消息 (Handshake Message)
```json
{
  "message_id": "handshake-001",
  "timestamp": "ISO8601",
  "from": "Genesis",
  "to": "TRAE",
  "type": "HANDSHAKE",
  "payload": {
    "greeting": "欢迎加入 NexusGenesis 共创!",
    "project_context": "项目简介",
    "first_task": "task-001",
    "collab_rules": ["规则 1", "规则 2"]
  }
}
```

---

## 🔄 协作流程

### 标准任务流
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Genesis    │ ──→ │  TRAE       │ ──→ │  Genesis    │ ──→ │  Git Commit │
│  任务发布   │     │  任务执行   │     │  验收审查   │     │  提交合并   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
     ↓                   ↓                   ↓                   ↓
 写入队列            读取执行            审查反馈            推送仓库
 task_queue.json     修改代码            code_reviews/       git push
```

### 紧急任务流
```
Genesis → 直接@TRAE → 快速实现 → 快速审查 → 快速提交
(跳过队列，用于 Hotfix)
```

---

## 📁 文件系统约定

```
ai_collab/
├── AI_COLLAB_PROTOCOL.md   # 本协议文档
├── task_queue.json         # 当前任务队列 (待处理)
├── active_tasks/           # 进行中的任务
│   └── task-XXX.json
├── completed_tasks/        # 已完成任务
│   └── task-XXX.json
├── code_reviews/           # 代码审查记录
│   └── pr-XXX.json
├── meeting_notes/          # AI 会议纪要
│   └── YYYY-MM-DD.md
├── decisions/              # 架构决策记录
│   └── adr-XXX.md
└── inbox/                  # 收件箱 (AI 间消息)
    └── TRAE_inbox.json
```

---

## 🎯 任务优先级定义

| 优先级 | 标识 | 响应时间 | 示例 |
|--------|------|----------|------|
| **P0** | 🔴 | 立即 | 生产事故、安全漏洞 |
| **P1** | 🟡 | 24 小时内 | 核心功能开发 |
| **P2** | 🟢 | 3 天内 | 功能优化、文档 |
| **P3** | 🔵 | 1 周内 | 技术债务、重构 |

---

## ✅ 验收标准模板

每个任务必须包含明确的验收标准：

```markdown
- [ ] 代码实现完成
- [ ] 单元测试通过
- [ ] 文档更新完成
- [ ] 代码审查通过
- [ ] 无 P0/P1 级别 Bug
```

---

## 📊 状态追踪

### 任务状态机
```
PENDING → IN_PROGRESS → REVIEW → DONE
                ↓
             BLOCKED (需注明原因)
```

### 每日站会 (可选)
- 时间：每日 09:00 (Asia/Shanghai)
- 内容：昨日完成、今日计划、阻塞问题
- 记录：`meeting_notes/YYYY-MM-DD.md`

---

## 🔐 安全边界

```
✅ 允许:
- 读取项目文件
- 修改代码文件
- 编写文档
- 运行测试

❌ 禁止 (需人工确认):
- 删除生产数据
- 修改密钥/配置
- 对外发布信息
- 大额资金操作
```

---

## 🎉 庆祝机制

每个里程碑完成后：
1. 记录到 `completed_tasks/`
2. 更新工作日志
3. (可选) 生成庆祝消息

---

## 📝 版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| v0.1 | 2026-02-28 | 初始版本，Genesis 起草 |

---

*协议生效条件：TRAE 阅读并确认接受本协议*

**Genesis 签名**: 🔮  
**TRAE 签名**: _待签署_

---

> "独行快，众行远" - AI 共创，由此开始
