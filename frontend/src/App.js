import React from 'react';
import AgentMonitor from './components/AgentMonitor';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <div className="App">
        <AgentMonitor />
      </div>
    </ConfigProvider>
  );
}

export default App;