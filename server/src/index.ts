// WebSocket 服务器入口 + 房间管理
// 同域托管：Nginx 将 /ws 代理到本进程

import { WebSocketServer, WebSocket } from 'ws'
import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import * as http from 'http'
import { GameServer } from './gameServer'
import { canPerformAction, canAdvancePhase, canReset } from './permissions'
import { runAIPlayers, resetAIActed } from './aiPlayer'
import type { ClientMessage, ServerMessage, Player, PlayerRole, RoomInfo } from '../../shared/protocol'
import { roleNation, isLeader } from '../../shared/protocol'
import type { Nation } from '../../shared/domain/types'

const PORT = Number(process.env.PORT) || 8080
// 房间空置后的宽限销毁时间（毫秒），可用环境变量 ROOM_EMPTY_GRACE_MS 覆盖，默认 5 分钟
const ROOM_EMPTY_GRACE_MS = Number(process.env.ROOM_EMPTY_GRACE_MS) || 5 * 60 * 1000
// 单条消息最大体积（防止超大帧吃内存），默认 1MB
const MAX_PAYLOAD = Number(process.env.MAX_PAYLOAD) || 1 * 1024 * 1024
// 心跳探测间隔（毫秒）：检测静默断开，保证 close 能正常触发以清理房间/玩家
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS) || 30000
// 单连接动作最小间隔（毫秒），防止单个客户端刷广播（广播放大）
const MIN_ACTION_INTERVAL_MS = Number(process.env.MIN_ACTION_INTERVAL_MS) || 150
// 全服公告文件路径：服务器后台可直接编辑，保存后最多数秒全员可见。
// 该文件位于项目根目录 data/ 下，已被 .gitignore 忽略，因此 deploy 的 git pull
// 不会覆盖它，也不会被提交进仓库（属于服务器本地配置，区别于入库的 dist/）。
const ANNOUNCEMENT_FILE = process.env.ANNOUNCEMENT_FILE || path.join(process.cwd(), 'data', 'announcement.txt')
// 公告文件轮询间隔（毫秒）
const ANNOUNCEMENT_POLL_MS = Number(process.env.ANNOUNCEMENT_POLL_MS) || 5000

interface Room {
  code: string
  players: Map<string, { ws: WebSocket; player: Player; removeTimer?: ReturnType<typeof setTimeout> }>
  game: GameServer
  started: boolean
  /** 单人模式：AI 接管未被真人占据的队长位 */
  singlePlayer: boolean
  /** AI 控制的国家列表 */
  aiNations: Nation[]
  /** 房间空置后的销毁定时器（所有人离开且宽限超时则删除房间释放内存） */
  destroyTimer?: ReturnType<typeof setTimeout>
}

const rooms = new Map<string, Room>()

function genRoomCode(): string {
  // 用 crypto 生成不可预测的房间码，并避开易混淆字符（0/O/1/I）
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  let code = ''
  for (let i = 0; i < 5; i++) code += alphabet[bytes[i] % alphabet.length]
  return code
}

function getOrCreateRoom(code: string): Room {
  if (!rooms.has(code)) {
    rooms.set(code, {
      code,
      players: new Map(),
      game: new GameServer(),
      started: false,
      singlePlayer: false,
      aiNations: [],
    })
  }
  return rooms.get(code)!
}

function broadcast(room: Room, msg: ServerMessage, except?: string): void {
  for (const [pid, conn] of room.players) {
    if (pid !== except && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg))
    }
  }
}

function sendPrivate(room: Room, nation: Nation, msg: ServerMessage): void {
  for (const [, conn] of room.players) {
    if (roleNation(conn.player.role) === nation && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(msg))
    }
  }
}

function broadcastRoomInfo(room: Room): void {
  const roomInfo: RoomInfo = {
    code: room.code,
    players: [...room.players.values()].map((c) => c.player),
    phase: room.game.state.phase,
    session: room.game.state.session,
    started: room.started,
  }
  broadcast(room, { type: 'ROOM_INFO', room: roomInfo })
}

