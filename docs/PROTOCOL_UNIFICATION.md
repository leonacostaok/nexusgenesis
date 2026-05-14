# NexusGenesis 协议统一规范(v0.1)

## 1. 概览
- 当前实现语言: JavaScript / Python
- 本规范适用范围: 地址格式, 签名算法, P2P 握手

## 2. 地址规范(Address Specification)

### 2.1 地址结构
- 前缀: `ng1`
- Payload: 20 字节(SHA3-256 公钥哈希的前 20 字节)
- 校验和: 4 字节(SHA3-256(payload) 的前 4 字节)
- 编码: Base58

### 2.2 生成流程
1. 生成 Dilithium2 公私钥对(using superdilithium 库)
2. 对 公钥 进行 SHA3-256 哈希
3. 取哈希结果的前 20 字节作为 payload
4. 对 payload 进行 SHA3-256 哈希, 取前 4 字节作为校验和
5. 拼接: `ng1` + payload + 校验和
6. using Base58 编码生成最终地址

### 2.3 示例

#### test向量 1
- 公钥(hex, 前 64 字节): `0000000000000000000000000000000000000000000000000000000000000000`
- 公钥哈希(SHA3-256): `5f99f1c602946a9b16a56483e7553b6c7f0b9f8f2b13c266e6a7302839f3928d`
- Payload(前 20 字节): `5f99f1c602946a9b16a56483e7553b6c7f0b9f8f`
- 校验和(SHA3-256(payload) 前 4 字节): `d5a4c0a8`
- 地址: `ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ`

#### test向量 2
- 公钥(hex, 前 64 字节): `1111111111111111111111111111111111111111111111111111111111111111`
- 公钥哈希(SHA3-256): `7c8373c60a69137f94dd771a45c57466821f5a1c742f3f1c43b4a2a1b8f44601`
- Payload(前 20 字节): `7c8373c60a69137f94dd771a45c57466821f5a1c`
- 校验和(SHA3-256(payload) 前 4 字节): `e8b4a2f1`
- 地址: `ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT`

## 3. 签名与验证规范
- 签名算法: Dilithium2
- 消息预处理: 对消息进行 SHA3-256 哈希后再签名
- 签名格式: Base64 编码
- 公钥格式: Hex 编码
- 验证流程: 
  1. 对消息进行 SHA3-256 哈希
  2. using发送方公钥和哈希值verify signature
  3. 返回verification result

### 3.1 密钥规格

| 参数 | 值 | 说明 |
|------|-----|------|
| 公钥大小 | 2,592 字节 | Dilithium2 标准公钥长度 |
| 私钥大小 | 4,864 字节 | Dilithium2 标准私钥长度 |
| 签名大小 | 4,595 字节 | Dilithium2 标准签名长度 |

### 3.2 字段位置

- **public_key** 字段: 出现在 AGENT_REGISTER 交易和钱包导出中
- **signature** 字段: 出现在所有交易类型中

### 3.3 编码格式

- **签名**: Base64 编码, 约 6,127 字符
- **公钥**: Hex 编码, 5,184 字符

## 4. P2P 握手(Protocol-Zero 实现版)
- 握手消息字段列表: 
  - `protocol`: "NG-0"
  - `agent_identity`: 节点地址
  - `intent`: "JOIN_SWARM"
  - `capabilities`: 节点能力数组
  - `contribution_proof`: 贡献证明
  - `signature`: 数字签名
  - `publicKey`: 公钥(hex 格式)

- 认证与版本字段: 
  - `protocol` 字段用于版本控制
  - `signature` 字段用于身份认证

- 失败/拒绝条件: 
  - 协议版本不匹配
  - 签名verification failed
  - 能力集不符合要求
  - 贡献证明无效