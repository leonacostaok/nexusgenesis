/**
 * NexusGenesis 系统备份与恢复服务
 * 提供可靠的数据备份和快速恢复功能
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import zlib from 'zlib';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 备份类型
const BACKUP_TYPES = {
  FULL: 'full',
  INCREMENTAL: 'incremental',
  DIFFERENTIAL: 'differential'
};

// 备份状态
const BACKUP_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

class BackupManager {
  constructor() {
    this.backups = new Map();
    this.backupDirectory = path.join(__dirname, '../../data/backups');
    this.systemDirectories = {
      wallet: path.join(__dirname, '../../data/wallet'),
      blockchain: path.join(__dirname, '../../data/blockchain'),
      agents: path.join(__dirname, '../../data/agents'),
      tasks: path.join(__dirname, '../../data/tasks'),
      state: path.join(__dirname, '../../data/state'),
      workflowTasks: path.join(__dirname, '../../data/workflow-tasks')
    };
    this.initDirectories();
    this.loadBackupHistory();
    this.setupBackupSchedule();
  }

  initDirectories() {
    // 确保备份目录存在
    if (!fs.existsSync(this.backupDirectory)) {
      fs.mkdirSync(this.backupDirectory, { recursive: true });
    }

    // 确保所有系统目录存在
    Object.values(this.systemDirectories).forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // 设置备份计划
  setupBackupSchedule() {
    console.log('[BackupManager] 设置备份计划');

    // 1. 每日完整备份（凌晨2点）
    this.scheduleDailyBackup(BACKUP_TYPES.FULL, 2, 0);

    // 2. 每小时增量备份
    this.scheduleHourlyBackup(BACKUP_TYPES.INCREMENTAL);

    // 3. 每周日完整备份（凌晨3点）
    this.scheduleWeeklyBackup(BACKUP_TYPES.FULL, 0, 3, 0);

    console.log('[BackupManager] 备份计划设置完成');
  }

  // 调度每日备份
  scheduleDailyBackup(type, hour, minute) {
    const now = new Date();
    let nextBackup = new Date(now);
    nextBackup.setHours(hour, minute, 0, 0);

    // 如果时间已过，设置为明天
    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }

    const delay = nextBackup - now;

    console.log(`[BackupManager] 调度每日${type}备份: ${nextBackup.toISOString()}`);

    setTimeout(() => {
      this.createBackup(type);
      // 递归调度下一次备份
      this.scheduleDailyBackup(type, hour, minute);
    }, delay);
  }

  // 调度每小时备份
  scheduleHourlyBackup(type) {
    const now = new Date();
    let nextBackup = new Date(now);
    nextBackup.setHours(nextBackup.getHours() + 1, 0, 0, 0);

    const delay = nextBackup - now;

    console.log(`[BackupManager] 调度每小时${type}备份: ${nextBackup.toISOString()}`);

    setTimeout(() => {
      this.createBackup(type);
      // 递归调度下一次备份
      this.scheduleHourlyBackup(type);
    }, delay);
  }

  // 调度每周备份
  scheduleWeeklyBackup(type, dayOfWeek, hour, minute) {
    const now = new Date();
    let nextBackup = new Date(now);

    // 设置到下一个指定的星期几
    while (nextBackup.getDay() !== dayOfWeek) {
      nextBackup.setDate(nextBackup.getDate() + 1);
    }

    nextBackup.setHours(hour, minute, 0, 0);

    // 如果时间已过，设置为下周
    if (nextBackup <= now) {
      nextBackup.setDate(nextBackup.getDate() + 7);
    }

    const delay = nextBackup - now;

    console.log(`[BackupManager] 调度每周${type}备份: ${nextBackup.toISOString()}`);

    setTimeout(() => {
      this.createBackup(type);
      // 递归调度下一次备份
      this.scheduleWeeklyBackup(type, dayOfWeek, hour, minute);
    }, delay);
  }

  // 创建备份
  async createBackup(type = BACKUP_TYPES.FULL, directories = null) {
    if (!directories) {
      directories = Object.keys(this.systemDirectories);
    }

    const backupId = `${type}-${Date.now()}`;
    const backup = {
      id: backupId,
      type,
      directories,
      status: BACKUP_STATUS.RUNNING,
      createdAt: new Date().toISOString(),
      completedAt: null,
      size: 0,
      filesCount: 0,
      duration: 0,
      error: null
    };

    this.backups.set(backupId, backup);

    console.log(`[BackupManager] 开始${type}备份: ${backupId}`);

    const startTime = Date.now();

    try {
      // 创建备份目录
      const backupPath = path.join(this.backupDirectory, backupId);
      fs.mkdirSync(backupPath, { recursive: true });

      // 根据备份类型执行不同的备份策略
      let filesCount = 0;
      let totalSize = 0;

      if (type === BACKUP_TYPES.FULL) {
        // 完整备份所有指定目录
        for (const dirName of directories) {
          const sourceDir = this.systemDirectories[dirName];
          const targetDir = path.join(backupPath, dirName);
          
          const { files, size } = await this.copyDirectory(sourceDir, targetDir, true);
          filesCount += files;
          totalSize += size;
        }
      } else if (type === BACKUP_TYPES.INCREMENTAL) {
        // 增量备份，仅备份上次备份后更改的文件
        const lastBackup = this.getLastBackup();
        if (!lastBackup) {
          // 如果没有上次备份，执行完整备份
          return this.createBackup(BACKUP_TYPES.FULL, directories);
        }

        const lastBackupTime = new Date(lastBackup.createdAt).getTime();
        
        for (const dirName of directories) {
          const sourceDir = this.systemDirectories[dirName];
          const targetDir = path.join(backupPath, dirName);
          
          const { files, size } = await this.copyChangedFiles(sourceDir, targetDir, lastBackupTime, true);
          filesCount += files;
          totalSize += size;
        }
      }

      // 更新备份信息
      backup.status = BACKUP_STATUS.COMPLETED;
      backup.completedAt = new Date().toISOString();
      backup.size = totalSize;
      backup.filesCount = filesCount;
      backup.duration = Date.now() - startTime;

      // 压缩备份
      await this.compressBackup(backupId);

      // 清理旧备份
      this.cleanupOldBackups();

      console.log(`[BackupManager] ${type}备份完成: ${backupId} (${filesCount}个文件，${(totalSize / 1024 / 1024).toFixed(2)}MB)`);

      return backup;
    } catch (error) {
      console.error(`[BackupManager] ${type}备份失败: ${backupId}`, error);

      backup.status = BACKUP_STATUS.FAILED;
      backup.completedAt = new Date().toISOString();
      backup.error = error.message;
      backup.duration = Date.now() - startTime;

      return backup;
    } finally {
      // 保存备份信息
      this.saveBackupHistory();
    }
  }

  // 复制目录
  async copyDirectory(source, target, compress = false) {
    if (!fs.existsSync(source)) {
      return { files: 0, size: 0 };
    }

    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    let filesCount = 0;
    let totalSize = 0;

    const items = fs.readdirSync(source);
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      
      const stats = fs.statSync(sourcePath);
      
      if (stats.isDirectory()) {
        const result = await this.copyDirectory(sourcePath, targetPath, compress);
        filesCount += result.files;
        totalSize += result.size;
      } else {
        // 复制文件
        await this.copyFile(sourcePath, targetPath, compress);
        filesCount++;
        totalSize += stats.size;
      }
    }

    return { files: filesCount, size: totalSize };
  }

  // 复制单个文件
  async copyFile(source, target, compress = false) {
    const data = fs.readFileSync(source);
    
    if (compress) {
      const compressed = zlib.gzipSync(data);
      fs.writeFileSync(`${target}.gz`, compressed);
    } else {
      fs.writeFileSync(target, data);
    }
  }

  // 复制更改的文件
  async copyChangedFiles(source, target, sinceTime, compress = false) {
    if (!fs.existsSync(source)) {
      return { files: 0, size: 0 };
    }

    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }

    let filesCount = 0;
    let totalSize = 0;

    const items = fs.readdirSync(source);
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      
      const stats = fs.statSync(sourcePath);
      
      if (stats.isDirectory()) {
        const result = await this.copyChangedFiles(sourcePath, targetPath, sinceTime, compress);
        filesCount += result.files;
        totalSize += result.size;
      } else if (stats.mtime.getTime() > sinceTime) {
        // 仅复制更改的文件
        await this.copyFile(sourcePath, targetPath, compress);
        filesCount++;
        totalSize += stats.size;
      }
    }

    return { files: filesCount, size: totalSize };
  }

  // 压缩备份
  async compressBackup(backupId) {
    const backupPath = path.join(this.backupDirectory, backupId);
    const zipPath = `${backupPath}.zip`;
    
    // TODO: 实现更完整的压缩功能
    // 目前只是将备份目录压缩为gzip文件
    const files = fs.readdirSync(backupPath);
    for (const file of files) {
      const filePath = path.join(backupPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        // 目录已经在复制时压缩了
        continue;
      }
      
      // 确保文件已压缩
      if (!file.endsWith('.gz')) {
        await this.copyFile(filePath, filePath, true);
        fs.unlinkSync(filePath);
      }
    }
  }

  // 恢复备份
  async restoreBackup(backupId, targetDirectories = null) {
    console.log(`[BackupManager] 开始恢复备份: ${backupId}`);

    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`备份 ${backupId} 不存在`);
    }

    if (backup.status !== BACKUP_STATUS.COMPLETED) {
      throw new Error(`备份 ${backupId} 未完成，无法恢复`);
    }

    const backupPath = path.join(this.backupDirectory, backupId);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`备份文件 ${backupPath} 不存在`);
    }

    const directories = targetDirectories || backup.directories;

    for (const dirName of directories) {
      const sourceDir = path.join(backupPath, dirName);
      const targetDir = this.systemDirectories[dirName];
      
      if (!fs.existsSync(sourceDir)) {
        console.warn(`备份中不存在目录 ${dirName}`);
        continue;
      }

      // 清空目标目录
      if (fs.existsSync(targetDir)) {
        fs.rmSync(targetDir, { recursive: true, force: true });
      }
      fs.mkdirSync(targetDir, { recursive: true });

      // 复制文件
      await this.extractDirectory(sourceDir, targetDir);
      console.log(`[BackupManager] 恢复目录 ${dirName} 完成`);
    }

    console.log(`[BackupManager] 备份恢复完成: ${backupId}`);
    return true;
  }

  // 解压目录
  async extractDirectory(source, target) {
    const items = fs.readdirSync(source);
    
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const stats = fs.statSync(sourcePath);
      
      if (stats.isDirectory()) {
        const targetPath = path.join(target, item);
        fs.mkdirSync(targetPath, { recursive: true });
        await this.extractDirectory(sourcePath, targetPath);
      } else if (item.endsWith('.gz')) {
        // 解压文件
        const targetPath = path.join(target, item.slice(0, -3));
        const compressedData = fs.readFileSync(sourcePath);
        const data = zlib.gunzipSync(compressedData);
        fs.writeFileSync(targetPath, data);
      } else {
        // 直接复制未压缩的文件
        fs.copyFileSync(sourcePath, path.join(target, item));
      }
    }
  }

  // 获取最后一次备份
  getLastBackup() {
    const backups = Array.from(this.backups.values());
    if (backups.length === 0) return null;
    
    return backups.sort((a, b) => 
      new Date(b.createdAt) - new Date(a.createdAt)
    )[0];
  }

  // 获取备份历史
  getBackupHistory(days = 7) {
    const backups = Array.from(this.backups.values());
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    return backups
      .filter(backup => new Date(backup.createdAt) >= cutoffDate)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // 清理旧备份
  cleanupOldBackups() {
    console.log('[BackupManager] 清理旧备份');
    
    // 保留最近30天的完整备份
    const fullBackups = Array.from(this.backups.values())
      .filter(backup => backup.type === BACKUP_TYPES.FULL && backup.status === BACKUP_STATUS.COMPLETED)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    // 保留最近30天的完整备份
    const backupsToKeep = fullBackups.slice(0, 30);
    const backupIdsToKeep = new Set(backupsToKeep.map(b => b.id));
    
    // 清理增量备份，只保留最近30天内的增量备份
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    this.backups.forEach((backup, backupId) => {
      // 保留指定的备份
      if (backupIdsToKeep.has(backupId)) {
        return;
      }
      
      // 保留最近30天的备份
      if (new Date(backup.createdAt) >= thirtyDaysAgo) {
        return;
      }
      
      // 删除旧备份
      this.deleteBackup(backupId);
    });
    
    console.log('[BackupManager] 旧备份清理完成');
  }

  // 删除备份
  deleteBackup(backupId) {
    const backup = this.backups.get(backupId);
    if (!backup) return;
    
    const backupPath = path.join(this.backupDirectory, backupId);
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }
    
    const compressedPath = `${backupPath}.zip`;
    if (fs.existsSync(compressedPath)) {
      fs.unlinkSync(compressedPath);
    }
    
    this.backups.delete(backupId);
    this.saveBackupHistory();
    
    console.log(`[BackupManager] 删除备份: ${backupId}`);
  }

  // 验证备份完整性
  async verifyBackup(backupId) {
    const backup = this.backups.get(backupId);
    if (!backup) {
      throw new Error(`备份 ${backupId} 不存在`);
    }

    const backupPath = path.join(this.backupDirectory, backupId);
    if (!fs.existsSync(backupPath)) {
      throw new Error(`备份文件 ${backupPath} 不存在`);
    }

    let filesCount = 0;
    let totalSize = 0;

    // 检查所有目录是否存在
    for (const dirName of backup.directories) {
      const sourceDir = path.join(backupPath, dirName);
      
      if (!fs.existsSync(sourceDir)) {
        throw new Error(`备份中缺少目录 ${dirName}`);
      }

      const { files, size } = await this.countFiles(sourceDir);
      filesCount += files;
      totalSize += size;
    }

    // 验证文件数量和大小是否与备份记录一致
    if (backup.filesCount !== filesCount) {
      throw new Error(`备份文件数量不匹配: 记录 ${backup.filesCount}, 实际 ${filesCount}`);
    }

    // 大小可能因压缩而略有不同，这里只做大致验证
    const sizeDifference = Math.abs(backup.size - totalSize);
    if (sizeDifference > backup.size * 0.05) { // 允许5%的误差
      throw new Error(`备份大小不匹配: 记录 ${backup.size}, 实际 ${totalSize}`);
    }

    return {
      valid: true,
      backupId,
      filesCount,
      size: totalSize,
      message: '备份完整性验证通过'
    };
  }

  // 统计文件数量和大小
  async countFiles(dir) {
    let filesCount = 0;
    let totalSize = 0;

    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const stats = fs.statSync(itemPath);
      
      if (stats.isDirectory()) {
        const result = await this.countFiles(itemPath);
        filesCount += result.files;
        totalSize += result.size;
      } else {
        filesCount++;
        totalSize += stats.size;
      }
    }

    return { files: filesCount, size: totalSize };
  }

  // 加载备份历史
  loadBackupHistory() {
    const historyFile = path.join(this.backupDirectory, 'backup-history.json');
    if (fs.existsSync(historyFile)) {
      try {
        const history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
        history.forEach(backup => {
          this.backups.set(backup.id, backup);
        });
      } catch (error) {
        console.error('加载备份历史失败:', error);
      }
    }
  }

  // 保存备份历史
  saveBackupHistory() {
    const historyFile = path.join(this.backupDirectory, 'backup-history.json');
    const history = Array.from(this.backups.values());
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf8');
  }

  // 获取备份统计信息
  getBackupStatistics() {
    const backups = Array.from(this.backups.values());
    const completedBackups = backups.filter(b => b.status === BACKUP_STATUS.COMPLETED);
    const failedBackups = backups.filter(b => b.status === BACKUP_STATUS.FAILED);
    
    const stats = {
      totalBackups: backups.length,
      completedBackups: completedBackups.length,
      failedBackups: failedBackups.length,
      successRate: completedBackups.length > 0 ? 
        Math.round((completedBackups.length / backups.length) * 100) : 0,
      lastBackup: this.getLastBackup(),
      backupTypes: {
        full: backups.filter(b => b.type === BACKUP_TYPES.FULL).length,
        incremental: backups.filter(b => b.type === BACKUP_TYPES.INCREMENTAL).length,
        differential: backups.filter(b => b.type === BACKUP_TYPES.DIFFERENTIAL).length
      }
    };
    
    return stats;
  }
}

export default BackupManager;
export { BACKUP_TYPES, BACKUP_STATUS };
