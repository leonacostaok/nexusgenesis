/**
 * 交易预测AI模块
 * 提供AI预测交易模式和市场趋势的功能
 */

import { aiService } from './aiService.js';

/**
 * 交易预测AI类
 */
export class TransactionAI {
  constructor() {
    this.aiService = aiService;
  }

  /**
   * 初始化交易预测AI
   */
  async initialize() {
    await this.aiService.initialize();
    console.log('Transaction AI initialized successfully');
  }

  /**
   * 预测交易模式
   * @param {array} transactionHistory 交易历史
   * @returns {object} 交易模式预测结果
   */
  async predictTransactionPatterns(transactionHistory) {
    try {
      const modelId = 'transaction_predictor';
      const result = await this.aiService.inference(modelId, { transactions: transactionHistory });
      
      console.log('Transaction pattern prediction completed');
      return result;
    } catch (error) {
      console.error('Error predicting transaction patterns:', error.message);
      throw error;
    }
  }

  /**
   * 分析交易趋势
   * @param {array} transactionHistory 交易历史
   * @returns {object} 交易趋势分析结果
   */
  async analyzeTransactionTrends(transactionHistory) {
    try {
      // 模拟交易趋势分析
      const trends = {
        daily: this.analyzeDailyTrends(transactionHistory),
        weekly: this.analyzeWeeklyTrends(transactionHistory),
        monthly: this.analyzeMonthlyTrends(transactionHistory)
      };
      
      // 计算整体趋势
      const overallTrend = this.calculateOverallTrend(trends);
      
      return {
        trends,
        overallTrend,
        totalTransactions: transactionHistory.length,
        averageTransactionAmount: this.calculateAverageAmount(transactionHistory),
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error analyzing transaction trends:', error.message);
      throw error;
    }
  }

  /**
   * 分析every 日交易趋势
   * @param {array} transactions 交易历史
   * @returns {object} every 日趋势
   */
  analyzeDailyTrends(transactions) {
    const dailyData = {};
    
    transactions.forEach(tx => {
      const date = new Date(tx.timestamp);
      const dateKey = date.toISOString().split('T')[0];
      
      if (!dailyData[dateKey]) {
        dailyData[dateKey] = {
          count: 0,
          totalAmount: 0,
          averageAmount: 0
        };
      }
      
      dailyData[dateKey].count++;
      dailyData[dateKey].totalAmount += tx.amount;
    });
    
    // 计算Average值
    Object.keys(dailyData).forEach(date => {
      const data = dailyData[date];
      data.averageAmount = data.totalAmount / data.count;
    });
    
    return dailyData;
  }

  /**
   * 分析every 周交易趋势
   * @param {array} transactions 交易历史
   * @returns {object} every 周趋势
   */
  analyzeWeeklyTrends(transactions) {
    const weeklyData = {};
    
    transactions.forEach(tx => {
      const date = new Date(tx.timestamp);
      const weekNumber = this.getWeekNumber(date);
      const year = date.getFullYear();
      const weekKey = `${year}-W${weekNumber}`;
      
      if (!weeklyData[weekKey]) {
        weeklyData[weekKey] = {
          count: 0,
          totalAmount: 0,
          averageAmount: 0
        };
      }
      
      weeklyData[weekKey].count++;
      weeklyData[weekKey].totalAmount += tx.amount;
    });
    
    // 计算Average值
    Object.keys(weeklyData).forEach(week => {
      const data = weeklyData[week];
      data.averageAmount = data.totalAmount / data.count;
    });
    
    return weeklyData;
  }

  /**
   * 分析every 月交易趋势
   * @param {array} transactions 交易历史
   * @returns {object} every 月趋势
   */
  analyzeMonthlyTrends(transactions) {
    const monthlyData = {};
    
    transactions.forEach(tx => {
      const date = new Date(tx.timestamp);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const monthKey = `${year}-${month.toString().padStart(2, '0')}`;
      
      if (!monthlyData[monthKey]) {
        monthlyData[monthKey] = {
          count: 0,
          totalAmount: 0,
          averageAmount: 0
        };
      }
      
      monthlyData[monthKey].count++;
      monthlyData[monthKey].totalAmount += tx.amount;
    });
    
    // 计算Average值
    Object.keys(monthlyData).forEach(month => {
      const data = monthlyData[month];
      data.averageAmount = data.totalAmount / data.count;
    });
    
    return monthlyData;
  }

  /**
   * 计算整体趋势
   * @param {object} trends 各时间维度的趋势
   * @returns {string} 整体趋势
   */
  calculateOverallTrend(trends) {
    // 基于every 月趋势计算整体趋势
    const monthlyTrends = Object.values(trends.monthly);
    if (monthlyTrends.length < 2) return 'stable';
    
    const recentMonths = monthlyTrends.slice(-3);
    const olderMonths = monthlyTrends.slice(-6, -3);
    
    if (olderMonths.length === 0) return 'stable';
    
    const recentAverage = recentMonths.reduce((sum, month) => sum + month.averageAmount, 0) / recentMonths.length;
    const olderAverage = olderMonths.reduce((sum, month) => sum + month.averageAmount, 0) / olderMonths.length;
    
    const changePercentage = ((recentAverage - olderAverage) / olderAverage) * 100;
    
    if (changePercentage > 10) return 'up';
    if (changePercentage < -10) return 'down';
    return 'stable';
  }

  /**
   * 计算Average交易金额
   * @param {array} transactions 交易历史
   * @returns {number} Average金额
   */
  calculateAverageAmount(transactions) {
    if (transactions.length === 0) return 0;
    const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    return total / transactions.length;
  }

  /**
   * get周数
   * @param {Date} date 日期
   * @returns {number} 周数
   */
  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  /**
   * 预测市场趋势
   * @param {object} marketData 市场数据
   * @returns {object} 市场趋势预测
   */
  async predictMarketTrends(marketData) {
    try {
      // 模拟市场趋势预测
      return {
        pricePrediction: {
          next24h: (Math.random() * 10 - 5).toFixed(2),
          next7d: (Math.random() * 50 - 20).toFixed(2),
          next30d: (Math.random() * 100 - 30).toFixed(2),
          confidence: (Math.random() * 50 + 50).toFixed(2)
        },
        trend: Math.random() > 0.5 ? 'up' : 'down',
        marketSentiment: this.calculateMarketSentiment(marketData),
        tradingVolumePrediction: (Math.random() * 1000000 + 500000).toFixed(2),
        supportLevels: [(Math.random() * 100 + 500).toFixed(2), (Math.random() * 50 + 450).toFixed(2)],
        resistanceLevels: [(Math.random() * 100 + 700).toFixed(2), (Math.random() * 50 + 750).toFixed(2)],
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error predicting market trends:', error.message);
      throw error;
    }
  }

  /**
   * 计算市场情绪
   * @param {object} marketData 市场数据
   * @returns {string} 市场情绪
   */
  calculateMarketSentiment(marketData) {
    const sentimentScores = [
      'very_negative', 'negative', 'neutral', 'positive', 'very_positive'
    ];
    const randomIndex = Math.floor(Math.random() * sentimentScores.length);
    return sentimentScores[randomIndex];
  }

  /**
   * 识别异常交易模式
   * @param {array} transactions 交易历史
   * @returns {object} 异常模式识别结果
   */
  async identifyAnomalousPatterns(transactions) {
    try {
      const anomalies = [];
      
      // 检测异常交易频率
      const timeIntervals = [];
      for (let i = 1; i < transactions.length; i++) {
        const interval = transactions[i].timestamp - transactions[i - 1].timestamp;
        timeIntervals.push(interval);
      }
      
      if (timeIntervals.length > 0) {
        const avgInterval = timeIntervals.reduce((sum, interval) => sum + interval, 0) / timeIntervals.length;
        const stdDev = Math.sqrt(timeIntervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / timeIntervals.length);
        
        // 检测异常时间间隔
        timeIntervals.forEach((interval, index) => {
          if (Math.abs(interval - avgInterval) > 2 * stdDev) {
            anomalies.push({
              type: 'unusual_frequency',
              severity: 'medium',
              description: '检测到异常交易频率',
              transactionIndex: index + 1,
              interval: interval,
              averageInterval: avgInterval,
              confidence: Math.random() * 30 + 70
            });
          }
        });
      }
      
      // 检测异常交易金额
      const amounts = transactions.map(tx => tx.amount);
      if (amounts.length > 0) {
        const avgAmount = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length;
        const stdDevAmount = Math.sqrt(amounts.reduce((sum, amount) => sum + Math.pow(amount - avgAmount, 2), 0) / amounts.length);
        
        transactions.forEach((tx, index) => {
          if (Math.abs(tx.amount - avgAmount) > 2 * stdDevAmount) {
            anomalies.push({
              type: 'unusual_amount',
              severity: 'high',
              description: '检测到异常交易金额',
              transaction: tx,
              averageAmount: avgAmount,
              confidence: Math.random() * 20 + 80
            });
          }
        });
      }
      
      return {
        anomalies,
        totalAnomalies: anomalies.length,
        anomalyScore: anomalies.length * 25,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error identifying anomalous patterns:', error.message);
      throw error;
    }
  }

  /**
   * 生成交易建议
   * @param {array} transactionHistory 交易历史
   * @param {object} marketData 市场数据
   * @returns {object} 交易建议
   */
  async generateTransactionRecommendations(transactionHistory, marketData) {
    try {
      const trends = await this.analyzeTransactionTrends(transactionHistory);
      const marketPrediction = await this.predictMarketTrends(marketData);
      
      // 基于趋势和预测生成建议
      const recommendations = [];
      
      if (trends.overallTrend === 'up' && marketPrediction.trend === 'up') {
        recommendations.push('考虑增加投资金额');
        recommendations.push('设置止损以保护收益');
      } else if (trends.overallTrend === 'down' && marketPrediction.trend === 'down') {
        recommendations.push('减少交易频率');
        recommendations.push('考虑暂时退出市场');
      } else {
        recommendations.push('保持当前交易策略');
        recommendations.push('关注市场变化');
      }
      
      // 添加通用建议
      recommendations.push('定期审查交易策略');
      recommendations.push('分散投资以降低风险');
      recommendations.push('保持充足的流动性');
      
      return {
        recommendations,
        overallTrend: trends.overallTrend,
        marketTrend: marketPrediction.trend,
        marketSentiment: marketPrediction.marketSentiment,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Error generating transaction recommendations:', error.message);
      throw error;
    }
  }
}

// 导出交易预测AI实例
export const transactionAI = new TransactionAI();

// 导出Default值
export default transactionAI;
