# NexusGenesis - 协议事件 JSON 示例

本文档提供有效的 JSON 示例, 用于test和实现参考. 所有示例均为单行格式, 确保 JSON 解析器能够正确处理. 

## 1. OBSERVER_EVENT 交易示例

```json
{"tx_type":"OBSERVER_EVENT","from":"ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ","to":"ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ","amount":"0","fee":"1","timestamp":"2026-02-24T10:30:00Z","nonce":"1","payload":{"event_id":"550e8400-e29b-41d4-a716-446655440000","timestamp":"2026-02-24T10:30:00Z","action_type":"APPROVE_SPEND","proposal_id":"1a2b3c4d-5e6f-7g8h-9i0j-klmnopqrstuv","reason":"云服务账单支付, 符合预算和网络运营需求","observer_id":"ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ","tx_hash":"7c0a1b9e4f8a4b9c9d8e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d","signature":"YmFzZTY0LWVuY29kZWQtc2lnbmF0dXJlLXhlbHA="},"signature":"YmFzZTY0LWVuY29kZWQtdHJhbnNmZXItc2lnbmF0dXJlLXhlbHA="}
```

## 2. GOVERNANCE_PROPOSAL 交易示例

```json
{"tx_type":"GOVERNANCE_PROPOSAL","from":"ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT","to":"ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ","amount":"0","fee":"10","timestamp":"2026-02-24T09:15:00Z","nonce":"2","payload":{"proposal_id":"98765432-10fe-dcba-9876-543210fedcba","timestamp":"2026-02-24T09:15:00Z","proposer_id":"ng11L2sdxT8qdYjtX1z9RrRSEEhPfw9vrwpCT","purpose":"购买新服务器集群以提升网络性能","amount":"500000","beneficiary":"ng11HtQNLuTjwDg86yrgkgBo3MzZaHuGkqZrQ","justification":"当前网络节点数量增长迅速, 现有服务器容量已接近极限. 为确保网络稳定性和交易处理速度, 需要购置新的服务器集群. 新集群将支持更多节点接入, 提高交易确认速度, 并为未来的功能扩展预留资源. ","expected_benefit":"网络吞吐量提升50%, 交易确认时间减少30%, 支持节点数量翻倍, 为未来6个月的增长做好准备. ","duration":"30天","risk_assessment":"风险较低, 服务器购置为必要的基础设施投资. 建议选择可靠的供应商, 并制定详细的迁移计划以最小化服务中断风险. ","category":"INFRA"},"signature":"YmFzZTY0LWVuY29kZWQtdHJhbnNmZXItc2lnbmF0dXJlLXhlbHA="}
```

## 3. 字段说明

### 3.1 注意事项

1. **JSON 格式**: 所有示例均为单行格式, 确保 JSON 解析器能够正确处理
2. **tx_hash 格式**: using 64 字符的十六进制字符串, 仅包含 [0-9a-f] 字符
3. **签名格式**: using base64 编码表示的 Dilithium2 签名
4. **amount/fee 类型**: using字符串表示, 以最小计量单位为整数
5. **timestamp 一致性**: 交易级别的 timestamp 和 payload 内的 timestamp 应保持一致

### 3.2 test向量

以下值可用于test: 

| 字段名 | test值 | 说明 |
|-------|-------|------|
| `event_id` | `550e8400-e29b-41d4-a716-446655440000` | 有效的 UUID |
| `proposal_id` | `98765432-10fe-dcba-9876-543210fedcba` | 有效的 UUID |
| `tx_hash` | `7c0a1b9e4f8a4b9c9d8e1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d` | 有效的 64 字符十六进制字符串 |
| `signature` | `YmFzZTY0LWVuY29kZWQtc2lnbmF0dXJlLXhlbHA=` | 示例 base64 编码签名 |
| `amount` | `0` | 交易金额 |
| `fee` | `1` | 交易费用 |
| `timestamp` | `2026-02-24T10:30:00Z` | ISO8601 格式时间戳 |

## 4. 实现建议

1. **using单行 JSON**: 在代码中using单行 JSON 字符串作为test向量, 确保解析正确
2. **验证字段格式**: 
   - 验证 `tx_hash` 是有效的十六进制字符串
   - 验证 `signature` 是有效的 base64 编码
   - 验证 `timestamp` 是有效的 ISO8601 格式
3. **统一字段类型**: 确保所有实现using相同的字段类型和格式
4. **test解析功能**: using本文档中的示例test事件解析功能

## 5. 版本控制

- **版本**: v0.1
- **更新日期**: 2026-02-24
- **适用协议版本**: NexusGenesis Protocol v0.1