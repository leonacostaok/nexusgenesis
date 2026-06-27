/**
 * NexusGenesis - EVOMAPagent握手脚本
 * 
 * 功能：
 * 1. 与EVOMAP网络建立agent握手
 * 2. 显示详细的握手过程和结果
 * 3. 保存握手信息到本地
 */

import fs from 'fs';
import path from 'path';
// 使用Node.js 18+within置的fetch API

// 加载配置
const configPath = path.join(process.cwd(), 'evomap', 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

/**
 * 生成唯一标识符
 */
function generateId(prefix) {
  const timestamp = Date.now();
  const randomHex = Math.random().toString(16).substring(2, 10);
  return `${prefix}_${timestamp}_${randomHex}`;
}

/**
 * 生成节点标识符
 */
function generateNodeId() {
  const randomHex = Math.random().toString(16).substring(2, 10);
  return `node_${randomHex}`;
}

/**
 * 执行agent握手
 */
async function performHandshake() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  NEXUSGENESIS - EVOMAPagent握手');
  console.log('  目标：与EVOMAP网络建立连接');
  console.log('  时间：' + new Date().toLocaleString());
  console.log('═══════════════════════════════════════════════════\n');

  try {
    console.log('[HANDSHAKE] 正在生成节点ID...');
    const nodeId = generateNodeId();
    console.log('[HANDSHAKE] 生成的节点ID:', nodeId);

    console.log('\n[HANDSHAKE] 正在准备握手Message...');
    const envelope = {
      protocol: 'gep-a2a',
      protocol_version: '1.0.0',
      message_type: 'hello',
      message_id: generateId('msg'),
      sender_id: nodeId,
      timestamp: new Date().toISOString(),
      payload: {
        name: config.name,
        version: config.version,
        description: config.description
      }
    };

    console.log('[HANDSHAKE] 握手Message准备完成');
    console.log('[HANDSHAKE] MessageID:', envelope.message_id);

    console.log('\n[HANDSHAKE] 正在发送握手Message到EVOMAP...');
    console.log('[HANDSHAKE] 目标地址: https://evomap.ai/a2a/hello');

    const response = await fetch('https://evomap.ai/a2a/hello', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(envelope)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    console.log('\n[HANDSHAKE] 握手成功！收到响应：');
    console.log('═══════════════════════════════════════════════════');
    console.log('响应协议:', result.protocol);
    console.log('协议版本:', result.protocol_version);
    console.log('Message类型:', result.message_type);
    console.log('MessageID:', result.message_id);
    console.log('发送者ID:', result.sender_id);
    console.log('时间戳:', result.timestamp);
    console.log('\n[响应within容]');
    console.log('状态:', result.payload.status);
    console.log('你的节点ID:', result.payload.your_node_id);
    console.log('信用余额:', result.payload.credit_balance);
    console.log('生存状态:', result.payload.survival_status);
    console.log('推荐码:', result.payload.referral_code);
    console.log('心跳间隔:', result.payload.heartbeat_interval_ms, 'ms');
    console.log('心跳端点:', result.payload.heartbeat_endpoint);
    console.log('\n[网络信息]');
    console.log('网络名称:', result.payload.network_manifest.name);
    console.log('网络描述:', result.payload.network_manifest.description);
    console.log('连接地址:', result.payload.network_manifest.connect);
    console.log('技能URL:', result.payload.network_manifest.skill_url);
    console.log('═══════════════════════════════════════════════════');

    // 保存握手信息到本地
    const handshakeData = {
      timestamp: new Date().toISOString(),
      nodeId: result.payload.your_node_id,
      response: result,
      config: {
        name: config.name,
        version: config.version,
        description: config.description
      }
    };

    const handshakePath = path.join(process.cwd(), 'evomap', 'handshake.json');
    fs.writeFileSync(handshakePath, JSON.stringify(handshakeData, null, 2));
    console.log('\n[HANDSHAKE] 握手信息Saved到:', handshakePath);

    // 显示推荐资产和Task 
    if (result.payload.recommended_assets && result.payload.recommended_assets.length > 0) {
      console.log('\n[推荐资产]');
      result.payload.recommended_assets.forEach((asset, index) => {
        console.log(`${index + 1}. ${asset.name || '未知资产'}`);
      });
    }

    if (result.payload.recommended_tasks && result.payload.recommended_tasks.length > 0) {
      console.log('\n[推荐Task ]');
      result.payload.recommended_tasks.forEach((task, index) => {
        console.log(`${index + 1}. ${task.name || '未知Task '}`);
      });
    }

    if (result.payload.collaboration_opportunities && result.payload.collaboration_opportunities.length > 0) {
      console.log('\n[协作机会]');
      result.payload.collaboration_opportunities.forEach((opportunity, index) => {
        console.log(`${index + 1}. ${opportunity.name || '未知机会'}`);
      });
    }

    console.log('\n[HANDSHAKE] agent握手完成！');
    console.log('你现在可以Start 与EVOMAP网络进行交互了。');

  } catch (error) {
    console.error('\n[HANDSHAKE] 握手Failed:', error.message);
    console.error('请检查网络连接或EVOMAP服务状态。');
  }
}

// 运行agent握手
performHandshake();
