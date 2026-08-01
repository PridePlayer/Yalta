// WebSocket 服务器入口 + 房间管理
// 同域托管：Nginx 将 /ws 代理到本进程

import { WebSocketServer, WebSocket } from 'ws'
import { GameServer } from './gameServer'
import { canPerformAction, canAdvancePhase, canReset } from './permissions'
import { runAIPlayers, resetAIActed } from './aiPlayer'
import type { ClientMessage, ServerMessage, Player, PlayerRole, RoomInfo } from '../../shared/protocol'
import { roleNation, isLeader } from '../../shared/protocol'
import type { Nation } from '../../shared/domain/types'

const PORT = Number(process.env.PORT) || 8080

interface Room {
  code: string
  players: Map<string, { ws: WebSocket; player: Player }>
  game: GameServer
  started: boolean
  /** 单人模式：AI 接管未被真人占据的队长位 */
  singlePlayer: boolean
  /** AI 控制的国家列表 */
  aiNations: Nation[]
}

const rooms = new Map<string, Room>()

function genRoomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
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

function handleJoin(room: Room, ws: WebSocket, playerName: string, preferredRole?: PlayerRole): string {
  const playerId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
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

  const player: Player = { id: playerId, name: playerName, role, online: true }
  room.players.set(playerId, { ws, player })
  ;(ws as any).playerId = playerId
  ;(ws as any).roomCode = room.code
  return playerId
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
        setTimeout(() => triggerAI(room), 600)
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
  if (conn) conn.player.online = false
  // 延迟移除（允许重连）
  setTimeout(() => {
    if (room.players.get(playerId)?.ws.readyState === WebSocket.CLOSED) {
      room.players.delete(playerId)
      broadcastRoomInfo(room)
    }
  }, 30000)
}

const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1', path: '/ws' })

wss.on('connection', (ws, req) => {
  // 从 URL 提取房间码和玩家名：/ws?room=XXXX&name=YYY
  const url = new URL(req.url!, `http://${req.headers.host}`)
  const roomCode = url.searchParams.get('room') || genRoomCode()
  const playerName = url.searchParams.get('name') || '匿名代表'

  const room = getOrCreateRoom(roomCode)
  const playerId = handleJoin(room, ws, playerName)

  // 发送房间信息
  broadcastRoomInfo(room)
  // 若游戏已开始，发送当前状态
  if (room.started) {
    ws.send(JSON.stringify({ type: 'STATE', state: room.game.serialize() }))
  }

  ws.on('message', (data) => handleMessage(ws, data.toString()))
  ws.on('close', () => handleDisconnect(ws))

  console.log(`[${new Date().toISOString()}] ${playerName} joined room ${roomCode} (${room.players.size} players)`)
})

console.log(`Yalta WebSocket server on :${PORT}/ws`)
