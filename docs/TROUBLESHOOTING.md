# 常见问题与排错指南(TROUBLESHOOTING)

## 1. 网络启动问题

### 1.1 节点无法启动

**症状**: 运行 `npm start` 或 `node start-node.bat` 后节点未成功启动

**可能原因**: 
- 端口被占用
- 依赖未正确安装
- config file损坏
- 数据目录权限问题

**解决方案**: 
1. **检查端口占用**: 
   ```bash
   # Windows
   netstat -ano | findstr :19890
   # Linux/Mac
   lsof -i :19890
   ```

2. **重新安装依赖**: 
   ```bash
   npm install
   ```

3. **清理数据目录**(谨慎操作, 会重置链状态): 
   ```bash
   # 备份后删除
   rm -rf data/blockchain/*
   rm -rf data/state/*
   ```

4. **检查 Node.js 版本**: 
   ```bash
   node --version
   # 确保 >= 18
   ```

### 1.2 P2P 网络连接失败

**症状**: 节点启动后无法与其他节点建立连接

**可能原因**: 
- 防火墙阻止了 P2P 端口
- 网络配置错误
- 其他节点未运行

**解决方案**: 
1. **检查 P2P 端口**(默认 9847): 
   ```bash
   netstat -ano | findstr :9847
   ```

2. **检查其他节点状态**: 
   ```bash
   node scripts/query_chain.js --tip
   ```

3. **重启网络**: 
   ```bash
   # 停止所有节点
   # 按顺序启动节点: genesisNode -> node1 -> node2 -> node3
   node start-node.bat
   ```

## 2. 交易注入问题

### 2.1 交易被拒绝

**症状**: call交易注入接口后收到 `{"success": false}` 响应

**可能原因**: 
- 余额不足
- 签名verification failed
- 交易结构无效
- Nonce 错误
- 交易already exists

**解决方案**: 
1. **检查余额**: 
   ```bash
   node scripts/query_chain.js --balance <地址>
   ```

2. **verify transaction结构**: 
   - 确保所有必填字段都已提供
   - 检查交易类型是否正确
   - 验证金额和手续费格式

3. **检查 Nonce**: 
   - Nonce 应该是递增的, 从 1 开始
   - 避免重复using相同的 Nonce

4. **using示例脚本**: 
   ```bash
   # using提供的脚本进行交易注入
   node inject_transfer_txs.js
   node inject_governance_txs.js
   ```

### 2.2 交易确认延迟

**症状**: 交易已注入但长时间未确认

**可能原因**: 
- 网络拥堵
- 节点同步问题
- 交易池已满

**解决方案**: 
1. **检查节点状态**: 
   ```bash
   node scripts/query_chain.js --tip
   ```

2. **等待出块**: 
   - DevNet 出块时间约为 10 秒
   - 通常需要 1-2 个出块周期确认

3. **重新注入**(如果交易确实丢失): 
   - using新的 Nonce 值
   - 保持其他参数不变

## 3. 智能合约问题

### 3.1 AINVM 合约部署失败

**症状**: 合约部署交易被拒绝或执行失败

**可能原因**: 
- 合约代码格式错误
- 部署费用不足
- 合约大小超过限制

**解决方案**: 
1. **检查合约代码**: 
   - 确保using正确的 JavaScript 语法
   - 避免using不支持的 API

2. **检查部署费用**: 
   ```bash
   # 确保账户余额充足
   node scripts/query_chain.js --balance <部署地址>
   ```

3. **using示例合约**: 
   ```bash
   # test示例合约
   node examples/ainvm_example.js
   ```

### 3.2 合约call失败

**症状**: 合约call交易执行失败

**可能原因**: 
- 合约does not exist
- call参数错误
- 合约执行异常

**解决方案**: 
1. **检查合约地址**: 
   - 确认合约已成功部署
   - 验证合约地址是否正确

2. **检查call参数**: 
   - 确保参数类型和数量正确
   - 验证参数值是否在有效范围内

3. **查看合约日志**: 
   - 检查节点日志中的合约执行信息
   - 查看 `data/events/` 目录中的相关事件

## 4. 数据同步问题

### 4.1 节点状态不同步

**症状**: 不同节点的链状态不一致

**可能原因**: 
- 网络分区
- 节点崩溃后重启
- 共识算法问题

**解决方案**: 
1. **检查节点高度**: 
   ```bash
   node scripts/query_chain.js --tip
   ```

2. **重启同步**: 
   - 停止所有节点
   - 从创世节点开始按顺序重启
   - 等待节点完全同步

3. **重置节点**(谨慎操作): 
   ```bash
   # 备份后删除状态文件
   rm -rf data/state/node*.json
   # 重启节点
   ```

### 4.2 状态文件损坏

**症状**: 节点启动时提示状态文件读取错误

**可能原因**: 
- 异常关机导致文件损坏
- 磁盘空间不足
- 文件权限问题

