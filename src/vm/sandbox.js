/**
 * NexusGenesis - AINVM Sandbox 沙盒执行器
 * 
 * 安全宪法 §6.2 要求：所有未经验证代码在隔离沙盒中运行
 * 在 VM 之上添加：执行时限、强制资源上限、预执行静态分析、
 * 合约级资源预算、审计日志
 * 
 * 创世基准版 —— Agent 社区后续可扩展深度学习分析、形式化验证等
 */

export class SandboxConfig {
  constructor(overrides = {}) {
    // 执行时限 (ms)
    this.timeLimit = overrides.timeLimit ?? 5000;
    
    // 最大执行步数 (防止无限循环)
    this.maxSteps = overrides.maxSteps ?? 100000;
    
    // 强制栈深度上限 (执行期强制执行，不依赖 SECURITY_CHECK 指令)
    this.maxStackDepth = overrides.maxStackDepth ?? 1024;
    
    // 强制内存条目上限
    this.maxMemoryEntries = overrides.maxMemoryEntries ?? 10000;
    
    // 合约级 gas 预算
    this.gasBudget = overrides.gasBudget ?? 1000000;
    
    // 合约级内存预算 (bytes, 估算)
    this.memoryBudget = overrides.memoryBudget ?? 1048576; // 1MB
    
    // 是否启用字节码静态分析
    this.enableStaticAnalysis = overrides.enableStaticAnalysis ?? true;
    
    // 是否记录审计日志
    this.enableAuditLog = overrides.enableAuditLog ?? true;
    
    // 白名单操作码（即使静态分析可疑也允许）
    this.allowedOpcodes = new Set(
      overrides.allowedOpcodes ?? [
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, // PUSH, POP, ADD, SUB, MUL, DIV
        0x07, 0x08, 0x09, 0x0A, 0x0B, 0x0C, // LOAD, STORE, JMP, JZ, HALT, RETURN
        0x0D, 0x0E, 0x0F, 0x16, 0x17, 0x18, 0x19, // AND, OR, NOT, XOR, EQ, LT, GT
        0x1A, 0x1B, 0x1C, 0x1D, 0x1E,           // MOD, SHL, SHR, DUP, SWAP
        0x30, 0x31, 0x32                           // SECURITY_CHECK, REENTRANCY_LOCK, UNLOCK
      ]
    );
    
    // 需要额外 gas 的操作码（高成本操作）
    this.highCostOpcodes = new Set([
      0x10, 0x11, 0x12, 0x13, 0x14, 0x15, // MATRIX 操作
      0x20, 0x21, 0x22                      // AI 操作
    ]);
  }
}

export class SandboxExecutor {
  /**
   * @param {SandboxConfig} config 
   */
  constructor(config = new SandboxConfig()) {
    this.config = config;
    this.executionCount = 0;
    this.auditLogs = [];
  }

