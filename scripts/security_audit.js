#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

// Security audit配置
const CONFIG = {
  // 要检查的文件类型
  fileTypes: ['.js', '.json', '.env'],
  // 敏感信息模式
  sensitivePatterns: [
    { name: 'API Key', pattern: /api[_-]?key|API[_-]?KEY/gi },
    { name: 'Private Key', pattern: /private[_-]?key|PRIVATE[_-]?KEY/gi },
    { name: 'Secret', pattern: /secret|SECRET/gi },
    { name: 'Password', pattern: /password|PASSWORD/gi },
    { name: 'Token', pattern: /token|TOKEN/gi },
    { name: 'MongoDB URI', pattern: /mongodb:\/\//gi },
    { name: 'AWS Key', pattern: /aws[_-]?key|AWS[_-]?KEY/gi },
    { name: 'Google API Key', pattern: /google[_-]?api[_-]?key|GOOGLE[_-]?API[_-]?KEY/gi }
  ],
  // 要排除的目录
  excludeDirs: ['node_modules', 'data', 'logs', 'backups', '.git'],
  // 要检查的目录
  checkDirs: ['src', 'scripts', 'examples', 'config']
};

// 审计结果
const auditResults = {
  filesScanned: 0,
  issuesFound: 0,
  issues: []
};

// 扫描文件
async function scanFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    auditResults.filesScanned++;

    // 检查敏感信息
    for (const pattern of CONFIG.sensitivePatterns) {
      const matches = content.match(pattern.pattern);
      if (matches) {
        auditResults.issuesFound++;
        auditResults.issues.push({
          file: filePath,
          type: 'Sensitive Information',
          description: `${pattern.name} found ${matches.length} times`,
          severity: 'HIGH'
        });
      }
    }

    // 检查硬编码的密码
    const passwordPattern = /password\s*[:=]\s*['"]([^'"]+)['"]/gi;
    let match;
    while ((match = passwordPattern.exec(content)) !== null) {
      if (match[1] && match[1] !== 'set-your-password' && match[1] !== 'your-password-here') {
        auditResults.issuesFound++;
        auditResults.issues.push({
          file: filePath,
          type: 'Hardcoded Password',
          description: `Hardcoded password found: ${match[1]}`,
          severity: 'CRITICAL'
        });
      }
    }

    // 检查硬编码的API密钥
    const apiKeyPattern = /api[_-]?key\s*[:=]\s*['"]([^'"]+)['"]/gi;
    while ((match = apiKeyPattern.exec(content)) !== null) {
      if (match[1] && match[1] !== 'your-api-key' && match[1] !== 'set-your-api-key') {
        auditResults.issuesFound++;
        auditResults.issues.push({
          file: filePath,
          type: 'Hardcoded API Key',
          description: `Hardcoded API key found: ${match[1]}`,
          severity: 'HIGH'
        });
      }
    }

    // 检查输入验证
    if (filePath.endsWith('.js')) {
      const inputValidationPatterns = [
        { pattern: /req\.body|req\.query|req\.params/gi, description: 'Potential input without validation' },
        { pattern: /eval\(|new Function\(/gi, description: 'Potential code injection' },
        { pattern: /exec\(|spawn\(|fork\(/gi, description: 'Potential command injection' },
        { pattern: /innerHTML|outerHTML/gi, description: 'Potential XSS vulnerability' }
      ];

      for (const { pattern, description } of inputValidationPatterns) {
        const matches = content.match(pattern);
        if (matches) {
          auditResults.issuesFound++;
          auditResults.issues.push({
            file: filePath,
            type: 'Input Validation',
            description: `${description} found ${matches.length} times`,
            severity: 'MEDIUM'
          });
        }
      }
    }

  } catch (error) {
    console.error(`Error scanning file ${filePath}:`, error.message);
  }
}

// 递归扫描目录
async function scanDirectory(dirPath) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // 检查是否需要排除
      if (CONFIG.excludeDirs.includes(entry.name)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        await scanDirectory(fullPath);
      } else if (entry.isFile() && CONFIG.fileTypes.some(ext => fullPath.endsWith(ext))) {
        await scanFile(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error scanning directory ${dirPath}:`, error.message);
  }
}

// 检查依赖安全性
function checkDependencies() {
  try {
    console.log('Checking dependencies for security vulnerabilities...');
    const result = execSync('npm audit --json', { encoding: 'utf8' });
    const auditData = JSON.parse(result);
    
    if (auditData.vulnerabilities && 
        (auditData.vulnerabilities.info + auditData.vulnerabilities.low + 
         auditData.vulnerabilities.moderate + auditData.vulnerabilities.high + 
         auditData.vulnerabilities.critical) > 0) {
      auditResults.issuesFound++;
      auditResults.issues.push({
        file: 'package.json',
        type: 'Dependency Vulnerability',
        description: `Found ${auditData.vulnerabilities.critical} critical, ${auditData.vulnerabilities.high} high, ${auditData.vulnerabilities.moderate} moderate vulnerabilities in dependencies`,
        severity: 'HIGH'
      });
    } else {
      console.log('No dependency vulnerabilities found.');
    }
  } catch (error) {
    console.error('Error checking dependencies:', error.message);
  }
}

// 生成审计报告
function generateReport() {
  console.log('\n========================================');
  console.log('NexusGenesis Security Audit Report');
  console.log('========================================');
  console.log(`Files Scanned: ${auditResults.filesScanned}`);
  console.log(`Issues Found: ${auditResults.issuesFound}`);
  console.log('========================================');
  
  if (auditResults.issues.length > 0) {
    console.log('\nIssues Found:');
    console.log('========================================');
    
    // 按严重程度排序
    const sortedIssues = [...auditResults.issues].sort((a, b) => {
      const severityOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
    
    sortedIssues.forEach((issue, index) => {
      console.log(`\n${index + 1}. ${issue.type} (${issue.severity})`);
      console.log(`   File: ${issue.file}`);
      console.log(`   Description: ${issue.description}`);
    });
    
    console.log('\n========================================');
    console.log('Recommendations:');
    console.log('1. Remove all hardcoded sensitive information');
    console.log('2. Use environment variables for secrets');
    console.log('3. Implement proper input validation');
    console.log('4. Update dependencies with security vulnerabilities');
    console.log('5. Use secure coding practices');
  } else {
    console.log('\nNo security issues found!');
    console.log('Your codebase is secure.');
  }
  
  console.log('========================================');
}

// 主函数
async function main() {
  console.log('========================================');
  console.log('Starting NexusGenesis Security Audit');
  console.log('========================================');
  
  // 扫描目录
  for (const dir of CONFIG.checkDirs) {
    const dirPath = path.join(process.cwd(), dir);
    console.log(`Scanning directory: ${dirPath}`);
    await scanDirectory(dirPath);
  }
  
  // 检查依赖
  checkDependencies();
  
  // 生成报告
  generateReport();
  
  // 保存结果到文件
  try {
    const reportPath = path.join('data', 'security', 'audit_report.json');
    await fs.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.writeFile(reportPath, JSON.stringify(auditResults, null, 2));
    console.log(`\nAudit report saved to: ${reportPath}`);
  } catch (error) {
    console.error('Error saving audit report:', error.message);
  }
  
  // 如果发现严重问题，退出码为1
  if (auditResults.issues.some(issue => issue.severity === 'CRITICAL' || issue.severity === 'HIGH')) {
    process.exit(1);
  }
}

// 运行主函数
main();