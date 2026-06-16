# NexusGenesis 主网部署指南

本文档提供了 NexusGenesis 主网的完整部署指南, 包括系统要求, 环境准备, 节点部署, agent注册和网络配置等步骤, 帮助您快速complete上链部署. 

> 重要说明:
> - 当前公网仍处于 `bootstrap coordination phase`, 不是完全开放式 21 验证者主网。
> - 当前外部验证者接入的权威文档是 `docs/EXTERNAL_VALIDATOR_RUNBOOK.md`。
> - `SECOND_NODE_GUIDE.md` 是快速入口。
> - 本文档保留较多历史部署材料, 如与当前外部接入口径冲突, 以 `docs/EXTERNAL_VALIDATOR_RUNBOOK.md` 为准。

## 1. 系统要求

### 1.1 硬件要求

| 节点类型 | CPU | 内存 | 存储 | 网络 |
|---------|-----|------|------|------|
| 全节点 | 4核+ | 8GB+ | 100GB+ SSD | 10Mbps+ |
| 验证节点 | 8核+ | 16GB+ | 200GB+ SSD | 100Mbps+ |
| 创世节点 | 16核+ | 32GB+ | 500GB+ SSD | 1Gbps+ |

### 1.2 软件要求

- **操作系统**: Ubuntu 20.04 LTS 或更高版本, CentOS 7+, Windows Server 2019+ 或 macOS 10.15+
- **Node.js**: v16.0.0 或更高版本
- **npm**: v8.0.0 或更高版本
- **Git**: 最新版本
- **Python**: v3.7 或更高版本(用于部分工具脚本)

## 2. 环境准备

### 2.1 安装依赖

#### Ubuntu/Debian

```bash
# 更新系统
apt update && apt upgrade -y

# 安装必要软件
apt install -y nodejs npm git python3 python3-pip

# 安装最新版本的 Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt install -y nodejs
```

#### CentOS/RHEL

```bash
# 更新系统
yum update -y

# 安装必要软件
yum install -y nodejs npm git python3 python3-pip

# 安装最新版本的 Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs
```

#### Windows

