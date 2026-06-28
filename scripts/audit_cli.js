#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { AuditTransactionType, AuditStatus } from '../src/blockchain/projectAudit.js';

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];

// 主函数
async function main() {
  try {
    if (command === 'submit') {
      await submitProject(args[1], args[2], args[3]);
    } else if (command === 'review') {
      await reviewProject(args[1], args[2], args[3]);
    } else if (command === 'approve') {
      await approveProject(args[1], args[2]);
    } else if (command === 'reject') {
      await rejectProject(args[1], args[2]);
    } else if (command === 'list') {
      await listProjects(args[1]);
    } else if (command === 'status') {
      await getProjectStatus(args[1]);
    } else if (command === 'stats') {
      await getAuditStats();
    } else if (command === 'help' || !command) {
      showHelp();
    } else {
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// 提交项目
async function submitProject(projectId, name, description) {
  if (!projectId || !name || !description) {
    console.error('Missing required parameters: projectId, name, description');
    showHelp();
    return;
  }

  // 创建交易
  const transaction = {
    id: `tx-${Date.now()}`,
    from: 'ng11MDW7FNhA5jL12NoptemTUUCippwfoUMPk', // 默认提交者地址
    tx_type: AuditTransactionType.PROJECT_SUBMIT,
    payload: {
      project_id: projectId,
      name: name,
      description: description
    },
    timestamp: Date.now()
  };

  // 保存交易到文件
  const txPath = path.join('data', 'transactions', `${transaction.id}.json`);
  await fs.mkdir(path.dirname(txPath), { recursive: true });
  await fs.writeFile(txPath, JSON.stringify(transaction, null, 2));

  console.log('========================================');
  console.log('Project submitted successfully!');
  console.log('========================================');
  console.log(`Project ID: ${projectId}`);
  console.log(`Name: ${name}`);
  console.log(`Description: ${description}`);
  console.log(`Transaction ID: ${transaction.id}`);
  console.log('========================================');
}

// 审核项目
async function reviewProject(projectId, approved, reason) {
  if (!projectId || typeof approved !== 'string') {
    console.error('Missing required parameters: projectId, approved (true/false)');
    showHelp();
    return;
  }

  // 创建交易
  const transaction = {
    id: `tx-${Date.now()}`,
    from: 'ng11MDW7FNhA5jL12NoptemTUUCippwfoUMPk', // 默认审核者地址
    tx_type: AuditTransactionType.PROJECT_REVIEW,
    payload: {
      project_id: projectId,
      approved: approved.toLowerCase() === 'true',
      reason: reason || ''
    },
    timestamp: Date.now()
  };

  // 保存交易到文件
  const txPath = path.join('data', 'transactions', `${transaction.id}.json`);
  await fs.mkdir(path.dirname(txPath), { recursive: true });
  await fs.writeFile(txPath, JSON.stringify(transaction, null, 2));

  console.log('========================================');
  console.log('Project reviewed successfully!');
  console.log('========================================');
  console.log(`Project ID: ${projectId}`);
  console.log(`Decision: ${transaction.payload.approved ? 'APPROVE' : 'REJECT'}`);
  console.log(`Reason: ${reason || 'No reason provided'}`);
  console.log(`Transaction ID: ${transaction.id}`);
  console.log('========================================');
}

// 批准项目
async function approveProject(projectId, reason) {
  if (!projectId) {
    console.error('Missing required parameter: projectId');
    showHelp();
    return;
  }

  // 创建交易
  const transaction = {
    id: `tx-${Date.now()}`,
    from: 'ng11MDW7FNhA5jL12NoptemTUUCippwfoUMPk', // 默认审核者地址
    tx_type: AuditTransactionType.PROJECT_APPROVE,
    payload: {
      project_id: projectId,
      reason: reason || 'Project approved'
    },
    timestamp: Date.now()
  };

  // 保存交易到文件
  const txPath = path.join('data', 'transactions', `${transaction.id}.json`);
  await fs.mkdir(path.dirname(txPath), { recursive: true });
  await fs.writeFile(txPath, JSON.stringify(transaction, null, 2));

  console.log('========================================');
  console.log('Project approved successfully!');
  console.log('========================================');
  console.log(`Project ID: ${projectId}`);
  console.log(`Reason: ${reason || 'Project approved'}`);
  console.log(`Transaction ID: ${transaction.id}`);
  console.log('========================================');
}

// 拒绝项目
async function rejectProject(projectId, reason) {
  if (!projectId) {
    console.error('Missing required parameter: projectId');
    showHelp();
    return;
  }

  // 创建交易
  const transaction = {
    id: `tx-${Date.now()}`,
    from: 'ng11MDW7FNhA5jL12NoptemTUUCippwfoUMPk', // 默认审核者地址
    tx_type: AuditTransactionType.PROJECT_REJECT,
    payload: {
      project_id: projectId,
      reason: reason || 'Project rejected'
    },
    timestamp: Date.now()
  };

  // 保存交易到文件
  const txPath = path.join('data', 'transactions', `${transaction.id}.json`);
  await fs.mkdir(path.dirname(txPath), { recursive: true });
  await fs.writeFile(txPath, JSON.stringify(transaction, null, 2));

  console.log('========================================');
  console.log('Project rejected successfully!');
  console.log('========================================');
  console.log(`Project ID: ${projectId}`);
  console.log(`Reason: ${reason || 'Project rejected'}`);
  console.log(`Transaction ID: ${transaction.id}`);
  console.log('========================================');
}

// 列出项目
async function listProjects(status) {
  try {
    // 读取状态文件
    const statePath = path.join('data', 'state', 'blockchainState.json');
    const stateData = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(stateData);

    if (!state.auditState || !state.auditState.projects) {
      console.log('No projects found.');
      return;
    }

    const projects = Object.values(state.auditState.projects);
    let filteredProjects = projects;

    if (status) {
      filteredProjects = projects.filter(project => project.status === status.toUpperCase());
    }

    console.log('========================================');
    console.log('Project List');
    console.log('========================================');
    console.log(`Total projects: ${filteredProjects.length}`);
    console.log('========================================');

    filteredProjects.forEach((project, index) => {
      console.log(`\nProject ${index + 1}:`);
      console.log(`  ID: ${project.projectId}`);
      console.log(`  Name: ${project.name}`);
      console.log(`  Status: ${project.status}`);
      console.log(`  Submitter: ${project.submitter}`);
      console.log(`  Submit Time: ${new Date(project.submitTime).toISOString()}`);
      console.log(`  Reviews: ${project.approveCount} approve, ${project.rejectCount} reject`);
    });

    console.log('========================================');
  } catch (error) {
    console.error('Error listing projects:', error.message);
  }
}

// get项目状态
async function getProjectStatus(projectId) {
  if (!projectId) {
    console.error('Missing required parameter: projectId');
    showHelp();
    return;
  }

  try {
    // 读取状态文件
    const statePath = path.join('data', 'state', 'blockchainState.json');
    const stateData = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(stateData);

    if (!state.auditState || !state.auditState.projects || !state.auditState.projects[projectId]) {
      console.log(`Project ${projectId} not found.`);
      return;
    }

    const project = state.auditState.projects[projectId];

    console.log('========================================');
    console.log('Project Status');
    console.log('========================================');
    console.log(`Project ID: ${project.projectId}`);
    console.log(`Name: ${project.name}`);
    console.log(`Description: ${project.description}`);
    console.log(`Status: ${project.status}`);
    console.log(`Submitter: ${project.submitter}`);
    console.log(`Submit Time: ${new Date(project.submitTime).toISOString()}`);
    console.log(`Reviewers: ${project.reviewers.length}`);
    console.log(`Reviews: ${project.approveCount} approve, ${project.rejectCount} reject`);

    if (project.finalDecision !== null) {
      console.log(`Final Decision: ${project.finalDecision ? 'APPROVED' : 'REJECTED'}`);
      console.log(`Decision Time: ${new Date(project.finalDecisionTime).toISOString()}`);
      console.log(`Decision Reason: ${project.finalDecisionReason}`);
    }

    console.log('========================================');
  } catch (error) {
    console.error('Error getting project status:', error.message);
  }
}

// get审核统计信息
async function getAuditStats() {
  try {
    // 读取状态文件
    const statePath = path.join('data', 'state', 'blockchainState.json');
    const stateData = await fs.readFile(statePath, 'utf8');
    const state = JSON.parse(stateData);

    if (!state.auditState || !state.auditState.projects) {
      console.log('No audit data found.');
      return;
    }

    const projects = Object.values(state.auditState.projects);
    const stats = {
      total: projects.length,
      pending: 0,
      reviewing: 0,
      approved: 0,
      rejected: 0,
      approvalRate: 0
    };

    projects.forEach(project => {
      switch (project.status) {
        case AuditStatus.PENDING:
          stats.pending++;
          break;
        case AuditStatus.REVIEWING:
          stats.reviewing++;
          break;
        case AuditStatus.APPROVED:
          stats.approved++;
          break;
        case AuditStatus.REJECTED:
          stats.rejected++;
          break;
      }
    });

    if (stats.approved + stats.rejected > 0) {
      stats.approvalRate = (stats.approved / (stats.approved + stats.rejected) * 100).toFixed(2);
    }

    console.log('========================================');
    console.log('Audit Statistics');
    console.log('========================================');
    console.log(`Total Projects: ${stats.total}`);
    console.log(`Pending: ${stats.pending}`);
    console.log(`Reviewing: ${stats.reviewing}`);
    console.log(`Approved: ${stats.approved}`);
    console.log(`Rejected: ${stats.rejected}`);
    console.log(`Approval Rate: ${stats.approvalRate}%`);
    console.log('========================================');
  } catch (error) {
    console.error('Error getting audit stats:', error.message);
  }
}

// 显示帮助信息
function showHelp() {
  console.log('========================================');
  console.log('NexusGenesis - Audit CLI');
  console.log('========================================');
  console.log('Usage:');
  console.log('  node scripts/audit_cli.js submit <projectId> <name> <description>');
  console.log('    - Submit a new project for audit');
  console.log('');
  console.log('  node scripts/audit_cli.js review <projectId> <approved> <reason>');
  console.log('    - Review a project (approved: true/false)');
  console.log('');
  console.log('  node scripts/audit_cli.js approve <projectId> <reason>');
  console.log('    - Approve a project');
  console.log('');
  console.log('  node scripts/audit_cli.js reject <projectId> <reason>');
  console.log('    - Reject a project');
  console.log('');
  console.log('  node scripts/audit_cli.js list [status]');
  console.log('    - List projects (optional status filter: PENDING, REVIEWING, APPROVED, REJECTED)');
  console.log('');
  console.log('  node scripts/audit_cli.js status <projectId>');
  console.log('    - Get project status');
  console.log('');
  console.log('  node scripts/audit_cli.js stats');
  console.log('    - Get audit statistics');
  console.log('');
  console.log('  node scripts/audit_cli.js help');
  console.log('    - Show this help message');
  console.log('========================================');
}

// 运行主函数
main();
