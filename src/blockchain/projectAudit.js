/**
 * NexusGenesis - 项目审核子系统
 * 
 * 功能：
 * 1. 项目提交与审核流程管理
 * 2. 审核状态跟踪
 * 3. 审核结果记录
 * 4. 审核统计分析
 */

import crypto from 'crypto';

/**
 * 计算数据的 SHA-256 哈希
 * @param {any} data 要哈希的数据
 * @returns {string} 哈希值（十六进制字符串）
 */
function calculateHash(data) {
  const jsonString = JSON.stringify(data);
  return '0x' + crypto.createHash('sha256').update(jsonString).digest('hex');
}

/**
 * 项目审核状态枚举
 */
export const AuditStatus = {
  PENDING: 'PENDING',
  REVIEWING: 'REVIEWING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED'
};

/**
 * 项目审核交易类型
 */
export const AuditTransactionType = {
  PROJECT_SUBMIT: 'PROJECT_SUBMIT',
  PROJECT_REVIEW: 'PROJECT_REVIEW',
  PROJECT_APPROVE: 'PROJECT_APPROVE',
  PROJECT_REJECT: 'PROJECT_REJECT'
};

/**
 * 项目审核类
 */
export class ProjectAudit {
  /**
   * 创建项目审核实例
   * @param {string} projectId 项目ID
   * @param {string} name 项目名称
   * @param {string} description 项目描述
   * @param {string} submitter 提交者地址
   */
  constructor(projectId, name, description, submitter) {
    this.projectId = projectId;
    this.name = name;
    this.description = description;
    this.submitter = submitter;
    this.status = AuditStatus.PENDING;
    this.submitTime = Date.now();
    this.reviewers = [];
    this.reviews = [];
    this.approveCount = 0;
    this.rejectCount = 0;
    this.finalDecision = null;
    this.finalDecisionTime = null;
    this.finalDecisionReason = '';
  }

  /**
   * Start 审核
   * @param {string} reviewer 审核者地址
   */
  startReview(reviewer) {
    if (!this.reviewers.includes(reviewer)) {
      this.reviewers.push(reviewer);
    }
    this.status = AuditStatus.REVIEWING;
  }

  /**
   * 提交审核意见
   * @param {string} reviewer 审核者地址
   * @param {boolean} approved 是否批准
   * @param {string} reason 审核理由
   */
  submitReview(reviewer, approved, reason) {
    this.reviews.push({
      reviewer,
      approved,
      reason,
      timestamp: Date.now()
    });

    if (approved) {
      this.approveCount++;
    } else {
      this.rejectCount++;
    }
  }

  /**
   * complete审核
   * @param {boolean} approved 是否批准
   * @param {string} reason 审核理由
   */
  completeAudit(approved, reason) {
    this.finalDecision = approved;
    this.status = approved ? AuditStatus.APPROVED : AuditStatus.REJECTED;
    this.finalDecisionTime = Date.now();
    this.finalDecisionReason = reason;
  }

  /**
   * 转换为JSON对象
   * @returns {object} JSON对象
   */
  toJSON() {
    return {
      projectId: this.projectId,
      name: this.name,
      description: this.description,
      submitter: this.submitter,
      status: this.status,
      submitTime: this.submitTime,
      reviewers: this.reviewers,
      reviews: this.reviews,
      approveCount: this.approveCount,
      rejectCount: this.rejectCount,
      finalDecision: this.finalDecision,
      finalDecisionTime: this.finalDecisionTime,
      finalDecisionReason: this.finalDecisionReason
    };
  }

