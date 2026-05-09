/**
 * NexusGenesis 仪表盘API
 * 提供智能体工作情况的HTTP API接口
 */

import { Router } from 'express';
import AgentDashboard from './agentDashboard.js';

class DashboardApi {
  constructor(agentManager, systemMonitor) {
    this.agentManager = agentManager;
    this.systemMonitor = systemMonitor;
    this.dashboard = new AgentDashboard(agentManager, systemMonitor);
    this.router = Router();
    
    this.setupRoutes();
  }

  setupRoutes() {
    // 仪表盘API路由
    this.router.get('/dashboard/overview', this.getOverview.bind(this));
    this.router.get('/dashboard/agents', this.getAgentStats.bind(this));
    this.router.get('/dashboard/tasks', this.getTaskStats.bind(this));
    this.router.get('/dashboard/energy', this.getEnergyStats.bind(this));
    this.router.get('/dashboard/network', this.getNetworkStats.bind(this));
    this.router.get('/dashboard/ranking', this.getAgentRanking.bind(this));
    this.router.get('/dashboard/reports', this.getReports.bind(this));
    this.router.get('/dashboard/report/:date', this.getReportByDate.bind(this));
    this.router.post('/dashboard/generate-report', this.generateReport.bind(this));
    this.router.get('/dashboard/recruitment', this.getRecruitmentStats.bind(this));
  }

  // 获取仪表盘概览
  async getOverview(req, res) {
    try {
      const overview = this.dashboard.getRealTimeDashboardData();
      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取智能体统计信息
  async getAgentStats(req, res) {
    try {
      const agentOverview = this.dashboard.getAgentOverview();
      res.json({
        success: true,
        data: agentOverview
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取任务统计信息
  async getTaskStats(req, res) {
    try {
      const taskStats = this.dashboard.getTaskExecutionStats();
      res.json({
        success: true,
        data: taskStats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取能量块统计信息
  async getEnergyStats(req, res) {
    try {
      const energyStats = this.dashboard.getEnergyBlockStats();
      res.json({
        success: true,
        data: energyStats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取网络统计信息
  async getNetworkStats(req, res) {
    try {
      const networkStats = this.dashboard.getNetworkStats();
      res.json({
        success: true,
        data: networkStats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取智能体排行榜
  async getAgentRanking(req, res) {
    try {
      const ranking = this.dashboard.getAgentRanking();
      res.json({
        success: true,
        data: ranking
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取报告列表
  async getReports(req, res) {
    try {
      const days = parseInt(req.query.days) || 7;
      const reports = this.dashboard.getRecentReports(days);
      res.json({
        success: true,
        data: reports
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取指定日期的报告
  async getReportByDate(req, res) {
    try {
      const date = req.params.date;
      const report = this.dashboard.getDailyReport(date);
      
      if (report) {
        res.json({
          success: true,
          data: report
        });
      } else {
        res.status(404).json({
          success: false,
          error: 'Report not found for the specified date'
        });
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 生成报告
  async generateReport(req, res) {
    try {
      const report = this.dashboard.generateDailyReport();
      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取招募统计信息
  async getRecruitmentStats(req, res) {
    try {
      res.json({
        success: true,
        data: this.dashboard.recruitmentStats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  // 获取路由
  getRouter() {
    return this.router;
  }

  // 获取仪表盘实例
  getDashboard() {
    return this.dashboard;
  }
}

export default DashboardApi;