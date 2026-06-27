#!/usr/bin/env node

import { execSync } from 'child_process';

// 测试项目审核流程
function testAuditFlow() {
  console.log('========================================');
  console.log('Testing NexusGenesis Audit Flow');
  console.log('========================================');

  try {
    // 1. 提交项目
    console.log('1. Submitting test project...');
    execSync('node scripts/audit_cli.js submit project-test-001 "Test Project 1" "This is a test project for audit flow"', { stdio: 'inherit' });

    // 2. 审核项目
    console.log('\n2. Reviewing test project...');
    execSync('node scripts/audit_cli.js review project-test-001 true "Project looks good"', { stdio: 'inherit' });

    // 3. 批准项目
    console.log('\n3. Approving test project...');
    execSync('node scripts/audit_cli.js approve project-test-001 "Project approved after review"', { stdio: 'inherit' });

    // 4. 查看项目状态
    console.log('\n4. Checking project status...');
    execSync('node scripts/audit_cli.js status project-test-001', { stdio: 'inherit' });

    // 5. 列出所有项目
    console.log('\n5. Listing all projects...');
    execSync('node scripts/audit_cli.js list', { stdio: 'inherit' });

    // 6. 查看审核统计信息
    console.log('\n6. Checking audit statistics...');
    execSync('node scripts/audit_cli.js stats', { stdio: 'inherit' });

    console.log('\n========================================');
    console.log('Audit flow test completed successfully!');
    console.log('========================================');
  } catch (error) {
    console.error('Error during audit flow test:', error.message);
  }
}

// 运行测试
testAuditFlow();