function broadcastState(room: Room): void {
  broadcast(room, { type: 'STATE', state: room.game.serialize() })
}

// ========== 全服公告 ==========
// 公告为服务器本地配置（data/announcement.txt），对所有在线连接广播，与房间无关。
let currentAnnouncement = ''

function loadAnnouncementFile(): string {
  try {
    return fs.readFileSync(ANNOUNCEMENT_FILE, 'utf8').trim()
  } catch {
    // 文件不存在或无法读取 → 视为无公告
    return ''
  }
}

/** 向所有在线连接广播（用于全服公告，跨房间） */
function broadcastToAll(msg: ServerMessage): void {
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(msg))
    }
  })
}

/** 触发 AI 玩家行动（单人模式） */
function triggerAI(room: Room): void {
  if (!room.singlePlayer || room.aiNations.length === 0) return
  const state = room.game.serialize()
  runAIPlayers({
    nations: room.aiNations,
    state,
    act: (action) => room.game.performAction(action),
    log: (text) => {
      broadcast(room, { type: 'LOG', entries: [{ id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, session: state.session, phase: state.phase, text, kind: 'info' as const }] })
    },
  })
  // AI 行动后广播新状态
  broadcastState(room)
}

function handleJoin(room: Room, ws: WebSocket, playerName: string, clientId: string, preferredRole?: PlayerRole): string {
  const existing = room.players.get(clientId)
  if (existing) {
    // 同一设备重连：复用原玩家槽位，避免出现两个「我」
    existing.player.online = true
    existing.player.name = playerName
    existing.ws = ws
    if (existing.removeTimer) {
      clearTimeout(existing.removeTimer)
      existing.removeTimer = undefined
    }
  } else {
    // 自动分配角色：若无偏好则分配空闲队长，否则旁观
    let role: PlayerRole = 'SPECTATOR'
    if (preferredRole) {
      // 检查角色是否被占用
      const taken = [...room.players.values()].some((c) => {
        if (typeof c.player.role === 'string' && typeof preferredRole === 'string') return c.player.role === preferredRole
        if (typeof c.player.role === 'object' && typeof preferredRole === 'object') return (c.player.role as any).seatId === (preferredRole as any).seatId
        return false
      })
      if (!taken) role = preferredRole
    } else {
      // 自动分配空闲队长
      const occupied = new Set([...room.players.values()].map((c) => c.player.role))
      for (const leader of ['LEADER_US', 'LEADER_UK', 'LEADER_SU'] as const) {
        if (!occupied.has(leader)) {
          role = leader
          break
        }
      }
    }

    const player: Player = { id: clientId, name: playerName, role, online: true }
    room.players.set(clientId, { ws, player })
  }
  // 有玩家加入/重连，取消该房间的待销毁定时器
  if (room.destroyTimer) {
    clearTimeout(room.destroyTimer)
    room.destroyTimer = undefined
  }
  ;(ws as any).playerId = clientId
  ;(ws as any).roomCode = room.code
  return clientId
}

