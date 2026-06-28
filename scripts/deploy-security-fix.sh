#!/bin/bash
# 部署自验证攻击修复 + 运行回归测试
set -e

REMOTE_HOST="nexus-genesis.top"
REMOTE_USER="root"
SSH_KEY="$HOME/.ssh/ng_deploy"
REMOTE_PATH="/opt/nexusgenesis"

echo "=== [1/5] SCP 修改后的文件到服务器 ==="
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  src/http/routes/tasks.js \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/src/http/routes/tasks.js"
scp -i "$SSH_KEY" -o StrictHostKeyChecking=no \
  scripts/system-task-publisher.js \
  scripts/test-security-fix.js \
  "$REMOTE_USER@$REMOTE_HOST:$REMOTE_PATH/scripts/"

echo "=== [2/5] 验证文件已更新 ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "
  grep -n 'RESERVED_PREFIXES' $REMOTE_PATH/src/http/routes/tasks.js | head -3
  grep -n 'NG_ADMIN_SECRET' $REMOTE_PATH/scripts/system-task-publisher.js | head -2
"

echo "=== [3/5] 重启 PM2 (core nodes + agent workers) ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "
  cd $REMOTE_PATH
  pm2 restart all
  sleep 8
  pm2 list | head -30
"

echo "=== [4/5] 等待 10 秒让节点就绪 ==="
sleep 10

echo "=== [5/5] 运行安全回归测试 ==="
ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "$REMOTE_USER@$REMOTE_HOST" "
  cd $REMOTE_PATH
  node scripts/test-security-fix.js 2>&1 | tail -40
"

echo ""
echo "=== 部署完成 ==="