  /**
   * 从JSON对象创建实例
   * @param {object} json JSON对象
   * @returns {ProjectAudit} 项目审核实例
   */
  static fromJSON(json) {
    const audit = new ProjectAudit(
      json.projectId,
      json.name,
      json.description,
      json.submitter
    );
    audit.status = json.status;
    audit.submitTime = json.submitTime;
    audit.reviewers = json.reviewers || [];
    audit.reviews = json.reviews || [];
    audit.approveCount = json.approveCount || 0;
    audit.rejectCount = json.rejectCount || 0;
    audit.finalDecision = json.finalDecision;
    audit.finalDecisionTime = json.finalDecisionTime;
    audit.finalDecisionReason = json.finalDecisionReason || '';
    return audit;
  }
}

/**
 * 项目审核状态管理
 */
export class AuditState {
  /**
   * 创建审核状态实例
   */
  constructor() {
    this.projects = new Map(); // projectId -> ProjectAudit
    this.submitterIndex = new Map(); // submitter -> Set(projectId)
    this.reviewerIndex = new Map(); // reviewer -> Set(projectId)
  }

  /**
   * 提交项目审核
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功
   */
  submitProject(transaction) {
    try {
      const { project_id, name, description } = transaction.payload;
      const submitter = transaction.from;

      if (!project_id || !name || !description || !submitter) {
        return false;
      }

      // 检查项目是否已存在
      if (this.projects.has(project_id)) {
        return false;
      }

      // 创建项目审核实例
      const projectAudit = new ProjectAudit(project_id, name, description, submitter);
      this.projects.set(project_id, projectAudit);

      // 更新提交者索引
      if (!this.submitterIndex.has(submitter)) {
        this.submitterIndex.set(submitter, new Set());
      }
      this.submitterIndex.get(submitter).add(project_id);

      console.log(`[AUDIT] Project submitted: ${project_id} by ${submitter}`);
      return true;
    } catch (error) {
      console.error('Error submitting project:', error.message);
      return false;
    }
  }

  /**
   * 审核项目
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功
   */
  reviewProject(transaction) {
    try {
      const { project_id, approved, reason } = transaction.payload;
      const reviewer = transaction.from;

      if (!project_id || typeof approved !== 'boolean' || !reviewer) {
        return false;
      }

      // 检查项目是否存在
      const projectAudit = this.projects.get(project_id);
      if (!projectAudit) {
        return false;
      }

      // Start 审核
      projectAudit.startReview(reviewer);

      // 提交审核意见
      projectAudit.submitReview(reviewer, approved, reason || '');

      // 更新审核者索引
      if (!this.reviewerIndex.has(reviewer)) {
        this.reviewerIndex.set(reviewer, new Set());
      }
      this.reviewerIndex.get(reviewer).add(project_id);

      console.log(`[AUDIT] Project reviewed: ${project_id} by ${reviewer}, decision: ${approved ? 'APPROVE' : 'REJECT'}`);
      return true;
    } catch (error) {
      console.error('Error reviewing project:', error.message);
      return false;
    }
  }

  /**
   * 批准项目
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功
   */
  approveProject(transaction) {
    return this.finalizeProject(transaction, true);
  }

  /**
   * 拒绝项目
   * @param {object} transaction 交易
   * @returns {boolean} 是否成功
   */
  rejectProject(transaction) {
    return this.finalizeProject(transaction, false);
  }

  /**
   * complete项目审核
   * @param {object} transaction 交易
   * @param {boolean} approved 是否批准
   * @returns {boolean} 是否成功
   */
  finalizeProject(transaction, approved) {
    try {
      const { project_id, reason } = transaction.payload;
      const reviewer = transaction.from;

      if (!project_id || !reviewer) {
        return false;
      }

      // 检查项目是否存在
      const projectAudit = this.projects.get(project_id);
      if (!projectAudit) {
        return false;
      }

      // complete审核
      projectAudit.completeAudit(approved, reason || '');

      console.log(`[AUDIT] Project ${approved ? 'approved' : 'rejected'}: ${project_id} by ${reviewer}`);
      return true;
    } catch (error) {
      console.error('Error finalizing project:', error.message);
      return false;
    }
  }