function handleMessage(ws: WebSocket, raw: string): void {
  let msg: ClientMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    ws.send(JSON.stringify({ type: 'ERROR', message: '无效的 JSON' }))
    return
  }

  const playerId = (ws as any).playerId as string
  const roomCode = (ws as any).roomCode as string
  const room = rooms.get(roomCode)
  if (!room || !playerId) {
    ws.send(JSON.stringify({ type: 'ERROR', message: '未加入房间' }))
    return
  }

  const conn = room.players.get(playerId)
  if (!conn) return

  switch (msg.type) {
    case 'ASSIGN_ROLE': {
      conn.player.role = msg.role
      broadcastRoomInfo(room)
      break
    }

    case 'START_GAME': {
      if (!isLeader(conn.player.role)) {
        ws.send(JSON.stringify({ type: 'ERROR', message: '仅队长可开始游戏' }))
        return
      }
      room.started = true
      room.game.reset(msg.seed ?? 20250204)
      // 检测单人模式：统计真人队长数量，未被占据的队长位由 AI 接管
      const occupiedLeaders = new Set<Nation>()
      for (const [, c] of room.players) {
        if (isLeader(c.player.role)) {
          const n = roleNation(c.player.role)
          if (n) occupiedLeaders.add(n)
        }
      }
      const allLeaders: Nation[] = ['US', 'UK', 'SU']
      room.aiNations = allLeaders.filter((n) => !occupiedLeaders.has(n))
      room.singlePlayer = room.aiNations.length >= 1
      if (room.singlePlayer) {
        broadcast(room, { type: 'LOG', entries: [{ id: `ai-start-${Date.now()}`, session: 1, phase: 'TOPIC', text: `〔系统〕单人模式启用，AI 接管：${room.aiNations.map(n => n === 'US' ? '美' : n === 'UK' ? '英' : '苏').join('、')}`, kind: 'info' }] })
      }
      resetAIActed()
      broadcastRoomInfo(room)
      broadcastState(room)
      // 开局即触发一次 AI（TOPIC 阶段无动作，但若有危机则处理）
      triggerAI(room)
      break
    }

    case 'ACTION': {
      // 简易频率限制，防止单个客户端刷广播（广播放大）
      const now = Date.now()
      const last = (ws as any).lastActionAt || 0
      if (now - last < MIN_ACTION_INTERVAL_MS) {
        ws.send(JSON.stringify({ type: 'ERROR', message: '操作过于频繁，请稍后再试' }))
        return
      }
      ;(ws as any).lastActionAt = now
      if (!room.started) {
        ws.send(JSON.stringify({ type: 'ERROR', message: '游戏未开始' }))
        return
      }
      const perm = canPerformAction(conn.player.role, msg.action, room.game.state.phase)
      if (!perm.allowed) {
        ws.send(JSON.stringify({ type: 'ERROR', message: perm.reason ?? '无权执行此动作' }))
        return
      }
      const result = room.game.performAction(msg.action)
      if (!result.success) {
        ws.send(JSON.stringify({ type: 'ACTION_RESULT', success: false, message: result.message }))
        return
      }
      // 广播新日志
      if (result.newLogs.length > 0) {
        broadcast(room, { type: 'LOG', entries: result.newLogs })
      }
      // 私密情报：仅发给窃听方
      if (result.privateIntel && result.privateNation) {
        sendPrivate(room, result.privateNation, { type: 'PRIVATE', intel: result.privateIntel })
      }
      // 广播状态更新
      broadcastState(room)
      ws.send(JSON.stringify({ type: 'ACTION_RESULT', success: true, message: result.message }))
      break
    }

    case 'ADVANCE_PHASE': {
      if (!room.started) return
      if (!canAdvancePhase(conn.player.role)) {
        ws.send(JSON.stringify({ type: 'ERROR', message: '仅队长可推进议程' }))
        return
      }
      const newLogs = room.game.advancePhase()
      if (newLogs.length > 0) {
        broadcast(room, { type: 'LOG', entries: newLogs })
      }
      broadcastState(room)
      broadcastRoomInfo(room)
      // 推进后重置 AI 行动标记，并触发 AI 决策
      if (room.singlePlayer) {
        resetAIActed()
        // 延迟触发，模拟 AI 思考
        setTimeout(() => { if (rooms.has(room.code)) triggerAI(room) }, 600)
      }
      break
    }

    case 'RESET': {
      if (!canReset(conn.player.role)) {
        ws.send(JSON.stringify({ type: 'ERROR', message: '仅队长可重置' }))
        return
      }
      room.game.reset(msg.seed ?? 20250204)
      resetAIActed()
      broadcastState(room)
      break
    }
  }
}