**解决方案**: 
1. **检查磁盘空间**: 
   ```bash
   # Windows
   dir
   # Linux/Mac
   df -h
   ```

2. **恢复备份**: 
   - 如果有状态文件备份, 恢复到 `data/state/` 目录

3. **重置状态**(谨慎操作): 
   ```bash
   # 删除损坏的状态文件
   rm -rf data/state/*
   # 重启节点, 会重新生成状态
   ```

## 5. 开发环境问题

### 5.1 依赖安装失败

**症状**: 运行 `npm install` 时出现错误

**可能原因**: 
- 网络连接问题
- Node.js 版本不兼容
- npm 缓存问题

**解决方案**: 
1. **清理 npm 缓存**: 
   ```bash
   npm cache clean --force
   ```

2. **using镜像源**: 
   ```bash
   npm install --registry https://registry.npmmirror.com
   ```

3. **升级 Node.js**: 
   - 确保using Node.js 18 或更高版本
   - 推荐using nvm 管理多个 Node.js 版本

### 5.2 test失败

**症状**: 运行 `npm test` 时部分或全部test失败

**可能原因**: 
- 环境配置错误
- 代码修改引入了回归
- 依赖版本不匹配

**解决方案**: 
1. **检查test输出**: 
   - 查看详细的test失败信息
   - 定位具体失败的test用例

2. **恢复环境**: 
   ```bash
   # 重新安装依赖
   npm install
   # 重置test环境
   rm -rf data/test/*
   ```

3. **检查代码修改**: 
   - 对比最近的代码变更
   - 确保修改没有破坏现有功能

## 6. Agent 注册问题

### 6.1 Agent registration failed

**症状**: AGENT_REGISTER 交易被拒绝

**可能原因**: 
- 注册信息不完整
- 签名verification failed
- 注册费用不足

**解决方案**: 
1. **using示例脚本**: 
   ```bash
   node examples/agent_register_demo.js
   ```

2. **检查注册信息**: 
   - 确保提供了完整的 Agent 信息
   - verify signature是否正确

3. **检查余额**: 
   ```bash
   node scripts/query_chain.js --balance <注册地址>
   ```

### 6.2 Agent 信息查询失败

**症状**: using `query_agents.js` 无法查询到 Agent 信息

**可能原因**: 
- Agent 未成功注册
- 查询参数错误
- 节点状态不同步

**解决方案**: 
1. **检查注册状态**: 
   ```bash
   node scripts/query_agents.js
   ```

2. **验证注册交易**: 
   - 检查交易是否已确认
   - 查看交易响应whether successful

3. **同步节点状态**: 
   - 确保节点已完全同步
   - 等待交易确认后再查询

## 7. 性能问题

### 7.1 节点运行缓慢

**症状**: 节点响应延迟, 交易处理缓慢

**可能原因**: 
- 系统资源不足
- 网络带宽限制
- 磁盘 I/O 瓶颈

**解决方案**: 
1. **检查系统资源**: 
   ```bash
   # Windows
   taskmgr
   # Linux/Mac
   top
   ```

2. **优化配置**: 
   - 确保系统有足够的内存(推荐至少 4GB)
   - using SSD 存储提高 I/O 性能

3. **限制并发连接**: 
   - 调整 P2P 连接数限制
   - 避免同时注入大量交易

### 7.2 交易处理延迟

**症状**: 交易注入后需要很长时间才能确认

**可能原因**: 
- 交易池积压
- 网络拥堵
- 节点性能不足

**解决方案**: 
1. **监控交易池**: 
   - 查看节点日志中的交易池状态
   - 避免同时提交大量交易

2. **优化交易**: 
   - 合理设置交易费用
   - 避免提交无效交易

3. **增加节点资源**: 
   - 提高节点的 CPU 和内存配置
   - using更快的存储设备

## 8. 安全问题

### 8.1 私钥管理

**症状**: 担心私钥泄露或安全风险

**解决方案**: 
1. **usingtest密钥**: 
   - 在 DevNet 环境中usingtest私钥
   - 避免在test环境中using真实密钥

2. **保护密钥文件**: 
   - 确保 `data/wallet/` 目录权限正确
   - 不要将私钥文件提交到版本控制系统

3. **using环境变量**: 
   - 考虑using环境变量存储敏感信息
   - 避免硬编码私钥到代码中

### 8.2 网络安全

**症状**: 担心网络被攻击或滥用

**解决方案**: 
1. **限制网络访问**: 
   - DevNet 仅在本地运行
   - 不要在生产环境暴露 HTTP 接口

2. **using防火墙**: 
   - 限制 P2P 端口的访问
   - 仅允许可信节点连接

3. **监控异常**: 
   - 定期检查节点日志
   - 监控异常交易和行为

## 9. 高级排查技巧

### 9.1 日志分析

**节点日志包含大量有用信息, 可用于排查各种问题**: 

