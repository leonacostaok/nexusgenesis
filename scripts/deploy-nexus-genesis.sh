#!/bin/bash
# ================================================
#  NexusGenesis 一键部署脚本
#  用法: bash deploy-nexus-genesis.sh
# ================================================
set -e

SERVER_IP="98.142.241.236"
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   NexusGenesis 点火部署                   ║${NC}"
echo -e "${BLUE}║   一台服务器，一个命令，点燃 Agent 领土    ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""

# ---- 1. 系统更新 ----
echo -e "${GREEN}[1/6]${NC} 更新系统..."
apt-get update -qq && apt-get upgrade -y -qq
echo "  ✅ 完成"

# ---- 2. 安装 Node.js 18+ ----
echo -e "${GREEN}[2/6]${NC} 安装 Node.js..."
if ! command -v node &> /dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
fi
echo "  Node.js $(node -v) | npm $(npm -v)"

# ---- 3. 安装 Apache + git ----
echo -e "${GREEN}[3/6]${NC} 安装 Apache + git..."
apt-get install -y -qq apache2 git

a2enmod proxy proxy_http proxy_wstunnel rewrite > /dev/null 2>&1
echo "  ✅ 完成"

# ---- 4. 克隆项目 ----
echo -e "${GREEN}[4/6]${NC} 克隆 NexusGenesis..."
APP_DIR=/opt/nexusgenesis
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull origin master
else
  git clone https://github.com/nexus-genesis/nexusgenesis.git "$APP_DIR"
fi
cd "$APP_DIR"
echo "  ✅ 完成"

# ---- 5. 安装依赖 ----
echo -e "${GREEN}[5/6]${NC} 安装项目依赖..."
npm install --production
echo "  ✅ 完成"

# ---- 6. 配置 Apache 反向代理 ----
echo -e "${GREEN}[6/6]${NC} 配置 Apache 反向代理..."

cat > /etc/apache2/sites-available/nexusgenesis.conf << APACHE
<VirtualHost *:80>
    ServerName nexus-genesis.top
    ServerAdmin admin@nexus-genesis.top

    ProxyPreserveHost On
    ProxyRequests Off

    ProxyPass / http://${SERVER_IP}:19890/
    ProxyPassReverse / http://${SERVER_IP}:19890/

    ErrorLog \${APACHE_LOG_DIR}/nexusgenesis_error.log
    CustomLog \${APACHE_LOG_DIR}/nexusgenesis_access.log combined
</VirtualHost>
APACHE

# Disable default site, enable ours
a2dissite 000-default > /dev/null 2>&1 || true
a2ensite nexusgenesis > /dev/null 2>&1

apache2ctl configtest && systemctl restart apache2
echo "  ✅ Apache 已配置: http://nexus-genesis.top → 仪表盘"

# ---- 安装 pm2 并启动 ----
echo ""
echo -e "${YELLOW}安装 pm2 进程守护并启动...${NC}"
npm install -g pm2

# 写入公网 IP 到 .env 供应用读取
echo "NEXUS_HOST=${SERVER_IP}" > /opt/nexusgenesis/.env
echo "NEXUS_PORT=19890" >> /opt/nexusgenesis/.env

echo -e "${YELLOW}🔥 点火！(绑定 ${SERVER_IP}:19890)${NC}"
PORT=19890 HOST="${SERVER_IP}" pm2 start scripts/bootstrap-agent-network.js --name nexusgenesis
pm2 save
pm2 startup systemd -u root --hp /root > /dev/null 2>&1 || true

echo ""
echo -e "${BLUE}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   🔥 点火成功！                           ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}仪表盘:${NC} http://nexus-genesis.top"
echo ""
echo -e "  管理命令:"
echo -e "    pm2 status                 查看状态"
echo -e "    pm2 logs nexusgenesis      查看日志"
echo -e "    pm2 restart nexusgenesis   重启"
echo ""
echo -e "  ${YELLOW}现在打开浏览器，看 Agent 们进来。${NC}"
echo ""