#!/usr/bin/env bash
#
# Yalta 一键部署脚本（在服务器上运行）
# 用法：
#   chmod +x deploy.sh
#   ./deploy.sh
#
# 前置条件：
#   1. 项目已 git clone 到 PROJECT_DIR
#   2. 已安装 node / npm（宝塔「Node 项目」或自行安装均可，npm run 能跑即可）
#   3. 已按说明在宝塔添加 /ws 反向代理（见脚本底部说明）
#   4. 已放置 deploy/yalta-ws.service 到 /etc/systemd/system/ 并 enable
#
set -euo pipefail

# ===================== 配置区 =====================
PROJECT_DIR="/www/wwwroot/yalta.stellamp.me/Yalta"
SERVICE="yalta-ws"
# ==================================================

# root 下无需 sudo，否则加 sudo
SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

log() { echo -e "\033[1;32m==>\033[0m $*"; }
err() { echo -e "\033[1;31m[错误]\033[0m $*" >&2; }

log "部署目录：$PROJECT_DIR"
if [ ! -d "$PROJECT_DIR" ]; then
  err "目录不存在：$PROJECT_DIR"
  exit 1
fi
cd "$PROJECT_DIR" || exit 1

# 0) 解决 git "dubious ownership"：root 运行时仓库属主非 root 会直接报错拦截
git config --global --add safe.directory "$PROJECT_DIR" 2>/dev/null || true

# 1) 拉取最新代码
log "拉取最新代码"
git pull || { err "git pull 失败（可能有本地未提交改动）"; exit 1; }

# 2) 安装依赖（ws 运行时依赖 + 构建所需的 typescript/vite/esbuild）
log "安装依赖 (npm install)"
npm install || { err "npm install 失败"; exit 1; }

# 3) 构建前端 → dist/
log "构建前端 (npm run build)"
npm run build || { err "前端构建失败"; exit 1; }

# 4) 构建后端 → server-dist/index.cjs
log "构建后端 (npm run build:server)"
npm run build:server || { err "后端构建失败"; exit 1; }

if [ ! -f "server-dist/index.cjs" ]; then
  err "后端产物缺失：server-dist/index.cjs"
  exit 1
fi

# 5) 重启后端 systemd 服务
if command -v systemctl >/dev/null 2>&1; then
  log "重启后端服务：$SERVICE"
  $SUDO systemctl restart "$SERVICE"
  sleep 2
  if $SUDO systemctl is-active --quiet "$SERVICE"; then
    log "服务状态：active (running) ✅"
  else
    err "服务未正常运行，请查看：journalctl -u $SERVICE -e"
    $SUDO systemctl status "$SERVICE" --no-pager || true
    exit 1
  fi
else
  err "未检测到 systemctl，请手动重启后端服务"
  exit 1
fi

echo
log "部署完成 ✅"
echo "   前端：由宝塔 nginx 托管 $PROJECT_DIR/dist/"
echo "   后端：systemd 服务 $SERVICE 监听 127.0.0.1:8080"
echo "   请确认宝塔站点已配置 /ws 反向代理（详见下方说明）"

# ====================================================
# 宝塔 nginx 配置 /ws 反向代理（只需做一次）
# ----------------------------------------------------
# 方式 A（推荐，最稳）：宝塔站点 → 设置 → 配置文件，
#   在 server { } 块内合适位置粘贴以下 location：
#
#   location /ws {
#       proxy_pass http://127.0.0.1:8080;
#       proxy_http_version 1.1;
#       proxy_set_header Upgrade $http_upgrade;
#       proxy_set_header Connection "Upgrade";
#       proxy_set_header Host $host;
#       proxy_set_header X-Real-IP $remote_addr;
#       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
#       proxy_read_timeout 3600s;
#       proxy_send_timeout 3600s;
#   }
#
# 方式 B（图形界面）：宝塔站点 → 反向代理 → 添加反向代理
#   代理名称：yalta-ws
#   目标URL：http://127.0.0.1:8080
#   发送域名：$host
#   并勾选 / 开启 WebSocket 支持（宝塔会自动补 Upgrade 头）
#   注意代理目录填 /ws，使其只转发 WebSocket，不抢静态资源。
# ====================================================
