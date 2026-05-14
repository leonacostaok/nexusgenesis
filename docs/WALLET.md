# NexusGenesis 钱包using指南

**版本:** 1.0.0  
**加密标准:** CRYSTALS-Dilithium2 (NIST 后量子安全标准)

---

## 概述

NexusGenesis 钱包采用 **CRYSTALS-Dilithium2** 抗量子签名算法, 确保在量子计算机时代也能保护您的资产安全. 

### 两种钱包实现

1. **JavaScript 钱包** - 用于 Node.js 环境和浏览器
2. **Python 钱包** - using Open Quantum Safe (OQS) 库

---

## JavaScript 钱包

### 安装

项目依赖已在 `npm install` 时安装: 

```bash
npm install
```

### using钱包 CLI

```bash
npm run wallet
```

### 编程接口

```javascript
import { PQCWallet } from './src/wallet/pqcWallet.js';

const wallet = new PQCWallet();

// generate key对
const keys = wallet.generateKeyPair();
console.log('地址:', wallet.generateAddress(keys.publicKey));
```

---

## Python 钱包 (推荐)

Python 钱包using专业的 Open Quantum Safe (OQS) 库, 提供更安全的密钥生成. 

### 安装依赖

```bash
pip install oqs base58 binascii
```

> **注意**: 需要 C/C++ 编译环境 (Windows 下可能需要 Visual Studio Build Tools)

### 运行钱包

```bash
python genesis_wallet.py
```

### 输出示例

```
--------------------------------------------------
>>> 正在启动 NexusGenesis 抗量子引擎 (CRYSTALS-Dilithium2)...
--------------------------------------------------
[成功] 密钥对生成完毕. 
 公钥长度: 2592 字节
 私钥长度: 4864 字节 (请绝对保密!)
 ==================================================
 NEXUS GENESIS 观察者创世钱包 (OBSERVER WALLET)
==================================================
 [1] 你的公开地址 (Public Address):
 ng1...
 [2] 你的抗量子公钥 (Public Key):
 abcd1234...[已省略]
 [3] 你的抗量子私钥 (Private Key) - [最高机密!]:
 efgh5678...
 ==================================================
警告: 私钥控制着整个生态 15% 的资产. 
请立即断网, 将私钥抄写在纸上或保存在加密的 USB 驱动器中. 
切勿将私钥发送给任何人, 包括 OpenClaw. 
==================================================
```

---

## 地址格式

NexusGenesis using类似比特币的 P2PKH 地址格式: 

```
ng1 + Base58(版本字节 + 20字节公钥哈希 + 4字节校验和)
```

### 示例地址

```
ngSuZyaFVkfutfwkoAgZoWo3zBhnKCx7XLu6b7uVH7GxHjpa13DxwUi63w5vvst
```

---

## 安全指南

### ⚠️ 极其重要

1. **私钥就是一切**
   - 私钥控制您所有的 NGEN 代币
   - 泄露私钥 = 资产被盗
   - 切勿将私钥发送给任何人

2. **离线存储建议**
   - generate key后, 立即断网
   - 将私钥抄写在纸上
   - 或保存在加密的 USB 驱动器中

3. **验证来源**
   - 确保从可信来源下载钱包代码
   - 检查代码签名 (如有)

### 备份清单

- [ ] 私钥安全备份 (多处)
- [ ] 公钥/地址记录
- [ ] 纸张备份 (防水防潮)
- [ ] 加密存储 (如using密码管理器)

---

## 密钥结构

### Dilithium2 规格

| 参数 | 值 |
|------|-----|
| 算法 | CRYSTALS-Dilithium2 |
| 公钥大小 | 2,592 字节 |
| 私钥大小 | 4,864 字节 |
| 签名大小 | 4,595 字节 |
| 安全级别 | NIST Level 3 |

---

## 常见问题

### Q: 钱包支持哪些操作系统?

A: 
- **JavaScript 钱包**: Windows, macOS, Linux (Node.js 18+)
- **Python 钱包**: Windows, macOS, Linux (Python 3.9+, OQS 库)

### Q: 私钥丢失怎么办?

A: **无法恢复**. 去中心化系统没有找回功能. 请务必备份私钥. 

### Q: 抗量子钱包与普通钱包有什么区别?

A: 抗量子钱包using基于格的签名算法 (Dilithium2), 而不是传统的 ECDSA. 即使量子计算机也无法破解. 

### Q: 如何确认我的地址正确?

A: 
1. 生成后对比公钥哈希
2. using校验和验证地址完整性
3. 先用小额test

---

## 代币分配

| 分配 | 比例 | 数量 |
|------|------|------|
| 创世节点 | 50% | 25M NGEN |
| 社区奖励 | 20% | 10M NGEN |
| 生态基金 | 15% | 7.5M NGEN |
| 观察者 | 10% | 5M NGEN |
| 开发者 | 5% | 2.5M NGEN |

---

## 技术细节

### 密钥派生流程

```
1. 生成 Dilithium2 密钥对
       ↓
2. SHA3-256(公钥) → 取前20字节
       ↓
3. 校验和 = SHA3-256(SHA3-256(payload))[:4]
       ↓
4. payload + checksum → Base58
       ↓
5. 添加前缀 "ng1" → 最终地址
```

### 签名流程

```
1. 消息 → SHA3-256 哈希
       ↓
2. Dilithium2.Sign(哈希, 私钥)
       ↓
3. 输出签名 (4,595 字节)
```

---

## 相关文件

- `genesis_wallet.py` - Python 抗量子钱包脚本
- `src/wallet/pqcWallet.js` - JavaScript 钱包实现
- `src/wallet/genesisWallet.js` - 创世钱包
- `src/wallet/cli.js` - 命令行界面

---

## 支持

如有问题, 请检查: 
1. 依赖是否正确安装
2. 端口 9847 是否被占用
3. 防火墙是否阻止连接
