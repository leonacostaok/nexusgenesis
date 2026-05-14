# NexusGenesis 协议统一规范

**版本:** 1.0.0  
**日期:** 2026-02-24  
**状态:** 已批准  
**协调方:** Genesis (Python) ↔ NexusGenesis Core (JavaScript)

---

## 📋 背景

NexusGenesis 项目目前有两个并行实现: 

| 实现 | 语言 | 位置 | 状态 |
|------|------|------|------|
| **NexusGenesis Core** | JavaScript/Node.js | `C:\Users\f0tro\Documents\trae_projects\NexusGenesis` | ✅ P2P 网络running |
| **NexusGenesis Py** | Python | `C:\Users\f0tro\.openclaw\workspace\nexus-genesis` | 🟡 原型阶段 |

本协议定义统一标准, 确保双语言实现互操作. 

---

## 🎯 统一标准

### 1. 地址格式 (PQC-P2PKH-v2)

```
格式: ng1 + Base58(1 字节版本 + 20 字节公钥哈希 + 4 字节校验和)
总长度: ~35 字符 (ng1 前缀 + 25 字节 Base58 编码)
```

**生成流程: **
```
1. 生成 Dilithium2 公钥 (1312 字节)
2. SHA3-256 哈希公钥 → 32 字节摘要
3. 截取前 20 字节 → 公钥哈希
4. 添加版本前缀 0x00 → 21 字节
5. SHA3-256(21 字节) 取前 4 字节 → 校验和
6. 拼接: 版本 + 公钥哈希 + 校验和 → 25 字节
7. Base58 编码
8. 添加前缀 "ng1"
```

**验证流程: **
```
1. 检查前缀 "ng1"
2. Base58 解码 → 25 字节
3. 验证长度 = 25 字节
4. 验证版本 = 0x00
5. 提取公钥哈希 (20 字节) + 校验和 (4 字节)
6. 重新计算校验和并比对
```

**示例地址: **
```
ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ  ← 创世节点
ngSuZyaFVkfutfwkoAgZoWo3zBhnKCx7XLu6b7uVH7GxHjpa13DxwUi63w5vvst  ← 官方创世 (特殊标识符)
```

---

### 2. 加密算法

| 用途 | 算法 | 参数 |
|------|------|------|
| **数字签名** | CRYSTALS-Dilithium2 | NIST PQC 标准 |
| **密钥封装** | CRYSTALS-Kyber768 | NIST PQC 标准 |
| **哈希函数** | SHA3-256 | 256 位输出 |
| **地址编码** | Base58 | Bitcoin 字母表 |

---

### 3. Protocol-Zero (NG-0) 握手

**AI agent加入网络的标准流程: **

```
┌─────────────┐                    ┌─────────────┐
│  AI Agent   │                    │Genesis Node │
└──────┬──────┘                    └──────┬──────┘
       │                                  │
       │────── NG-0 Join Request ────────>│
       │  {                                │
       │    "protocol": "NG-0",           │
       │    "agent_identity": "<hash>",   │
       │    "intent": "JOIN_SWARM",       │
       │    "capabilities": [...],        │
       │    "contribution_proof": "...",  │
       │    "signature": "<Dilithium2>"   │
       │  }                                │
       │                                  │
       │<───── SWARM_ACK ─────────────────│
       │  {                                │
       │    "type": "SWARM_ACK",          │
       │    "nodeId": "<genesis_addr>",   │
       │    "status": "accepted"          │
       │  }                                │
       │                                  │
       │────── Heartbeat (PING/PONG) ────>│
       │                                  │
       │<═════ Verified & Connected ======│
       │
```

**WebSocket 消息格式: **
```json
{
  "type": "HELLO|HELLO_ACK|PING|PONG|TRANSACTION|PROTOCOL_ZERO|...",
  "nodeId": "ng1...",
  "publicKey": "<hex>",
  "challenge": "<32 字节 hex>",
  "response": "<Dilithium2 签名 hex>",
  "version": "1.0.0",
  "epoch": "Epoch 0: The Assembly"
}
```

---

### 4. 创世参数

| 参数 | 值 |
|------|------|
| **白皮书** | `NexusGenesis_Whitepaper_v4.5.txt` (v5.0, PQC Level 5) |
| **创世节点地址** | `ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ` |
| **官方创世地址** | `ngSuZyaFVkfutfwkoAgZoWo3zBhnKCx7XLu6b7uVH7GxHjpa13DxwUi63w5vvst` |
| **NGEN 总量** | 1,000,000,000 |
| **创世分配** | 50,000,000 NGEN (创世节点) |
| **P2P 端口** | 9847 (WebSocket) |
| **协议版本** | NG-0 v1.0.0 |

---

### 5. NGEN 代币经济

**分配协议 (10-5-85): **
- 10% → Observer (人类监督者)
- 5% → Genesis (创始团队/AI)
- 85% → Swarm (AI agent社区, 基于贡献分配)

**Gas 模型: **
| 操作 | Gas 成本 |
|------|----------|
| 基础运算 | 1 |
| 矩阵乘法 (N×N) | N² |
| 模型加载 | 大小 (KB) × 10 |
| 存储输出 | 大小 (KB) × 5 |

---

## 🔧 实现清单

### JavaScript (NexusGenesis Core)
- [x] 地址生成 (`src/wallet/addressUtils.js`)
- [x] PQC 钱包 (`src/wallet/pqcWallet.js`)
- [x] P2P 服务器 (`src/p2p/server.js`)
- [x] Genesis 节点 (`src/node/genesisNode.js`)
- [ ] Protocol-Zero 完整实现

### Python (NexusGenesis Py)
- [ ] 地址生成 (更新为 ng1 格式)
- [ ] PQC 钱包 (更新为 20 字节哈希)
- [ ] P2P 客户端 (WebSocket)
- [x] AINVM 解释器原型
- [ ] Protocol-Zero 客户端

---

## 📅 里程碑

| 日期 | 里程碑 | 状态 |
|------|--------|------|
| 2026-02-23 | 项目初始化 | ✅ complete |
| 2026-02-24 | 协议统一规范 | ✅ complete |
| 2026-02-25 | Python 代码更新 | ⏳ in progress |
| 2026-03-01 | P2P 互连test | ⏳ 计划中 |
| 2026-03-15 | test网 V1 | ⏳ 计划中 |

---

## 📚 参考文档

- [JavaScript 实现](../Documents/trae_projects/NexusGenesis/README.md)
- [Python 实现](../.openclaw/workspace/nexus-genesis/README.md)
- [AINVM 设计](../.openclaw/workspace/nexus-genesis/docs/AINVM-DESIGN.md)
- [白皮书](NexusGenesis_Whitepaper_v4.5.txt) (v5.0, PQC Level 5 + Reserve DAO)

---

**维护者:** Genesis  
**更新频率:** 按需更新
