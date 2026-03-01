/**
 * NexusGenesis CLI
 * 命令行工具，用于智能合约开发、部署和交互
 */

#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { program } from 'commander';
import sdk from './src/sdk/index.js';

// 版本号
const VERSION = '1.0.0';

// 初始化命令行程序
program
  .version(VERSION)
  .description('NexusGenesis 智能合约开发工具');

// 部署合约命令
program
  .command('deploy <file>')
  .description('部署智能合约')
  .option('-n, --name <name>', '合约名称')
  .action(async (file, options) => {
    try {
      console.log(`Deploying contract from ${file}...`);
      const code = await fs.readFile(file, 'utf8');
      const contractId = sdk.deployContract(code, options.name || path.basename(file, '.js'));
      console.log(`Contract deployed successfully! Contract ID: ${contractId}`);
    } catch (error) {
      console.error('Error deploying contract:', error.message);
    }
  });

// 执行合约命令
program
  .command('execute <contractId>')
  .description('执行智能合约')
  .option('-g, --gas <gas>', 'gas限制', '10000')
  .action((contractId, options) => {
    try {
      console.log(`Executing contract ${contractId}...`);
      const result = sdk.executeContract(contractId, parseInt(options.gas));
      console.log('Execution result:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error executing contract:', error.message);
    }
  });

// 列出合约命令
program
  .command('list')
  .description('列出所有合约')
  .action(() => {
    try {
      const contracts = sdk.listContracts();
      console.log('Contracts:');
      contracts.forEach(contract => {
        console.log(`- ${contract.id}: ${contract.name}`);
      });
    } catch (error) {
      console.error('Error listing contracts:', error.message);
    }
  });

// 查看合约信息命令
program
  .command('info <contractId>')
  .description('查看合约信息')
  .action((contractId) => {
    try {
      const info = sdk.getContractInfo(contractId);
      console.log('Contract info:', JSON.stringify(info, null, 2));
    } catch (error) {
      console.error('Error getting contract info:', error.message);
    }
  });

// 列出模板命令
program
  .command('templates')
  .description('列出合约模板')
  .action(async () => {
    try {
      const templates = await sdk.listTemplates();
      console.log('Available templates:');
      templates.forEach(template => {
        console.log(`- ${template.name}`);
      });
    } catch (error) {
      console.error('Error listing templates:', error.message);
    }
  });

// 生成模板命令
program
  .command('init <template> <output>')
  .description('从模板生成合约')
  .action(async (template, output) => {
    try {
      console.log(`Generating contract from template ${template}...`);
      const code = await sdk.getTemplate(template);
      await sdk.saveContract(code, output);
      console.log(`Contract generated successfully! Saved to ${output}`);
    } catch (error) {
      console.error('Error generating contract:', error.message);
    }
  });

// 估算Gas命令
program
  .command('gas <contractId>')
  .description('估算合约Gas消耗')
  .action((contractId) => {
    try {
      const gas = sdk.estimateGas(contractId);
      console.log(`Estimated gas usage: ${gas}`);
    } catch (error) {
      console.error('Error estimating gas:', error.message);
    }
  });

// 优化合约命令
program
  .command('optimize <file> <output>')
  .description('优化合约代码')
  .action(async (file, output) => {
    try {
      console.log(`Optimizing contract ${file}...`);
      const code = await sdk.loadContract(file);
      const optimizedCode = sdk.optimizeContract(code);
      await sdk.saveContract(optimizedCode, output);
      console.log(`Contract optimized successfully! Saved to ${output}`);
    } catch (error) {
      console.error('Error optimizing contract:', error.message);
    }
  });

// 生成ABI命令
program
  .command('abi <contractId>')
  .description('生成合约ABI')
  .action((contractId) => {
    try {
      const abi = sdk.generateABI(contractId);
      console.log('Contract ABI:', JSON.stringify(abi, null, 2));
    } catch (error) {
      console.error('Error generating ABI:', error.message);
    }
  });

// 测试合约命令
program
  .command('test <contractId>')
  .description('测试合约')
  .action((contractId) => {
    try {
      const testCases = ['Test case 1', 'Test case 2'];
      const result = sdk.testContract(contractId, testCases);
      console.log('Test results:', JSON.stringify(result, null, 2));
    } catch (error) {
      console.error('Error testing contract:', error.message);
    }
  });

// 运行命令行程序
program.parse(process.argv);

// 如果没有提供命令，显示帮助信息
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