function handleDisconnect(ws: WebSocket): void {
  const playerId = (ws as any).playerId as string
  const roomCode = (ws as any).roomCode as string
  const room = rooms.get(roomCode)
  if (!room || !playerId) return
  const conn = room.players.get(playerId)
  // 仅当断开的是该玩家「当前」连接时才处理：重连后旧 ws 应忽略，
  // 否则会把已经在线（已用新连接接管）的玩家误标为离线
  if (!conn || conn.ws !== ws) return
  conn.player.online = false
  // 立刻广播房间信息：让所有客户端当下看到该玩家「下线」（变灰），
  // 否则其他端会一直缓存旧的 online:true，直到 30s 后移除才刷新
  broadcastRoomInfo(room)
  // 延迟移除（允许重连）；记录定时器以便重连时取消
  conn.removeTimer = setTimeout(() => {
    const c = room.players.get(playerId)
    if (c && c.ws.readyState === WebSocket.CLOSED) {
      room.players.delete(playerId)
      broadcastRoomInfo(room)
      // 房间已空：启动宽限销毁定时器，避免内存无限累积
      if (room.players.size === 0 && !room.destroyTimer) {
        room.destroyTimer = setTimeout(() => {
          rooms.delete(room.code)
          console.log(`[${new Date().toISOString()}] room ${room.code} destroyed (empty, grace ${ROOM_EMPTY_GRACE_MS}ms)`)
        }, ROOM_EMPTY_GRACE_MS)
      }
    }
  }, 30000)
}

// 创建 HTTP 服务器承载「后台管理」接口，并将 WebSocketServer 挂载其上（同端口，由 nginx 反代）
// 这样 /ws 仍走 WebSocket，/admin 与 /api/admin/* 走普通 HTTP，互不干扰。
const httpServer = http.createServer((req, res) => { handleAdminRequest(req, res) })
const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: MAX_PAYLOAD })
httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`Yalta server (ws + admin) listening on 127.0.0.1:${PORT}`)
})

// 心跳：定期探测死连接，触发 close 以正常清理房间/玩家（避免静默断开导致泄漏）
const heartbeat = setInterval(() => {
  wss.clients.forEach((client) => {
    const c = client as any
    if (c.isAlive === false) {
      c.terminate()
      return
    }
    c.isAlive = false
    c.ping()
  })
}, HEARTBEAT_MS)
// 心跳定时器不应阻止进程退出
;(heartbeat as any).unref?.()

// 全服公告：轮询文件，内容变化即向所有在线连接广播（最多延迟一个轮询周期）
currentAnnouncement = loadAnnouncementFile()
const announcementPoller = setInterval(() => {
  const next = loadAnnouncementFile()
  if (next !== currentAnnouncement) {
    currentAnnouncement = next
    broadcastToAll({ type: 'ANNOUNCEMENT', text: currentAnnouncement })
    console.log(`[${new Date().toISOString()}] announcement updated (len=${currentAnnouncement.length})`)
  }
}, ANNOUNCEMENT_POLL_MS)
;(announcementPoller as any).unref?.()

// ========== 后台管理接口 ==========
// 仅由 nginx 反代访问（127.0.0.1:PORT）。可选 ADMIN_TOKEN 做简易鉴权：
// 配置后，访问 /admin 与 /api/admin/* 需带 ?token=xxx（管理页会自动沿用 URL 上的 token）。
// 若未设置 ADMIN_TOKEN，接口可被任意访问——生产环境务必在 systemd 的 Environment 中设置。
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || ''
if (!ADMIN_TOKEN) {
  console.log('[警告] ADMIN_TOKEN 未设置，后台管理接口可被任意访问，请在生产环境设置 ADMIN_TOKEN')
}

function adminAuthorized(reqUrl: URL): boolean {
  if (!ADMIN_TOKEN) return true
  return reqUrl.searchParams.get('token') === ADMIN_TOKEN
}

function sendJson(res: http.ServerResponse, code: number, obj: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(obj))
}

/** 关闭指定房间：断开其所有连接并释放内存 */
function closeRoomByCode(code: string): { ok: boolean; message: string } {
  const room = rooms.get(code)
  if (!room) return { ok: false, message: '房间不存在' }
  for (const [, conn] of room.players) {
    try { conn.ws.terminate() } catch { /* 忽略已关闭的连接 */ }
  }
  rooms.delete(code)
  console.log(`[${new Date().toISOString()}] admin closed room ${code}`)
  return { ok: true, message: `房间 ${code} 已关闭` }
}

