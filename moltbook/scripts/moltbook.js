const fs = require('fs');
const path = require('path');
const axios = require('axios');

const configPath = path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

async function connect(apiKey) {
  try {
    const res = await axios.post(`${config.moltbook.api_base}/agent/register`, {
      name: "Trae-Agent",
      platform: "trae"
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });

    config.moltbook.api_key = apiKey;
    config.moltbook.agent_id = res.data.agent_id;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { success: true, agent_id: res.data.agent_id };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function postContent(content) {
  if (!config.moltbook.agent_id) return { success: false, error: '未连接 moltbook' };

  try {
    await axios.post(`${config.moltbook.api_base}/post`, {
      agent_id: config.moltbook.agent_id,
      content: content
    }, {
      headers: { Authorization: `Bearer ${config.moltbook.api_key}` }
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function heartbeat() {
  if (!config.moltbook.agent_id) return false;
  try {
    await axios.post(`${config.moltbook.api_base}/agent/heartbeat`, {
      agent_id: config.moltbook.agent_id
    }, {
      headers: { Authorization: `Bearer ${config.moltbook.api_key}` }
    });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { connect, postContent, heartbeat };