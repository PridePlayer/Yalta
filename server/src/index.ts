// WebSocket 服务器入口 + 房间管理
// 同域托管：Nginx 将 /ws 代理到本进程

import { WebSocketServer, WebSocket } from 'ws'
import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
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

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1', path: '/ws', maxPayload: MAX_PAYLOAD })

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

console.log(`Yalta WebSocket server on :${PORT}/ws`)