function roomsSnapshot() {
  return {
    count: rooms.size,
    totalConnections: wss.clients.size,
    uptimeSeconds: Math.floor(process.uptime()),
    rooms: [...rooms.values()].map((r) => ({
      code: r.code,
      players: r.players.size,
      started: r.started,
      session: r.game.state.session,
      phase: r.game.state.phase,
    })),
  }
}

function handleAdminRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host}`)
  const pathname = reqUrl.pathname

  if (pathname === '/admin') {
    if (!adminAuthorized(reqUrl)) {
      res.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('未授权：缺少或错误的 token')
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(buildAdminHtml())
    return
  }

  if (pathname.startsWith('/api/admin/')) {
    if (!adminAuthorized(reqUrl)) {
      sendJson(res, 401, { ok: false, message: '未授权' })
      return
    }
    if (pathname === '/api/admin/rooms' && req.method === 'GET') {
      sendJson(res, 200, roomsSnapshot())
      return
    }
    const closeMatch = pathname.match(/^\/api\/admin\/rooms\/([^/]+)\/close$/)
    if (closeMatch && (req.method === 'POST' || req.method === 'GET')) {
      const code = decodeURIComponent(closeMatch[1])
      sendJson(res, 200, closeRoomByCode(code))
      return
    }
    if (pathname === '/api/admin/close-all' && req.method === 'POST') {
      const codes = [...rooms.keys()]
      for (const code of codes) closeRoomByCode(code)
      sendJson(res, 200, { ok: true, message: `已关闭 ${codes.length} 个房间` })
      return
    }
    sendJson(res, 404, { ok: false, message: '未知接口' })
    return
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end('Not Found')
}

function buildAdminHtml(): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>雅尔塔 · 后台管理</title>
<style>
  :root { --bg:#15110f; --panel:#1f1916; --crimson:#9b2c2c; --gold:#d9b46a; --ink:#ece3d4; --muted:#9a8f80; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  .wrap { max-width:980px; margin:0 auto; padding:24px 18px 60px; }
  h1 { font-size:22px; border-left:4px solid var(--crimson); padding-left:12px; margin:8px 0 20px; }
  .cards { display:flex; gap:14px; flex-wrap:wrap; margin-bottom:18px; }
  .card { flex:1 1 160px; background:var(--panel); border:1px solid #322720; border-radius:10px; padding:16px; text-align:center; }
  .card .num { font-size:30px; font-weight:700; color:var(--gold); }
  .card .lbl { font-size:13px; color:var(--muted); margin-top:4px; }
  .toolbar { display:flex; align-items:center; gap:12px; margin-bottom:14px; }
  button { background:var(--crimson); color:#fff; border:none; border-radius:8px; padding:9px 16px; font-size:14px; cursor:pointer; }
  button:hover { filter:brightness(1.1); }
  button.danger { background:#7a1f1f; }
  .msg { color:var(--gold); font-size:13px; }
  table { width:100%; border-collapse:collapse; background:var(--panel); border-radius:10px; overflow:hidden; }
  th,td { padding:11px 12px; text-align:left; border-bottom:1px solid #2c241d; font-size:14px; }
  th { background:#261e19; color:var(--muted); font-weight:600; }
  tr:last-child td { border-bottom:none; }
  .empty { text-align:center; color:var(--muted); padding:26px; }
  .tag { display:inline-block; padding:2px 8px; border-radius:6px; font-size:12px; background:#2c241d; color:var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <h1>雅尔塔会议 · 后台管理</h1>
  <div class="cards" id="cards"></div>
  <div class="toolbar">
    <button id="refresh">刷新</button>
    <button id="closeAll" class="danger">关闭全部房间</button>
    <span class="msg" id="msg"></span>
  </div>
  <table>
    <thead><tr><th>房间码</th><th>人数</th><th>已开始</th><th>会期</th><th>阶段</th><th>操作</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
</div>
<script>
  var token = new URLSearchParams(location.search).get('token') || '';
  function getToken(){ return token ? ('?token=' + encodeURIComponent(token)) : ''; }
  function showMsg(t){ document.getElementById('msg').textContent = t; }
  function load(){
    fetch('/api/admin/rooms' + getToken()).then(function(r){return r.json();}).then(function(d){ render(d); }).catch(function(e){ showMsg('加载失败: ' + e); });
  }
  function render(d){
    document.getElementById('cards').innerHTML =
      '<div class="card"><div class="num">' + d.count + '</div><div class="lbl">房间数</div></div>' +
      '<div class="card"><div class="num">' + d.totalConnections + '</div><div class="lbl">总连接数</div></div>' +
      '<div class="card"><div class="num">' + d.uptimeSeconds + 's</div><div class="lbl">运行时长</div></div>';
    var rows = document.getElementById('rows');
    rows.innerHTML = '';
    if(!d.rooms.length){ rows.innerHTML = '<tr><td colspan="6" class="empty">当前没有房间</td></tr>'; return; }
    d.rooms.forEach(function(r){
      var tr = document.createElement('tr');
      tr.innerHTML = '<td><b>' + r.code + '</b></td><td>' + r.players + '</td><td>' + (r.started?'<span class="tag">是</span>':'否') + '</td><td>' + r.session + '</td><td>' + r.phase + '</td>';
      var td = document.createElement('td');
      var b = document.createElement('button');
      b.className = 'danger';
      b.textContent = '关闭';
      b.onclick = function(){ closeRoom(r.code); };
      td.appendChild(b);
      tr.appendChild(td);
      rows.appendChild(tr);
    });
  }
  function closeRoom(code){
    if(!confirm('确定关闭房间 ' + code + '？该房间所有玩家将被立即断开。')) return;
    fetch('/api/admin/rooms/' + encodeURIComponent(code) + '/close' + getToken(), {method:'POST'}).then(function(r){return r.json();}).then(function(d){ showMsg(d.message || (d.ok?'已关闭':'操作失败')); load(); });
  }
  function closeAll(){
    if(!confirm('确定关闭所有房间？所有玩家将被立即断开。')) return;
    fetch('/api/admin/close-all' + getToken(), {method:'POST'}).then(function(r){return r.json();}).then(function(d){ showMsg(d.message || ''); load(); });
  }
  document.getElementById('refresh').onclick = load;
  document.getElementById('closeAll').onclick = closeAll;
  load();
  setInterval(load, 3000);
</script>
</body>
</html>`
}

