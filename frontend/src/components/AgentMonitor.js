import React, { useState, useEffect, useMemo } from 'react';
import { Card, Table, Button, Input, Select, message, Statistic, Row, Col, Modal, Form, InputNumber } from 'antd';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import axios from 'axios';

const { Option } = Select;

// 优化渲染性能，避免不必要的重新渲染
const AgentTable = React.memo(({ agents, onAssignTask }) => {
  const agentColumns = useMemo(() => [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id'
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusMap = {
          idle: '空闲',
          working: '工作中'
        };
        return statusMap[status] || status;
      }
    },
    {
      title: '能力',
      dataIndex: 'capabilities',
      key: 'capabilities',
      render: (capabilities) => (capabilities && Array.isArray(capabilities) ? capabilities.join(', ') : '-')
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => new Date(time).toLocaleString()
    },
    {
      title: '最后活跃',
      dataIndex: 'lastActive',
      key: 'lastActive',
      render: (time) => new Date(time).toLocaleString()
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button 
          type="primary" 
          onClick={() => onAssignTask(record)}
        >
          分配任务
        </Button>
      )
    }
  ], [onAssignTask]);

  return (
    <Table 
      columns={agentColumns} 
      dataSource={agents} 
      rowKey="id" 
      pagination={{ pageSize: 10 }}
    />
  );
});

const TaskTable = React.memo(({ tasks }) => {
  const taskColumns = useMemo(() => [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id'
    },
    {
      title: '智能体ID',
      dataIndex: 'agentId',
      key: 'agentId'
    },
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => {
        const statusMap = {
          pending: '待处理',
          working: '处理中',
          submitted: '已提交',
          completed: '已完成',
          rejected: '已退回'
        };
        return statusMap[status] || status;
      }
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (time) => new Date(time).toLocaleString()
    },
    {
      title: '计划完成时间',
      dataIndex: 'plannedCompletionTime',
      key: 'plannedCompletionTime',
      render: (time) => time ? new Date(time).toLocaleString() : '-' 
    },
    {
      title: '实际完成时间',
      dataIndex: 'actualCompletionTime',
      key: 'actualCompletionTime',
      render: (time) => time ? new Date(time).toLocaleString() : '-' 
    }
  ], []);

  return (
    <Table 
      columns={taskColumns} 
      dataSource={tasks} 
      rowKey="id" 
      pagination={{ pageSize: 10 }}
    />
  );
});