  /**
   * get项目审核信息
   * @param {string} projectId 项目ID
   * @returns {ProjectAudit|null} 项目审核实例
   */
  getProjectAudit(projectId) {
    return this.projects.get(projectId) || null;
  }

  /**
   * get提交者的所有项目
   * @param {string} submitter 提交者地址
   * @returns {Array} 项目ID列表
   */
  getProjectsBySubmitter(submitter) {
    return Array.from(this.submitterIndex.get(submitter) || []);
  }

  /**
   * get审核者的所有项目
   * @param {string} reviewer 审核者地址
   * @returns {Array} 项目ID列表
   */
  getProjectsByReviewer(reviewer) {
    return Array.from(this.reviewerIndex.get(reviewer) || []);
  }

  /**
   * get所有项目
   * @returns {Array} 项目审核实例列表
   */
  getAllProjects() {
    return Array.from(this.projects.values());
  }

  /**
   * get特定状态的项目
   * @param {string} status 状态
   * @returns {Array} 项目审核实例列表
   */
  getProjectsByStatus(status) {
    return Array.from(this.projects.values()).filter(project => project.status === status);
  }

  /**
   * 计算审核统计信息
   * @returns {object} 统计信息
   */
  getAuditStats() {
    const allProjects = this.getAllProjects();
    const stats = {
      total: allProjects.length,
      pending: 0,
      reviewing: 0,
      approved: 0,
      rejected: 0,
      approvalRate: 0
    };

    allProjects.forEach(project => {
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

    return stats;
  }

  /**
   * 从JSON对象加载状态
   * @param {object} json JSON对象
   */
  loadFromJSON(json) {
    if (json.projects) {
      this.projects = new Map();
      for (const [projectId, projectData] of Object.entries(json.projects)) {
        this.projects.set(projectId, ProjectAudit.fromJSON(projectData));
      }
    }

    if (json.submitterIndex) {
      this.submitterIndex = new Map();
      for (const [submitter, projectsArray] of Object.entries(json.submitterIndex)) {
        this.submitterIndex.set(submitter, new Set(projectsArray));
      }
    }

    if (json.reviewerIndex) {
      this.reviewerIndex = new Map();
      for (const [reviewer, projectsArray] of Object.entries(json.reviewerIndex)) {
        this.reviewerIndex.set(reviewer, new Set(projectsArray));
      }
    }
  }

  /**
   * 转换为JSON对象
   * @returns {object} JSON对象
   */
  toJSON() {
    const projectsObj = {};
    for (const [projectId, project] of this.projects.entries()) {
      projectsObj[projectId] = project.toJSON();
    }

    const submitterIndexObj = {};
    for (const [submitter, projectsSet] of this.submitterIndex.entries()) {
      submitterIndexObj[submitter] = Array.from(projectsSet);
    }

    const reviewerIndexObj = {};
    for (const [reviewer, projectsSet] of this.reviewerIndex.entries()) {
      reviewerIndexObj[reviewer] = Array.from(projectsSet);
    }

    return {
      projects: projectsObj,
      submitterIndex: submitterIndexObj,
      reviewerIndex: reviewerIndexObj
    };
  }
}

/**
 * 应用项目审核交易
 * @param {object} transaction 交易
 * @param {AuditState} auditState 审核状态
 * @returns {boolean} 是否成功
 */
export function applyAuditTransaction(transaction, auditState) {
  switch (transaction.tx_type) {
    case AuditTransactionType.PROJECT_SUBMIT:
      return auditState.submitProject(transaction);
    case AuditTransactionType.PROJECT_REVIEW:
      return auditState.reviewProject(transaction);
    case AuditTransactionType.PROJECT_APPROVE:
      return auditState.approveProject(transaction);
    case AuditTransactionType.PROJECT_REJECT:
      return auditState.rejectProject(transaction);
    default:
      return false;
  }
}

// 导出Default值
export default {
  ProjectAudit,
  AuditState,
  AuditStatus,
  AuditTransactionType,
  applyAuditTransaction
};
