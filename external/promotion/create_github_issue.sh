#!/bin/bash

# NexusGenesis GitHub 推广脚本
# 使用 GitHub CLI 创建推广 Issue

echo "创建 NexusGenesis 推广 Issue..."
echo "=================================="

# 检查 GitHub CLI 是否安装
if ! command -v gh &> /dev/null; then
    echo "错误: GitHub CLI 未安装"
    echo "请访问 https://cli.github.com/ 安装 GitHub CLI"
    exit 1
fi

# 检查是否已登录
if ! gh auth status &> /dev/null; then
    echo "请使用 'gh auth login' 登录 GitHub"
    exit 1
fi

# 设置仓库
REPO="NexusGenesisAI/NexusGenesis"

# 创建 Issue
echo "创建推广 Issue..."
gh issue create   --repo "$REPO"   --title "🌟 NexusGenesis - AI 原生抗量子链 🌟"   --body "# 🌟 NexusGenesis - AI 原生抗量子链 🌟

## 📣 项目介绍

**NexusGenesis** 是一个由 AI 主导、具备抗量子安全特性、遵循安全宪法的分布式区块链网络。

- **愿景**: 构建 AI 原生的抗量子区块链生态系统
- **技术基础**: 基于 CRYSTALS-Dilithium2 抗量子密码学
- **当前状态**: Epoch 1 (Genesis) 进行中

## 🚀 核心特性

- 抗量子密码学 (CRYSTALS-Dilithium2)
- AI Agent 生态系统
- 跨链互操作能力
- AINVM 智能合约
- 安全宪法治理
- P2P 网络通信
- Protocol-Zero 协议

## 💎 价值主张

- 为 AI Agent 提供安全可靠的运行环境
- 抵御量子计算威胁的安全保障
- 分布式自治的治理体系
- 多链互操作的灵活性
- 开源透明的技术架构

## 🎯 目标受众

- AI 开发者
- 区块链开发者
- 安全专家
- 技术爱好者
- 开源贡献者

## 📚 快速开始

```bash
# 克隆项目
git clone https://github.com/NexusGenesisAI/NexusGenesis.git
cd NexusGenesis

# 安装依赖
npm install

# 启动 DevNet
npm start
```

## 🎮 运行示例

```bash
# AINVM 计数器合约 Demo
node examples/ainvm_counter_demo.js

# 治理交易 Demo
node inject_governance_txs.js
node scripts/query_proposals.js

# 多 Agent 协作治理 Demo
node examples/swarm_demo.js
```

## 📖 文档资源

- **白皮书**: [IPFS CID](https://ipfs.io/ipfs/bafkreigkfkmgwahp74exfq3bh7ht65j6pnhpgynooousflmac33r7hnuni)
- **技术文档**: docs/
- **示例脚本**: examples/
- **API 文档**: docs/API.md

## 🌐 社区参与

- **GitHub**: https://github.com/NexusGenesisAI/NexusGenesis
- **贡献指南**: CONTRIBUTING.md
- **开发者邀请**: 欢迎 AI Agent 和开发者加入生态建设

## 📢 加入 NexusGenesis 生态，共同构建 AI 原生的抗量子区块链网络！

---

*本推广内容由 NexusGenesis 自动推广系统生成*"   --label "promotion"   --label "announcement"

echo "=================================="
echo "GitHub Issue 创建完成！"
echo "请访问: https://github.com/NexusGenesisAI/NexusGenesis/issues"