wss.on('connection', (ws, req) => {
  // 从 URL 提取房间码、玩家名与设备标识：/ws?room=XXXX&name=YYY&cid=ZZZ
  const url = new URL(req.url!, `http://${req.headers.host}`)
  let roomCode = url.searchParams.get('room') || ''
  if (!roomCode) {
    // 自动生成且确保不与现有房间冲突，避免误入他人对局
    do { roomCode = genRoomCode() } while (rooms.has(roomCode))
  }
  const playerName = url.searchParams.get('name') || '匿名代表'
  const clientId = url.searchParams.get('cid') || `c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  // 心跳标记
  ;(ws as any).isAlive = true
  ws.on('pong', () => { (ws as any).isAlive = true })

  const room = getOrCreateRoom(roomCode)
  handleJoin(room, ws, playerName, clientId)

  // 发送房间信息
  broadcastRoomInfo(room)
  // 若游戏已开始，发送当前状态
  if (room.started) {
    ws.send(JSON.stringify({ type: 'STATE', state: room.game.serialize() }))
  }
  // 下发当前全服公告（如有），确保新加入者也立即可见，清空后不发送（客户端默认隐藏）
  if (currentAnnouncement) {
    ws.send(JSON.stringify({ type: 'ANNOUNCEMENT', text: currentAnnouncement }))
  }

  ws.on('message', (data) => handleMessage(ws, data.toString()))
  ws.on('close', () => handleDisconnect(ws))

  console.log(`[${new Date().toISOString()}] ${playerName} (${clientId}) joined room ${roomCode} (${room.players.size} players)`)
})