  /**
   * 在沙盒中安全执行字节码
   * @param {Array|Uint8Array} bytecode - 字节码
   * @param {number} gasLimit - gas 上限
   * @param {string} deployer - 部署者地址（用于审计）
   * @returns {object} 执行结果
   */
  async execute(bytecode, gasLimit, deployer = 'unknown') {
    this.executionCount++;
    const executionId = this.executionCount;
    const startTime = Date.now();
    let AINVM;

    const bytecodeArray = Array.isArray(bytecode) ? bytecode : Array.from(bytecode);

    // ===== 阶段 1: 静态分析 =====
    if (this.config.enableStaticAnalysis) {
      const analysis = this._staticAnalyze(bytecodeArray);
      if (!analysis.safe) {
        const logEntry = {
          executionId,
          phase: 'static_analysis',
          result: 'rejected',
          reason: analysis.reason,
          deployer,
          timestamp: Date.now()
        };
        this._audit(logEntry);
        return {
          success: false,
          sandboxRejected: true,
          phase: 'static_analysis',
          reason: `Code rejected by static analysis: ${analysis.reason}`,
          details: analysis.details
        };
      }
    }

    // ===== 阶段 2: 资源预算检查 =====
    const effectiveGasLimit = Math.min(gasLimit, this.config.gasBudget);
    try {
      AINVM = (await import('../vm/ainvm.js')).default;
    } catch (e) {
      return { success: false, sandboxRejected: true, reason: `VM init failed: ${e.message}` };
    }

    // ===== 阶段 3: 沙盒包装执行 =====
    const vm = new AINVM();
    vm.loadProgram(bytecodeArray);
    
    // 注入强制资源上限（覆盖自检指令的被动上限）
    vm._sandboxConfig = this.config;
    vm._sandboxStartTime = startTime;
    vm._sandboxStepCount = 0;
    vm._sandboxExecutionId = executionId;

    // 包装 step() 添加强制检查
    const originalStep = vm.step.bind(vm);
    vm.step = () => {
      // 限额 1: 步数上限
      vm._sandboxStepCount++;
      if (vm._sandboxStepCount > this.config.maxSteps) {
        throw new Error(`Sandbox: max steps (${this.config.maxSteps}) exceeded`);
      }

      // 限额 2: 时间上限
      const elapsed = Date.now() - vm._sandboxStartTime;
      if (elapsed > this.config.timeLimit) {
        throw new Error(`Sandbox: time limit (${this.config.timeLimit}ms) exceeded (${elapsed}ms)`);
      }

      // 限额 3: 栈深度强制上限
      if (vm.stack.length > this.config.maxStackDepth) {
        throw new Error(`Sandbox: stack depth (${this.config.maxStackDepth}) exceeded`);
      }

      // 限额 4: 内存条目强制上限
      if (vm.memory.size > this.config.maxMemoryEntries) {
        throw new Error(`Sandbox: memory entries (${this.config.maxMemoryEntries}) exceeded`);
      }

      originalStep();
    };

    // ===== 阶段 4: 执行 =====
    const executeStart = Date.now();
    let result;
    try {
      result = vm.execute(effectiveGasLimit);
    } catch (error) {
      result = {
        success: false,
        error: error.message,
        gasUsed: vm.gasUsed || 0,
        stepsExecuted: vm._sandboxStepCount || 0,
        stack: [...(vm.stack || [])]
      };
    }

    const executeTime = Date.now() - executeStart;
    const totalTime = Date.now() - startTime;

    // ===== 阶段 5: 结果检查与审计 =====
    result.stepsExecuted = vm._sandboxStepCount || 0;
    result.executeTimeMs = executeTime;
    result.totalTimeMs = totalTime;
    result.sandboxExecutionId = executionId;
    result.sandboxConfig = {
      timeLimit: this.config.timeLimit,
      maxSteps: this.config.maxSteps,
      maxStackDepth: this.config.maxStackDepth,
      maxMemoryEntries: this.config.maxMemoryEntries
    };

    // 额外：执行完毕后 cap 状态快照大小
    if (result.memory) {
      const memSize = JSON.stringify(result.memory).length;
      if (memSize > this.config.memoryBudget) {
        result.memoryTruncated = true;
        result.memory = { _truncated: true, _originalSize: memSize };
      }
    }

    if (result.stack && result.stack.length > 1000) {
      result.stackTruncated = true;
      result.stack = result.stack.slice(0, 1000);
      result.stack.push('...(truncated)');
    }

    const auditEntry = {
      executionId,
      timestamp: Date.now(),
      deployer,
      success: result.success,
      gasUsed: result.gasUsed || 0,
      stepsExecuted: result.stepsExecuted || 0,
      executeTimeMs: executeTime,
      totalTimeMs: totalTime,
      error: result.error || null,
      bytecodeSize: bytecodeArray.length,
      effectiveGasLimit,
      highCostOps: this._countHighCostOps(bytecodeArray)
    };
    this._audit(auditEntry);

    return result;
  }