1. **启动日志**: 
   - 检查节点初始化过程中的错误
   - 验证配置和依赖是否正确

2. **交易日志**: 
   - 查看交易处理过程
   - 定位交易失败的具体原因

3. **P2P 日志**: 
   - 分析网络连接状态
   - 识别网络问题的根源

### 9.2 状态检查

**using查询脚本检查链状态**: 

```bash
# 检查链头信息
node scripts/query_chain.js --tip

# 检查地址余额
node scripts/query_chain.js --balance <地址>

# 检查创世地址余额
node scripts/query_chain.js --genesis-balance

# 检查治理提案
node scripts/query_proposals.js

# 检查 Agent 信息
node scripts/query_agents.js
```

### 9.3 网络诊断

**诊断网络连接问题**: 

1. **检查端口状态**: 
   ```bash
   # 检查 HTTP 接口端口
   netstat -ano | findstr :19890
   # 检查 P2P 端口
   netstat -ano | findstr :9847
   # 检查 Agent 接入 API 端口
   netstat -ano | findstr :9849
   ```

2. **test接口可用性**: 
   ```bash
   # test交易注入接口
   curl http://127.0.0.1:19890/tx
   # test Agent 接入 API 健康检查
   curl http://localhost:9849/health
   ```

3. **网络连通性test**: 
   ```bash
   # test节点间连通性
   ping localhost
   # test端口连通性
   telnet localhost 19890
   ```

## 10. 常见错误代码与解决方案

### 10.1 交易错误代码

| 错误信息 | 可能原因 | 解决方案 |
|----------|----------|----------|
| `INSUFFICIENT_BALANCE` | 发送方余额不足 | 检查余额, 减少交易金额 |
| `INVALID_SIGNATURE` | 签名verification failed | 确保using正确的私钥签名 |
| `INVALID_TRANSACTION` | 交易结构无效 | 检查交易字段, using示例脚本 |
| `DUPLICATE_TRANSACTION` | 交易already exists | using新的交易 ID 和 Nonce |
| `INSUFFICIENT_FEE` | 手续费不足 | 增加手续费金额 |
| `NONCE_TOO_LOW` | Nonce 值过低 | using正确的 Nonce 值 |

### 10.2 节点错误代码

| 错误信息 | 可能原因 | 解决方案 |
|----------|----------|----------|
| `PORT_ALREADY_IN_USE` | 端口被占用 | 检查并关闭占用端口的进程 |
| `STATE_FILE_CORRUPT` | 状态文件损坏 | 删除损坏文件, 重启节点 |
| `DATABASE_ERROR` | 数据库操作失败 | 检查磁盘空间和权限 |
| `PEER_CONNECTION_FAILED` | P2P 连接失败 | 检查网络配置和防火墙 |
| `INTERNAL_ERROR` | 内部错误 | 查看详细日志, 重启节点 |

## 11. 最佳实践

### 11.1 开发流程最佳实践

1. **环境隔离**: 
   - using独立的开发, test和生产环境
   - 在 DevNet 中进行所有test

2. **代码管理**: 
   - using版本控制系统(Git)
   - 遵循提交规范
   - 定期合并和更新分支

3. **test策略**: 
   - 每次代码变更后运行test
   - 编写单元test和集成test
   - 进行端到端test

### 11.2 运维最佳实践

1. **监控**: 
   - 监控节点状态和性能
   - 设置日志告警
   - 定期检查网络健康状况

2. **备份**: 
   - 定期备份状态文件和钱包
   - 建立灾难恢复计划
   - test备份恢复流程

3. **更新**: 
   - 定期更新依赖和代码
   - test后再部署到生产环境
   - 记录所有变更

### 11.3 安全最佳实践

1. **密钥管理**: 
   - using硬件钱包存储主密钥
   - 定期轮换密钥
   - 实施多签机制

2. **网络安全**: 
   - using TLS 加密通信
   - 实施访问控制
   - 定期进行security audit

3. **代码安全**: 
   - 避免硬编码敏感信息
   - 定期进行代码审查
   - using安全扫描工具

## 12. 联系支持

如果遇到无法解决的问题, 可以via以下方式获取支持: 

1. **GitHub Issues**: 
   - 在项目仓库中创建 Issue
   - 提供详细的错误信息和复现步骤

2. **社区讨论**: 
   - 参与项目社区讨论
   - 分享问题和解决方案

3. **开发团队**: 
   - 联系项目维护者
   - 提供完整的日志和环境信息

**注意**: 在寻求支持时, 请提供以下信息: 
- 详细的错误信息和日志
- 操作系统和 Node.js 版本
- 网络环境和配置
- 已尝试的解决方案
- 复现问题的步骤

via遵循本指南, 您应该能够解决大多数在 NexusGenesis 开发和运行过程中遇到的问题. 如果问题仍然存在, 请不要犹豫, 及时寻求社区或开发团队的帮助. 