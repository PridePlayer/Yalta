// WebSocket 客户端：连接服务器、收发消息、维护本地镜像状态
// 同域托管下自动推导 wss/ws，无需硬编码地址

import { useSyncExternalStore } from 'react'
import type {
  ClientMessage,
  ServerMessage,
  RoomInfo,
  Player,
  PlayerRole,
  SerializableGameState,
  PrivateIntel,
  LogEntryDTO,
} from '@shared/protocol'

// ========== 连接状态 ==========

export type ConnStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error'

interface ClientStore {
  status: ConnStatus
  error: string | null
  room: RoomInfo | null
  /** 本地玩家 ID（由服务器在 JOIN 后分配） */
  playerId: string | null
  state: SerializableGameState | null
  /** 私密情报列表（仅本人可见，窃听所得） */
  intels: PrivateIntel[]
  /** 服务器推送的最新 ACTION_RESULT 反馈 */
  lastActionResult: { success: boolean; message: string; at: number } | null
}

let store: ClientStore = {
  status: 'idle',
  error: null,
  room: null,
  playerId: null,
  state: null,
  intels: [],
  lastActionResult: null,
}

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let lastJoinPayload: { roomCode: string; playerName: string; preferredRole?: PlayerRole } | null = null

const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function setStore(patch: Partial<ClientStore>) {
  store = { ...store, ...patch }
  emit()
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function getStore(): ClientStore {
  return store
}

// ========== WebSocket 推导与连接 ==========

function buildWsUrl(roomCode: string, playerName: string): string {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  const params = new URLSearchParams({ room: roomCode, name: playerName })
  return `${proto}://${location.host}/ws?${params.toString()}`
}

function handleMessage(raw: string) {
  let msg: ServerMessage
  try {
    msg = JSON.parse(raw)
  } catch {
    return
  }
  switch (msg.type) {
    case 'ROOM_INFO': {
      // 从房间玩家列表里找出自己的 playerId（按 name 匹配最稳）
      // 服务器在 connection 时已记录 playerId，并通过 ROOM_INFO 广播
      // 我们用最后一次 JOIN 的 playerName 匹配
      const me = lastJoinPayload
        ? msg.room.players.find((p) => p.name === lastJoinPayload.playerName)
        : null
      setStore({ room: msg.room, playerId: me?.id ?? store.playerId })
      break
    }
    case 'STATE': {
      setStore({ state: msg.state })
      break
    }
    case 'LOG': {
      // 服务器同时发 STATE（含完整 logs），增量 LOG 仅作通知用，不再单独拼接
      // 也可以累计显示，但为避免重复，这里只触发一次刷新
      // 已通过 STATE 同步 logs，无需处理
      break
    }
    case 'PRIVATE': {
      setStore({ intels: [...store.intels, msg.intel] })
      break
    }
    case 'ERROR': {
      setStore({ error: msg.message })
      break
    }
    case 'ACTION_RESULT': {
      setStore({
        lastActionResult: { success: msg.success, message: msg.message, at: Date.now() },
        // 失败的动作也清掉之前的 error（避免误导）
        error: msg.success ? store.error : msg.message,
      })
      break
    }
  }
}

function handleClose() {
  if (ws) {
    ws.onmessage = null
    ws.onerror = null
    ws.onclose = null
    ws = null
  }
  // 自动重连（仅当之前已连上过且未主动断开）
  if (lastJoinPayload && store.status !== 'idle') {
    setStore({ status: 'reconnecting', error: '连接断开，重试中…' })
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      if (lastJoinPayload) {
        doConnect(lastJoinPayload, true)
      }
    }, 2000)
  } else {
    setStore({ status: 'error' })
  }
}

function handleError() {
  // 浏览器 WebSocket onerror 信息不可读，靠 onclose 走重连
  setStore({ error: '连接异常' })
}

function doConnect(payload: { roomCode: string; playerName: string; preferredRole?: PlayerRole }, isReconnect = false) {
  lastJoinPayload = payload
  if (ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
  }
  setStore({ status: 'connecting', error: null })

  const url = buildWsUrl(payload.roomCode, payload.playerName)
  try {
    ws = new WebSocket(url)
  } catch (e) {
    setStore({ status: 'error', error: `无法建立连接：${(e as Error).message}` })
    return
  }

  ws.onopen = () => {
    setStore({ status: 'connected', error: null })
    // 重连后无需再发 JOIN（服务器按 URL 参数已分配 playerId 与房间）
    // 但 preferredRole 可能未生效，重新发一次 ASSIGN_ROLE
    if (isReconnect && payload.preferredRole) {
      send({ type: 'ASSIGN_ROLE', role: payload.preferredRole })
    }
  }
  ws.onmessage = (ev) => handleMessage(ev.data as string)
  ws.onerror = handleError
  ws.onclose = handleClose
}

// ========== 公开 API ==========

/** 发起连接（加入房间） */
export function connect(roomCode: string, playerName: string, preferredRole?: PlayerRole) {
  doConnect({ roomCode: playerName ? roomCode : roomCode, playerName, preferredRole })
}

/** 主动断开 */
export function disconnect() {
  lastJoinPayload = null
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    try { ws.close() } catch { /* ignore */ }
    ws = null
  }
  setStore({
    status: 'idle',
    room: null,
    playerId: null,
    state: null,
    intels: [],
    error: null,
    lastActionResult: null,
  })
}

/** 发送消息到服务器 */
export function send(msg: ClientMessage) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    setStore({ error: '尚未连接到服务器' })
    return false
  }
  try {
    ws.send(JSON.stringify(msg))
    return true
  } catch (e) {
    setStore({ error: `发送失败：${(e as Error).message}` })
    return false
  }
}

/** 清除当前错误提示 */
export function clearError() {
  if (store.error) setStore({ error: null })
}

/** 标记私密情报为已读（移除） */
export function dismissIntel(id: string) {
  setStore({ intels: store.intels.filter((i) => i.id !== id) })
}

// ========== React Hooks ==========

export function useClientStore(): ClientStore {
  return useSyncExternalStore(subscribe, getStore, getStore)
}

export function useConnection(): { status: ConnStatus; error: string | null } {
  const s = useClientStore()
  return { status: s.status, error: s.error }
}

export function useRoom(): RoomInfo | null {
  return useClientStore().room
}

/** 当前本地玩家（来自房间信息） */
export function useSelf(): Player | null {
  const s = useClientStore()
  if (!s.room || !s.playerId) return null
  return s.room.players.find((p) => p.id === s.playerId) ?? null
}

export function useServerState(): SerializableGameState | null {
  return useClientStore().state
}

export function usePrivateIntels(): PrivateIntel[] {
  return useClientStore().intels
}

export function useLastActionResult() {
  return useClientStore().lastActionResult
}

export type { ClientMessage, ServerMessage, RoomInfo, Player, PlayerRole, SerializableGameState, PrivateIntel, LogEntryDTO }
