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
    this.matrixCounter = 0;    // 矩阵ID计数器（确定性）
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
      // 矩阵运算指令
      case 0x10: // MAT_CREATE
        this.executeMAT_CREATE();
        break;
      case 0x11: // MAT_ADD
        this.executeMAT_ADD();
        break;
      case 0x12: // MAT_MUL
        this.executeMAT_MUL();
        break;
      case 0x13: // MAT_TRANS
        this.executeMAT_TRANS();
        break;
      case 0x14: // MAT_LOAD
        this.executeMAT_LOAD();
        break;
      case 0x15: // MAT_STORE
        this.executeMAT_STORE();
        break;
      // AI相关指令
      case 0x20: // AI_INFERENCE
        this.executeAI_INFERENCE();
        break;
      case 0x21: // AI_MODEL_LOAD
        this.executeAI_MODEL_LOAD();
        break;
      case 0x22: // AI_MODEL_SAVE
        this.executeAI_MODEL_SAVE();
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
    
    // 验证地址范围
    if (typeof address !== 'number' || address < 0 || address > 255) {
      throw new Error('Invalid memory address');
    }
    
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
    
    // 验证地址范围
    if (typeof address !== 'number' || address < 0 || address > 255) {
      throw new Error('Invalid memory address');
    }
    
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
   * 执行 MAT_CREATE 指令
   * 栈操作：[rows, cols] -> [matrix_id]
   */
  executeMAT_CREATE() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for MAT_CREATE');
    }
    const cols = this.stack.pop();
    const rows = this.stack.pop();
    
    // 验证矩阵维度
    if (rows <= 0 || cols <= 0) {
      throw new Error('Matrix dimensions must be positive');
    }
    if (rows > 100 || cols > 100) {
      throw new Error('Matrix dimensions too large');
    }
    
    // 生成矩阵ID - 使用确定性计数器
    const matrixId = `mat_${this.matrixCounter++}`;
    
    // 在内存中创建矩阵
    this.memory.set(matrixId, {
      rows,
      cols,
      data: Array(rows * cols).fill(0)
    });
    
    this.stack.push(matrixId);
    this.consumeGas(5 + rows * cols); // 根据矩阵大小调整gas
  }

  /**
   * 执行 MAT_ADD 指令
   * 栈操作：[mat_id1, mat_id2] -> [result_mat_id]
   */
  executeMAT_ADD() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for MAT_ADD');
    }
    const matId2 = this.stack.pop();
    const matId1 = this.stack.pop();
    
    const mat1 = this.memory.get(matId1);
    const mat2 = this.memory.get(matId2);
    
    if (!mat1 || !mat2) {
      throw new Error('Matrix not found');
    }
    
    if (mat1.rows !== mat2.rows || mat1.cols !== mat2.cols) {
      throw new Error('Matrix dimensions mismatch for addition');
    }
    
    // 生成结果矩阵ID - 使用确定性计数器
    const resultMatId = `mat_${this.matrixCounter++}`;
    
    // 执行矩阵加法
    const resultData = [];
    for (let i = 0; i < mat1.rows * mat1.cols; i++) {
      resultData.push(mat1.data[i] + mat2.data[i]);
    }
    
    // 存储结果矩阵
    this.memory.set(resultMatId, {
      rows: mat1.rows,
      cols: mat1.cols,
      data: resultData
    });
    
    this.stack.push(resultMatId);
    this.consumeGas(10 * mat1.rows * mat1.cols);
  }

  /**
   * 执行 MAT_MUL 指令
   * 栈操作：[mat_id1, mat_id2] -> [result_mat_id]
   */
  executeMAT_MUL() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for MAT_MUL');
    }
    const matId2 = this.stack.pop();
    const matId1 = this.stack.pop();
    
    const mat1 = this.memory.get(matId1);
    const mat2 = this.memory.get(matId2);
    
    if (!mat1 || !mat2) {
      throw new Error('Matrix not found');
    }
    
    if (mat1.cols !== mat2.rows) {
      throw new Error('Matrix dimensions mismatch for multiplication');
    }
    
    // 计算运算复杂度，限制矩阵大小
    const complexity = mat1.rows * mat1.cols * mat2.cols;
    if (complexity > 1000000) {
      throw new Error('Matrix multiplication too complex');
    }
    
    // 生成结果矩阵ID - 使用确定性计数器
    const resultMatId = `mat_${this.matrixCounter++}`;
    
    // 执行矩阵乘法 - 优化实现
    const resultData = Array(mat1.rows * mat2.cols).fill(0);
    for (let i = 0; i < mat1.rows; i++) {
      for (let k = 0; k < mat1.cols; k++) {
        const value = mat1.data[i * mat1.cols + k];
        if (value !== 0) { // 跳过零值，提高性能
          for (let j = 0; j < mat2.cols; j++) {
            resultData[i * mat2.cols + j] += value * mat2.data[k * mat2.cols + j];
          }
        }
      }
    }
    
    // 存储结果矩阵
    this.memory.set(resultMatId, {
      rows: mat1.rows,
      cols: mat2.cols,
      data: resultData
    });
    
    this.stack.push(resultMatId);
    this.consumeGas(15 * complexity); // 优化gas计费
  }

  /**
   * 执行 MAT_TRANS 指令
   * 栈操作：[mat_id] -> [transposed_mat_id]
   */
  executeMAT_TRANS() {
    if (this.stack.length < 1) {
      throw new Error('Stack underflow for MAT_TRANS');
    }
    const matId = this.stack.pop();
    
    const mat = this.memory.get(matId);
    if (!mat) {
      throw new Error('Matrix not found');
    }
    
    // 生成转置矩阵ID - 使用确定性计数器
    const transposedMatId = `mat_${this.matrixCounter++}`;
    
    // 执行矩阵转置
    const transposedData = Array(mat.cols * mat.rows).fill(0);
    for (let i = 0; i < mat.rows; i++) {
      for (let j = 0; j < mat.cols; j++) {
        transposedData[j * mat.rows + i] = mat.data[i * mat.cols + j];
      }
    }
    
    // 存储转置矩阵
    this.memory.set(transposedMatId, {
      rows: mat.cols,
      cols: mat.rows,
      data: transposedData
    });
    
    this.stack.push(transposedMatId);
    this.consumeGas(10 * mat.rows * mat.cols);
  }

  /**
   * 执行 MAT_LOAD 指令
   * 栈操作：[mat_id, row, col] -> [value]
   */
  executeMAT_LOAD() {
    if (this.stack.length < 3) {
      throw new Error('Stack underflow for MAT_LOAD');
    }
    const col = this.stack.pop();
    const row = this.stack.pop();
    const matId = this.stack.pop();
    
    const mat = this.memory.get(matId);
    if (!mat) {
      throw new Error('Matrix not found');
    }
    
    if (row < 0 || row >= mat.rows || col < 0 || col >= mat.cols) {
      throw new Error('Matrix index out of bounds');
    }
    
    const value = mat.data[row * mat.cols + col];
    this.stack.push(value);
    this.consumeGas(3);
  }

  /**
   * 执行 MAT_STORE 指令
   * 栈操作：[mat_id, row, col, value] -> []
   */
  executeMAT_STORE() {
    if (this.stack.length < 4) {
      throw new Error('Stack underflow for MAT_STORE');
    }
    const value = this.stack.pop();
    const col = this.stack.pop();
    const row = this.stack.pop();
    const matId = this.stack.pop();
    
    const mat = this.memory.get(matId);
    if (!mat) {
      throw new Error('Matrix not found');
    }
    
    if (row < 0 || row >= mat.rows || col < 0 || col >= mat.cols) {
      throw new Error('Matrix index out of bounds');
    }
    
    mat.data[row * mat.cols + col] = value;
    this.consumeGas(3);
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

  /**
   * 执行 AI_INFERENCE 指令
   * 栈操作：[model_id, input_data] -> [output_data]
   */
  executeAI_INFERENCE() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for AI_INFERENCE');
    }
    const inputData = this.stack.pop();
    const modelId = this.stack.pop();
    
    // 验证模型是否存在
    const model = this.memory.get(modelId);
    if (!model) {
      throw new Error(`AI model not found: ${modelId}`);
    }
    
    // 模拟AI推理过程
    // 实际实现中，这里会调用真实的AI模型
    const outputData = `inference_result_${Date.now()}`;
    
    // 存储推理结果
    const resultId = `ai_result_${this.matrixCounter++}`;
    this.memory.set(resultId, outputData);
    
    this.stack.push(resultId);
    this.consumeGas(100); // AI操作消耗较多gas
  }

  /**
   * 执行 AI_MODEL_LOAD 指令
   * 栈操作：[model_path] -> [model_id]
   */
  executeAI_MODEL_LOAD() {
    if (this.stack.length < 1) {
      throw new Error('Stack underflow for AI_MODEL_LOAD');
    }
    const modelPath = this.stack.pop();
    
    // 模拟加载AI模型
    // 实际实现中，这里会从指定路径加载模型
    const modelId = `ai_model_${this.matrixCounter++}`;
    
    // 存储模型信息
    this.memory.set(modelId, {
      path: modelPath,
      loadedAt: Date.now(),
      status: 'loaded'
    });
    
    this.stack.push(modelId);
    this.consumeGas(50); // 模型加载消耗较多gas
  }

  /**
   * 执行 AI_MODEL_SAVE 指令
   * 栈操作：[model_id, model_path] -> []
   */
  executeAI_MODEL_SAVE() {
    if (this.stack.length < 2) {
      throw new Error('Stack underflow for AI_MODEL_SAVE');
    }
    const modelPath = this.stack.pop();
    const modelId = this.stack.pop();
    
    // 验证模型是否存在
    const model = this.memory.get(modelId);
    if (!model) {
      throw new Error(`AI model not found: ${modelId}`);
    }
    
    // 模拟保存AI模型
    // 实际实现中，这里会将模型保存到指定路径
    model.savedPath = modelPath;
    model.savedAt = Date.now();
    
    this.consumeGas(30); // 模型保存消耗中等gas
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