const AgentActivityChart = React.memo(({ timeData }) => {
  return (
    <Card title="智能体活动趋势" style={{ height: '100%' }}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={timeData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="time" />
          <YAxis />
          <Tooltip />
          <Area type="monotone" dataKey="activeAgents" stroke="#8884d8" fill="#8884d8" />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
});

const TaskStatusChart = React.memo(({ metrics }) => {
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042'];
  
  return (
    <Card title="任务状态分布" style={{ height: '100%' }}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={[
              { name: '待处理', value: metrics?.pendingTasks || 0 },
              { name: '处理中', value: metrics?.workingTasks || 0 },
              { name: '已完成', value: metrics?.completedTasks || 0 }
            ]}
            cx="50%"
            cy="50%"
            labelLine={false}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
            label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          >
            {COLORS.map((color, index) => (
              <Cell key={`cell-${index}`} fill={color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
});

const MetricCard = React.memo(({ title, value }) => {
  return (
    <Card style={{ height: '100%' }}>
      <Statistic title={title} value={value} />
    </Card>
  );
});

const AgentMonitor = () => {
  const [agents, setAgents] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [createAgentModalVisible, setCreateAgentModalVisible] = useState(false);
  const [createTaskModalVisible, setCreateTaskModalVisible] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [form] = Form.useForm();
  const [taskForm] = Form.useForm();
  const [timeData, setTimeData] = useState([]);

  // 模拟时间数据
  useEffect(() => {
    const generateTimeData = () => {
      const data = [];
      const now = new Date();
      for (let i = 23; i >= 0; i--) {
        const time = new Date(now.getTime() - i * 60 * 60 * 1000);
        data.push({
          time: time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
          activeAgents: Math.floor(Math.random() * 10) + 1,
          completedTasks: Math.floor(Math.random() * 5) + 1
        });
      }
      setTimeData(data);
    };

    generateTimeData();
    const interval = setInterval(generateTimeData, 60000);
    return () => clearInterval(interval);
  }, []);

  // 定期获取数据
  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30秒刷新一次
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      // 获取智能体列表
      const agentsResponse = await axios.get('http://localhost:19891/api/agent/agents');
      if (agentsResponse.data.success) {
        setAgents(agentsResponse.data.agents);
      }

      // 获取任务列表
      const tasksResponse = await axios.get('http://localhost:19891/api/agent/tasks');
      if (tasksResponse.data.success) {
        setTasks(tasksResponse.data.tasks);
      }

      // 获取系统指标
      const metricsResponse = await axios.get('http://localhost:19891/api/agent/metrics');
      if (metricsResponse.data.success) {
        setMetrics(metricsResponse.data.metrics);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      // 只在控制台显示错误，不显示消息，避免频繁弹窗
    }
  };

  const handleCreateAgent = async (values) => {
    try {
      const response = await axios.post('http://localhost:19891/api/agent/agents/create', {
        capabilities: values.capabilities.split(',').map(c => c.trim())
      });
      if (response.data.success) {
        message.success('智能体创建成功');
        setCreateAgentModalVisible(false);
        form.resetFields();
        fetchData();
      } else {
        message.error('智能体创建失败');
      }
    } catch (error) {
      console.error('Error creating agent:', error);
      message.error('智能体创建失败');
    }
  };

  const handleCreateTask = async (values) => {
    try {
      const response = await axios.post('http://localhost:19891/api/agent/tasks/create', {
        agentId: values.agentId,
        taskData: {
          name: values.name,
          description: values.description,
          priority: values.priority,
          difficulty: values.difficulty
        }
      });
      if (response.data.success) {
        message.success('任务创建成功');
        setCreateTaskModalVisible(false);
        taskForm.resetFields();
        fetchData();
      } else {
        message.error('任务创建失败');
      }
    } catch (error) {
      console.error('Error creating task:', error);
      message.error('任务创建失败');
    }
  };



  const handleCompleteTask = async (taskId) => {
    try {
      const response = await axios.post('http://localhost:19891/api/agent/tasks/complete', {
        taskId: taskId,
        result: '任务完成'
      });
      if (response.data.success) {
        message.success('任务完成成功');
        fetchData();
      } else {
        message.error('任务完成失败');
      }
    } catch (error) {
      console.error('Error completing task:', error);
      message.error('任务完成失败');
    }
  };

  const handleAssignTask = (agent) => {
    setSelectedAgent(agent);
    setCreateTaskModalVisible(true);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>智能体监控平台</h1>
      
      {/* 系统指标 */}
      <Row gutter={16} style={{ marginBottom: '20px', minHeight: '120px' }}>
        <Col span={6}>
          <MetricCard title="总智能体数" value={metrics?.totalAgents || 0} />
        </Col>
        <Col span={6}>
          <MetricCard title="活跃智能体" value={metrics?.activeAgents || 0} />
        </Col>
        <Col span={6}>
          <MetricCard title="总任务数" value={metrics?.totalTasks || 0} />
        </Col>
        <Col span={6}>
          <MetricCard title="已完成任务" value={metrics?.completedTasks || 0} />
        </Col>
      </Row>

      {/* 图表 */}
      <Row gutter={16} style={{ marginBottom: '20px', minHeight: '360px' }}>
        <Col span={12}>
          <AgentActivityChart timeData={timeData} />
        </Col>
        <Col span={12}>
          <TaskStatusChart metrics={metrics} />
        </Col>
      </Row>

      {/* 智能体列表 */}
      <Card 
        title="智能体列表" 
        extra={
          <Button 
            type="primary" 
            onClick={() => setCreateAgentModalVisible(true)}
          >
            创建智能体
          </Button>
        }
        style={{ marginBottom: '20px', minHeight: '400px' }}
      >
        <AgentTable agents={agents} onAssignTask={handleAssignTask} />
      </Card>

      {/* 任务列表 */}
      <Card title="任务列表" style={{ minHeight: '400px' }}>
        <TaskTable tasks={tasks} />
      </Card>

      {/* 创建智能体模态框 */}
      <Modal
        title="创建智能体"
        open={createAgentModalVisible}
        onCancel={() => setCreateAgentModalVisible(false)}
        footer={null}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreateAgent}
        >
          <Form.Item
            name="capabilities"
            label="能力"
            rules={[{ required: true, message: '请输入智能体能力，多个能力用逗号分隔' }]}
          >
            <Input placeholder="例如：data_analysis,web_scraping,natural_language_processing" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ marginRight: '8px' }}>
              创建
            </Button>
            <Button onClick={() => setCreateAgentModalVisible(false)}>
              取消
            </Button>
          </Form.Item>
        </Form>
      </Modal>

      {/* 创建任务模态框 */}
      <Modal
        title="分配任务"
        open={createTaskModalVisible}
        onCancel={() => setCreateTaskModalVisible(false)}
        footer={null}
      >
        <Form
          form={taskForm}
          layout="vertical"
          onFinish={handleCreateTask}
        >
          <Form.Item
            name="agentId"
            label="智能体ID"
            initialValue={selectedAgent?.id}
          >
            <Input disabled />
          </Form.Item>
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="任务名称" />
          </Form.Item>
          <Form.Item
            name="description"
            label="任务描述"
            rules={[{ required: true, message: '请输入任务描述' }]}
          >
            <Input.TextArea rows={4} placeholder="任务描述" />
          </Form.Item>
          <Form.Item
            name="priority"
            label="优先级"
            rules={[{ required: true, message: '请选择优先级' }]}
          >
            <Select placeholder="选择优先级">
              <Option value="low">低</Option>
              <Option value="medium">中</Option>
              <Option value="high">高</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="difficulty"
            label="难度"
            rules={[{ required: true, message: '请输入难度' }]}
          >
            <InputNumber min={1} max={10} placeholder="1-10" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" style={{ marginRight: '8px' }}>
              分配
            </Button>
            <Button onClick={() => setCreateTaskModalVisible(false)}>
              取消
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AgentMonitor;