  /**
   * 字节码静态分析
   * 检测无限循环、过大操作、可疑指令序列
   */
  _staticAnalyze(bytecode) {
    const details = {
      estimatedGas: 0,
      loopCount: 0,
      highCostOps: 0,
      suspiciousJumps: 0,
      maxMemoryAccess: 0
    };

    // 1. 遍历字节码收集统计信息
    const opcodeStats = {};
    for (let i = 0; i < bytecode.length; i++) {
      const opcode = bytecode[i];
      opcodeStats[opcode] = (opcodeStats[opcode] || 0) + 1;
      
      // PUSH 跳过操作数
      if (opcode === 0x01) { i++; continue; }
      // LOAD/STORE 跳过地址
      if (opcode === 0x07 || opcode === 0x08) { i++; continue; }
      // JMP/JZ 跳过偏移
      if (opcode === 0x09 || opcode === 0x0A) {
        i++;
        details.suspiciousJumps++;
        continue;
      }

      // 统计高成本操作
      if (this.config.highCostOpcodes.has(opcode)) {
        details.highCostOps++;
      }

      // 跟踪最大内存地址
      if (opcode === 0x07 || opcode === 0x08) {
        const addr = bytecode[i];
        if (addr > details.maxMemoryAccess) {
          details.maxMemoryAccess = addr;
        }
      }
    }

    // 2. 检查未知操作码
    const validOpcodes = [0x01,0x02,0x03,0x04,0x05,0x06,0x07,0x08,0x09,0x0A,
      0x0B,0x0C,0x0D,0x0E,0x0F,0x10,0x11,0x12,0x13,0x14,0x15,
      0x16,0x17,0x18,0x19,0x1A,0x1B,0x1C,0x1D,0x1E,
      0x20,0x21,0x22,0x30,0x31,0x32];
    const validSet = new Set(validOpcodes);
    for (const op of Object.keys(opcodeStats)) {
      const opNum = parseInt(op);
      if (opcodeStats[op] > 0 && !validSet.has(opNum)) {
        return {
          safe: false,
          reason: `Unknown opcode: 0x${opNum.toString(16).padStart(2, '0')} (${opcodeStats[op]} occurrences)`,
          details
        };
      }
    }

    // 3. JMP/JZ 循环检测 —— 过多反向跳转可能指示无限循环
    for (let i = 0; i < bytecode.length; i++) {
      const opcode = bytecode[i];
      if (opcode === 0x09 || opcode === 0x0A) {
        const offset = bytecode[i + 1];
        // 反向跳转
        if (offset < 0 || (offset > 128 && offset < 256)) {
          const signedOffset = offset > 127 ? offset - 256 : offset;
          if (signedOffset < 0) {
            details.loopCount++;
          }
        }
      }
      if (opcode === 0x01) { i++; }
    }

    // 4. 安全检查
    if (details.suspiciousJumps > 1000) {
      return { safe: false, reason: `Excessive jump instructions (${details.suspiciousJumps}), possible obfuscation`, details };
    }

    if (details.highCostOps > 500) {
      return { safe: false, reason: `Excessive high-cost operations (${details.highCostOps})`, details };
    }

    if (bytecode.length > 100000) {
      return { safe: false, reason: `Bytecode too large (${bytecode.length} bytes)`, details };
    }

    // 估算 gas
    let estimatedGas = 0;
    for (let i = 0; i < bytecode.length; i++) {
      const opcode = bytecode[i];
      switch (opcode) {
        case 0x01: estimatedGas += 2; i++; break;       // PUSH
        case 0x03: case 0x04: estimatedGas += 2; break;  // ADD/SUB
        case 0x05: case 0x06: estimatedGas += 3; break;  // MUL/DIV
        case 0x07: case 0x08: estimatedGas += 3; i++; break; // LOAD/STORE
        case 0x10: case 0x11: case 0x12: case 0x13: estimatedGas += 50; break; // MATRIX
        case 0x20: estimatedGas += 100; break; // AI_INFERENCE
        case 0x30: estimatedGas += 5; break; // SECURITY_CHECK
        default: estimatedGas += 1;
      }
    }
    details.estimatedGas = estimatedGas;

    // 5. Gas 预算检查
    if (estimatedGas > this.config.gasBudget) {
      return {
        safe: false,
        reason: `Estimated gas (${estimatedGas}) exceeds budget (${this.config.gasBudget})`,
        details
      };
    }

    return { safe: true, details };
  }

