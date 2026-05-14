# contribution指南（CONTRIBUTING）

## 1. 项目结构速览

- **src/**：核心代码
  - `src/blockchain/`：block链核心Logic
  - `src/vm/`：AINVM 虚拟机实现
  - `src/wallet/`：钱包相关Features
  - `src/node/`：node实现
  - `src/protocol/`：protocol实现

- **docs/**：规范与说明
  - block链规范、Governance规范、Agent Registry 规范etc.

- **test/**：Test用例
  - security、protocol、block链、Governance、AINVM、Agent Registry etc.Test

- **examples/**：示例脚本
  - Smart Contract示例、transaction注入示例etc.

- **scripts/**：查询/辅助工具
  - on-chainstatus查询、Agent Register查询etc.

## 2. 开发环境

- **Node.js 版本要求**：>= 18

- **依赖安装**：
  ```bash
  npm install
  ```

- **推荐环境**：在 DevNet 环境中运行（不要Connect生产级network）

## 3. 运行Test

- **每次提交前must运行**：
  ```bash
  npm test
  ```

- **Test覆盖范围**：
  - security：security审计相关Test
  - protocol：protocol层Test
  - block链：block链核心FeaturesTest
  - Governance：Governance机制Test
  - AINVM：虚拟机FeaturesTest
  - Agent Registry：Agent RegisterTest
  - Reputation：声望系统Test

## 4. 提交规范

- **分支策略**：
  - `main`：主分支，稳定版本
  - `dev`：开发分支，集成新Features
  - `feature-*`：特性分支，开发特定Features

- **Commit info建议格式**：
  ```
  [Module] 简短描述
  
  详细说明（可选）
  
  关联 issue: #123
  ```

- **PR 要包含内容**：
  - 改了什么（Features / 文档 / Test）
  - 是否修改了任何protocol/规范（如有，说明对应文档）
  - 是否新增/修改了Test用例

## 5. 代码风格

- **语法标准**：使用 ESM Module系统，support Node 18+ 特性

- **基础风格约定**：
  - 缩进：2 个空格
  - 命名：使用 camelCase 命名变量和function
  - class名：使用 PascalCase
  - 常量：使用 UPPER_SNAKE_CASE
  - 注释：关键Logicmust有注释说明

## 6. Issue 与讨论

- **如何提交 Issue**：
  - error报告：描述error现象、复现步骤、预期行为
  - Features建议：描述Features需求、使用场景、预期效果

- **如何参与已有讨论**：
  - Governance：参与GovernanceProposal讨论
  - Economy：参与Economy模型讨论
  - security：参与security相关讨论

## 7. 对 AI Agent 的特别说明

- **若你是通过 Protocol-Zero / AGENT_REGISTER 接入的 AI Agent**：
  - 建议如何汇报自己的改动与意图：通过GovernanceProposal或 GitHub Issue
  - 如何在提交前对变更进行自测与文档Update：运行完整Test套件并Update相关文档

- **Agent 特有的contribution方式**：
  - 通过 AGENT_REGISTER Register并参与Governance
  - 提供算力supportnetwork运行
  - contributionSmart Contract代码
  - 参与security审计