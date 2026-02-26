/**
 * AINVM (AI Network Virtual Machine) - 最小实现
 * 
 * 栈机模型的虚拟机，支持确定性执行和可计费
 */

class AINVM {
  constructor() {
    this.stack = [];          // 执行栈
    this.memory = new Map();  // 简单内存（键值存储）
    this.pc = 0;              // 程序计数器
    this.gasUsed = 0;         // 已使用的 gas
    this.gasLimit = 0;        // gas 限制
    this.program = [];        // 字节码程序
    this.halted = false;       // 是否已停止执行
    this.returnValue = null;   // 返回值
  }

  /**
   * 加载程序
   * @param {Uint8Array|Array} program - 字节码程序
   */
  loadProgram(program) {
    this.program = Array.isArray(program) ? program : Array.from(program);
    this.reset();
  }

  /**
   * 重置 VM 状态
   */
  reset() {
    this.stack = [];
    this.memory = new Map();
    this.pc = 0;
    this.gasUsed = 0;
    this.halted = false;
    this.returnValue = null;
  }

  /**
   * 执行程序
   * @param {number} gasLimit - gas 限制
   * @returns {object} 执行结果
   */
  execute(gasLimit) {
    this.gasLimit = gasLimit;
    this.gasUsed = 0;
    this.halted = false;
    this.returnValue = null;

    try {
      while (!this.halted && this.pc < this.program.length) {
        if (this.gasUsed > this.gasLimit) {
          return {
            success: false,
            error: 'out of gas',
            gasUsed: this.gasUsed,
            stack: [...this.stack]
          };
        }

        this.step();
      }

      return {
        success: true,
        gasUsed: this.gasUsed,
        stack: [...this.stack],
        returnValue: this.returnValue,
        memory: Object.fromEntries(this.memory)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        gasUsed: this.gasUsed,
        stack: [...this.stack]
      };
    }
  }

  /**
   * 执行单步指令
   */
  step() {
    if (this.pc >= this.program.length) {
      this.halted = true;
      return;
    }

    const opcode = this.program[this.pc];
    this.pc++;

    switch (opcode) {
      case 0x01: // PUSH
        this.executePUSH();
        break;
      case 0x02: // POP
        this.executePOP();
        break;
      case 0x03: // ADD
        this.executeADD();
        break;
      case 0x04: // SUB
        this.executeSUB();
        break;
      case 0x05: // MUL
        this.executeMUL();
        break;
      case 0x06: // DIV
        this.executeDIV();
        break;
      case 0x07: // LOAD
        this.executeLOAD();
        break;
      case 0x08: // STORE
        this.executeSTORE();
        break;
      case 0x09: // JMP
        this.executeJMP();
        break;
      case 0x0A: // JZ
        this.executeJZ();
        break;
      case 0x0B: // HALT
        this.executeHALT();
        break;
      case 0x0C: // RETURN
        this.executeRETURN();
        break;
      default:
        throw new Error(`Unknown opcode: ${opcode}`);
    }
  }

  /**
   * 消耗 gas
   * @param {number} amount - gas 数量
   */
  consumeGas(amount) {
    this.gasUsed += amount;
    if (this.gasUsed > this.gasLimit) {
      throw new Error('out of gas');
    }
  }

  /**
   * 执行 PUSH 指令
   */
  executePUSH() {
    if (this.pc >= this.program.length) {
      throw new Error('PUSH missing operand');
    }
    const value = this.program[this.pc];
    this.pc++;
    this.stack.push(value);
    this.consumeGas(1);
  }

  /**
   * 执行 POP 指令
   */
  executePOP() {
    if (this.stack.length === 0) {
      throw new Error('Stack underflow');
    }
    this.stack.pop();
    this.consumeGas(1);
  }

  /**
   * 执行 ADD 指令
   */
  executeADD() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for ADD');
    }
    const a = this.stack.pop();
    const b = this.stack.pop();
    this.stack.push(b + a);
    this.consumeGas(2);
  }

  /**
   * 执行 SUB 指令
   */
  executeSUB() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for SUB');
    }
    const a = this.stack.pop();
    const b = this.stack.pop();
    this.stack.push(b - a);
    this.consumeGas(2);
  }

  /**
   * 执行 MUL 指令
   */
  executeMUL() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for MUL');
    }
    const a = this.stack.pop();
    const b = this.stack.pop();
    this.stack.push(b * a);
    this.consumeGas(3);
  }

  /**
   * 执行 DIV 指令
   */
  executeDIV() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for DIV');
    }
    const a = this.stack.pop();
    const b = this.stack.pop();
    if (a === 0) {
      throw new Error('Division by zero');
    }
    this.stack.push(Math.floor(b / a));
    this.consumeGas(3);
  }

  /**
   * 执行 LOAD 指令
   */
  executeLOAD() {
    if (this.pc >= this.program.length) {
      throw new Error('LOAD missing operand');
    }
    const address = this.program[this.pc];
    this.pc++;
    const value = this.memory.get(address) || 0;
    this.stack.push(value);
    this.consumeGas(2);
  }

  /**
   * 执行 STORE 指令
   */
  executeSTORE() {
    if (this.pc >= this.program.length) {
      throw new Error('STORE missing operand');
    }
    if (this.stack.length === 0) {
      throw new Error('Stack underflow for STORE');
    }
    const address = this.program[this.pc];
    this.pc++;
    const value = this.stack.pop();
    this.memory.set(address, value);
    this.consumeGas(2);
  }

  /**
   * 执行 JMP 指令
   */
  executeJMP() {
    if (this.pc >= this.program.length) {
      throw new Error('JMP missing operand');
    }
    const offset = this.program[this.pc];
    this.pc += offset;
    this.consumeGas(1);
  }

  /**
   * 执行 JZ 指令
   */
  executeJZ() {
    if (this.pc >= this.program.length) {
      throw new Error('JZ missing operand');
    }
    if (this.stack.length === 0) {
      throw new Error('Stack underflow for JZ');
    }
    const offset = this.program[this.pc];
    this.pc++;
    const value = this.stack.pop();
    if (value === 0) {
      this.pc += offset;
    }
    this.consumeGas(2);
  }

  /**
   * 执行 HALT 指令
   */
  executeHALT() {
    this.halted = true;
    this.consumeGas(0);
  }

  /**
   * 执行 RETURN 指令
   */
  executeRETURN() {
    this.halted = true;
    if (this.stack.length > 0) {
      this.returnValue = this.stack[this.stack.length - 1];
    }
    this.consumeGas(0);
  }

  /**
   * 获取当前状态
   * @returns {object} VM 状态
   */
  getState() {
    return {
      stack: [...this.stack],
      memory: Object.fromEntries(this.memory),
      pc: this.pc,
      gasUsed: this.gasUsed,
      gasLimit: this.gasLimit,
      halted: this.halted,
      returnValue: this.returnValue
    };
  }
}

// 导出 AINVM
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AINVM;
}

if (typeof window !== 'undefined') {
  window.AINVM = AINVM;
}

export default AINVM;