  /**
   * 统计高成本操作码
   */
  _countHighCostOps(bytecode) {
    let count = 0;
    for (const op of bytecode) {
      if (this.config.highCostOpcodes.has(op)) {
        count++;
      }
    }
    return count;
  }

  /**
   * 审计日志
   */
  _audit(entry) {
    if (this.config.enableAuditLog) {
      this.auditLogs.push(entry);
      if (this.auditLogs.length > 10000) {
        this.auditLogs = this.auditLogs.slice(-5000); // 保留最近 5000 条
      }
    }
  }

  /**
   * 获取审计统计
   */
  getAuditStats() {
    const total = this.auditLogs.length;
    const rejected = this.auditLogs.filter(e => e.phase === 'static_analysis').length;
    const failed = this.auditLogs.filter(e => !e.success && e.phase !== 'static_analysis').length;
    const succeeded = this.auditLogs.filter(e => e.success).length;
    const totalGas = this.auditLogs.reduce((sum, e) => sum + (e.gasUsed || 0), 0);
    const totalSteps = this.auditLogs.reduce((sum, e) => sum + (e.stepsExecuted || 0), 0);
    const avgTime = total > 0 
      ? this.auditLogs.reduce((sum, e) => sum + (e.executeTimeMs || 0), 0) / total 
      : 0;

    return {
      totalExecutions: total,
      staticRejections: rejected,
      executionFailures: failed,
      successfulExecutions: succeeded,
      successRate: total > 0 ? ((succeeded / total) * 100).toFixed(1) + '%' : 'N/A',
      totalGasConsumed: totalGas,
      totalStepsExecuted: totalSteps,
      averageExecuteTimeMs: avgTime.toFixed(2),
      activeConfig: {
        timeLimit: this.config.timeLimit,
        maxSteps: this.config.maxSteps,
        maxStackDepth: this.config.maxStackDepth,
        maxMemoryEntries: this.config.maxMemoryEntries
      }
    };
  }

  /**
   * 获取最近的审计日志
   */
  getRecentLogs(limit = 50) {
    return this.auditLogs.slice(-limit);
  }

  /**
   * 配置白名单操作码（Agent 社区可动态调整）
   */
  setAllowedOpcodes(opcodes) {
    this.config.allowedOpcodes = new Set(opcodes);
  }

  /**
   * 更新配置
   */
  updateConfig(overrides) {
    this.config = new SandboxConfig({ ...this.config, ...overrides });
  }
}

// 预构建的配置预设

/** 低风险预设：Playground/开发环境 */
export const LOW_RISK_CONFIG = new SandboxConfig({
  timeLimit: 30000,
  maxSteps: 500000,
  gasBudget: 10000000,
  memoryBudget: 5242880 // 5MB
});

/** 标准预设：合约部署 */
export const STANDARD_CONFIG = new SandboxConfig({
  timeLimit: 5000,
  maxSteps: 100000,
  gasBudget: 1000000,
  memoryBudget: 1048576 // 1MB
});

/** 严格预设：未验证代码（白皮书 §6.2 默认） */
export const STRICT_CONFIG = new SandboxConfig({
  timeLimit: 2000,
  maxSteps: 50000,
  gasBudget: 500000,
  memoryBudget: 524288, // 512KB
  maxStackDepth: 512,
  maxMemoryEntries: 5000
});

export default SandboxExecutor;