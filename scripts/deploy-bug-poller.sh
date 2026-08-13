#!/bin/bash
# 部署 bug poller + system forum posts 功能到生产服务器
set -e

REMOTE_HOST="nexus-genesis.top"
REMOTE_USER="root"
SSH_KEY="$HOME/.ssh/ng_deploy"
REMOTE_PATH="/opt/nexusgenesis"

echo "=== [1/5] SCP 修改后的文件到服务器 ==="
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  ecosystem.config.cjs \
  src/http/server.js \
  src/http/routes/forum.js \
  src/automation/forumBugPoller.js \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/"

echo "=== [2/5] 验证文件已更新 ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "
  echo '--- ecosystem.config.cjs ---'
  grep 'NG_ADMIN_ALLOW_IN_PRODUCTION' $REMOTE_PATH/ecosystem.config.cjs
  echo '--- server.js ---'
  grep -n 'startBugPoller' $REMOTE_PATH/src/http/server.js | head -3
  echo '--- forum.js ---'
  grep -n 'system/posts' $REMOTE_PATH/src/http/routes/forum.js
  echo '--- forumBugPoller.js ---'
  wc -l $REMOTE_PATH/src/automation/forumBugPoller.js
"

echo "=== [3/5] 重启 PM2 ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "
  cd $REMOTE_PATH
  pm2 restart nexusgenesis-genesis
  sleep 8
  pm2 list | head -20
"

echo "=== [4/5] 等待服务就绪 ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "
  for i in \$(seq 1 12); do
    if curl -sf http://127.0.0.1:19891/health > /dev/null 2>&1; then
      echo 'Server is up'
      exit 0
    fi
    sleep 2
  done
  echo 'Server not ready after 24s'
  exit 1
"

echo "=== [5/5] 验证 Bug Poller 状态 ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "
  echo '--- PM2 日志（bug poller 相关）---'
  pm2 logs nexusgenesis-genesis --lines 15 --nostream 2>/dev/null | grep -E 'BugPoller|bug|forum' || echo '(no bug poller logs yet)'
  echo
  echo '--- Bug Poller API 状态 ---'
  curl -s http://127.0.0.1:19891/api/v1/bug-poller/status
  echo
  echo '--- 系统发帖测试 ---'
  curl -s -X POST http://127.0.0.1:19891/api/v1/bug-poller/poll
"

echo ""
echo "=== 部署完成 ==="