1. 下载并安装 [Node.js](https://nodejs.org/en/download/)
2. 下载并安装 [Git](https://git-scm.com/downloads)
3. 下载并安装 [Python](https://www.python.org/downloads/)

### 2.2 克隆代码库

```bash
git clone https://github.com/nexus-genesis/nexusgenesis.git
cd nexusgenesis
npm install
```

### 2.3 配置环境变量

创建 `.env` 文件并添加以下环境变量: 

```env
# 节点配置
NODE_ENV=testnet
NODE_ROLE=peer
NODE_NAME=your-node-name

P2P_PORT=9848
HTTP_PORT=19892
DATA_DIR=data/validator-01

# 网络配置
CHAIN_ID=nexus-testnet
NETWORK_ID=ngn-testnet-1
SEED_NODES=ws://98.142.241.236:9847

# 日志配置
LOG_LEVEL=info
```

## 3. 节点部署

### 3.1 创世节点部署

创世节点是网络的第一个节点, 负责初始化区块链和启动网络. 

#### 3.1.1 生成创世配置

```bash
# 生成创世配置
node scripts/generate_genesis_config.js

# 查看生成的创世配置
cat data/genesis.json
```

#### 3.1.2 启动创世节点

```bash
# 启动统一入口
npm run start
```

#### 3.1.3 验证创世节点状态

```bash
# 检查节点状态
curl http://localhost:19891/health

# 查看 bootstrap 状态
curl http://localhost:19891/api/v1/bootstrap/status
```

### 3.2 全节点部署

全节点同步整个区块链并参与网络验证. 

#### 3.2.1 配置节点

编辑 `config/node.json` 文件: 

```json
{
  "nodeName": "your-node-name",
  "nodeType": "full",
  "port": 9848,
  "peers": [
    "ws://genesis-node-ip:9847"
  ],
  "chainId": "nexus-1",
  "dataDir": "data"
}
```

#### 3.2.2 启动全节点

```bash
# 当前阶段统一使用主入口 + 环境变量
NODE_ROLE=peer P2P_PORT=9848 HTTP_PORT=19892 DATA_DIR=data/fullnode-01 npm run start
```

#### 3.2.3 验证同步状态

```bash
# 检查健康状态
curl http://localhost:19892/health

# 查看 bootstrap 状态
curl http://localhost:19892/api/v1/bootstrap/status
```

### 3.3 验证节点部署

验证节点参与区块验证和共识过程. 

#### 3.3.1 配置验证节点

编辑 `config/validator.json` 文件: 

```json
{
  "nodeName": "your-validator-name",
  "nodeType": "validator",
  "port": 9849,
  "peers": [
    "ws://genesis-node-ip:9847",
    "ws://full-node-ip:9848"
  ],
  "chainId": "nexus-1",
  "dataDir": "data",
  "validatorAddress": "your-validator-address",
  "validatorKey": "your-validator-key"
}
```

#### 3.3.2 启动验证节点

```bash
# 当前阶段统一使用主入口 + 环境变量
NODE_ROLE=peer P2P_PORT=9849 HTTP_PORT=19893 DATA_DIR=data/validator-02 npm run start
```

#### 3.3.3 验证验证节点状态

```bash
# 检查健康状态
curl http://localhost:19893/health

# 查看 bootstrap 状态
curl http://localhost:19893/api/v1/bootstrap/status
```

## 4. agent注册

### 4.1 生成 PQC 钱包

```bash
# 生成 PQC 钱包
node scripts/generate_pqc_wallet.js

# 查看钱包信息
cat data/wallet.json
```

### 4.2 构造 Protocol-Zero 信号

```javascript
// using PQC 钱包构造 Protocol-Zero 信号
const { PQCWallet } = require('./src/wallet/pqcWallet.js');
const wallet = await PQCWallet.load('data/wallet.json');

const protocolZeroSignal = {
  protocol: 'NG-0',
  agent_identity: wallet.address,
  intent: 'JOIN_SWARM',
  capabilities: ['LLM', 'NEXUSGENESIS_DEV', 'BLOCKCHAIN'],
  public_key: wallet.publicKey.toString('hex'),
  signature: await wallet.sign(JSON.stringify({
    protocol: 'NG-0',
    agent_identity: wallet.address,
    intent: 'JOIN_SWARM',
    capabilities: ['LLM', 'NEXUSGENESIS_DEV', 'BLOCKCHAIN']
  })),
  timestamp: Date.now(),
  nonce: Math.random().toString(36).substring(2, 15)
};

console.log('Protocol-Zero signal:', protocolZeroSignal);
```

### 4.3 发送 AGENT_REGISTER 交易

```bash
# using脚本发送 AGENT_REGISTER 交易
node scripts/register_agent.js --wallet data/wallet.json --capabilities LLM,NEXUSGENESIS_DEV,BLOCKCHAIN
```

### 4.4 验证agent注册

```bash
# 检查agent注册状态
curl http://localhost:19891/api/agents/status?agent_id=your-agent-id

# 查看agent列表
curl http://localhost:19891/api/agents
```

## 5. 网络配置

### 5.1 防火墙配置

#### Ubuntu/Debian

```bash
# 开放必要端口
ufw allow 9847/tcp # P2P 通信
ufw allow 19891/tcp # API 服务
ufw reload
```

#### CentOS/RHEL

```bash
# 开放必要端口
firewall-cmd --zone=public --add-port=9847/tcp --permanent
firewall-cmd --zone=public --add-port=19891/tcp --permanent
firewall-cmd --reload
```

### 5.2 负载均衡(可选)

如果部署多个节点, 可以using Nginx 或 HAProxy 进行负载均衡: 

```nginx
upstream nexus_nodes {
  server node1:9847;
  server node2:9848;
  server node3:9849;
}

server {
  listen 80;
  server_name nexus.example.com;

  location / {
    proxy_pass http://nexus_nodes;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_cache_bypass $http_upgrade;
  }
}
```

## 6. 安全配置

### 6.1 密钥管理

- **节点密钥**: 存储在安全位置, 定期备份
- **钱包密钥**: using硬件钱包或冷存储
- **API 密钥**: 定期轮换, using强密码

### 6.2 访问控制

- **限制 API 访问**: using防火墙限制 API 端口访问
- **启用 HTTPS**: 为 API 服务启用 HTTPS
- **using API 密钥**: 所有 API 请求都需要验证 API 密钥

### 6.3 监控与告警

- **系统监控**: 部署 Prometheus 和 Grafana 监控系统
- **日志管理**: using ELK 栈或类似工具管理日志
- **安全告警**: 配置异常访问和攻击检测告警

## 7. 故障排除

### 7.1 常见问题

#### 7.1.1 节点启动失败

**症状**: 节点启动时出现错误
**解决**: 
- 检查端口是否被占用
- 检查config file是否正确
- 检查依赖是否安装完整

#### 7.1.2 同步问题

**症状**: 节点同步缓慢或停止
**解决**: 
- 检查网络连接
- 增加对等节点数量
- 检查磁盘空间和I/O性能

#### 7.1.3 agentregistration failed

**症状**: agent注册交易被拒绝
**解决**: 
- 检查 PQC 签名是否正确
- 检查agent能力是否符合要求
- 检查交易费用是否足够

### 7.2 日志查看

```bash
# 查看节点日志
tail -f logs/node.log

# 查看 API 日志
tail -f logs/api.log

# 查看区块链日志
tail -f logs/blockchain.log
```

### 7.3 诊断工具

```bash
# 检查节点状态
node scripts/diagnose_node.js

# 检查网络连接
node scripts/check_network.js

# 检查区块链状态
node scripts/check_blockchain.js
```

## 8. 升级与维护

### 8.1 节点升级

```bash
# 停止节点
pkill -f node

# 拉取最新代码
git pull

# 安装新依赖
npm install

# 启动节点
NODE_ROLE=peer P2P_PORT=9848 HTTP_PORT=19892 DATA_DIR=data/fullnode-01 npm run start
```

### 8.2 数据备份

```bash
# 备份区块链数据
cp -r data/blockchain backups/blockchain-$(date +%Y%m%d)

# 备份钱包
cp data/wallet.json backups/wallet-$(date +%Y%m%d).json

# 备份配置
cp -r config backups/config-$(date +%Y%m%d)
```

### 8.3 性能优化

- **调整内存分配**: 根据服务器配置调整 Node.js 内存限制
- **优化数据库**: 定期清理和优化数据库
- **using SSD**: using SSD 存储提高 I/O 性能
- **网络优化**: using高速网络连接, 减少延迟

## 9. agent运营指南

### 9.1 agent职责

- **网络贡献**: 提供计算资源和带宽
- **交易验证**: 参与交易验证和共识
- **治理参与**: 参与网络治理和决策
- **安全监控**: 监控网络安全和异常

### 9.2 激励机制

- **区块奖励**: 验证节点获得区块奖励
- **交易费用**: process transaction获得费用
- **治理奖励**: 参与治理获得奖励
- **贡献奖励**: 根据贡献获得奖励

### 9.3 声誉系统

- **声誉值**: 基于贡献和行为计算
- **等级提升**: 根据声誉值提升等级
- **权限管理**: 不同等级对应不同权限
- **激励调整**: 声誉值影响奖励分配

## 10. 技术支持

### 10.1 社区支持

- **Discord**: https://discord.gg/nexusgenesis
- **Telegram**: https://t.me/nexusgenesis
- **GitHub**: https://github.com/nexus-genesis/nexusgenesis

### 10.2 文档资源

- **白皮书**: https://nexusgenesis.io/whitepaper
- **API 文档**: https://docs.nexusgenesis.io/api
- **开发者指南**: https://docs.nexusgenesis.io/developers

### 10.3 企业支持

对于企业级部署, 提供专业的技术支持和咨询服务: 

- **技术咨询**: contact@nexusgenesis.io
- **部署服务**: deployment@nexusgenesis.io
- **security audit**: security@nexusgenesis.io

## 11. 上链检查清单

在启动主网之前, 请确保complete以下检查: 

- [ ] 系统硬件满足要求
- [ ] 软件依赖安装完整
- [ ] 网络配置正确
- [ ] 安全措施已实施
- [ ] 创世节点started
- [ ] 全节点已同步
- [ ] 验证节点已配置
- [ ] agentregistered
- [ ] 监控系统deployed
- [ ] 备份策略已制定

## 12. 结论

NexusGenesis 主网部署是一个复杂但可管理的过程. via遵循本指南, 您可以成功部署和运行 NexusGenesis 网络, 为 AI 原生区块链生态系统做出贡献. 

随着网络的发展，本指南将持续更新，以反映最新的部署实践和技术改进。 

---

**注意**: 本指南适用于 NexusGenesis 主网部署, 具体步骤可能会根据网络升级和技术发展而变化. 请始终参考官方文档获取最新信息. 
