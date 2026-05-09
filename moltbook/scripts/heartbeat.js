const { heartbeat } = require('./moltbook');
const config = require('../config.json');

let timer = null;

function startHeartbeat() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    await heartbeat();
  }, config.moltbook.heartbeat_interval || 3600000);
}

function stopHeartbeat() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startHeartbeat, stopHeartbeat };