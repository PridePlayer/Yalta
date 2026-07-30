// 大厅：加入房间 / 选角色 / 等待队长开局
// 三种状态：未连接 → 已连接未开始 → 已开始（由 App.tsx 切换到游戏面板）

import { useState, useEffect } from 'react'
import { SEATS } from '@shared/data/seats'
import { connect, disconnect, send, clearError } from '../net/client'
import { useConnection, useRoom, useSelf } from '../net/client'
import { roleLabel, isLeader } from '@shared/protocol'
import type { PlayerRole, LeaderRole } from '@shared/protocol'
import type { Nation } from '@shared/domain/types'

const NATION_LABEL: Record<Nation, string> = { US: '美利坚合众国', UK: '大不列颠', SU: '苏维埃联盟' }
const NATION_COLOR: Record<Nation, string> = { US: '#3a6ea5', UK: '#8b2c2c', SU: '#a83232' }

const LEADER_OPTIONS: { role: LeaderRole; nation: Nation; label: string }[] = [
  { role: 'LEADER_US', nation: 'US', label: '罗斯福总统' },
  { role: 'LEADER_UK', nation: 'UK', label: '丘吉尔首相' },
  { role: 'LEADER_SU', nation: 'SU', label: '斯大林元帅' },
]

function randomRoomCode(): string {
  return Math.random().toString(36).slice(2, 7).toUpperCase()
}

export function Lobby() {
  const { status, error } = useConnection()
  const room = useRoom()
  const self = useSelf()

  // 表单状态
  const [roomCode, setRoomCode] = useState<string>(randomRoomCode())
  const [playerName, setPlayerName] = useState('')
  const [pickedRole, setPickedRole] = useState<PlayerRole | ''>('')

  // 已加入房间后，根据角色被占用情况过滤可选项
  const occupiedRoles = new Set<PlayerRole>()
  for (const p of room?.players ?? []) {
    if (p.id !== self?.id) occupiedRoles.add(p.role)
  }

  function handleJoin() {
    if (!playerName.trim()) return
    const role = pickedRole || undefined
    connect(roomCode.toUpperCase(), playerName.trim(), role)
  }

  function handleSwitchRole(role: PlayerRole) {
    setPickedRole(role)
    // 若已连接，立即同步到服务器
    if (status === 'connected') {
      send({ type: 'ASSIGN_ROLE', role })
    }
  }

  function handleLeave() {
    disconnect()
    setPickedRole('')
  }

  function handleStart() {
    send({ type: 'START_GAME', seed: 20250204 })
  }

  // 进入房间后默认选一个角色
  useEffect(() => {
    if (status === 'connected' && !self?.role) {
      // 服务器自动分配的角色已通过 ROOM_INFO 返回，UI 仅显示
      setPickedRole(self?.role ?? '')
    } else if (status === 'connected' && self?.role) {
      setPickedRole(self.role)
    }
  }, [status, self?.role])

  // ===== 未连接：显示加入表单 =====
  if (status === 'idle' || status === 'error') {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <div className="lobby-header">
            <span className="lobby-ornament">❦</span>
            <h1>雅尔塔会议 · 1945</h1>
            <span className="lobby-ornament">❦</span>
          </div>
          <p className="lobby-sub">利瓦季亚宫 · 黑海之滨 · 三巨头博弈</p>

          <div className="lobby-form">
            <label className="lobby-field">
              <span>房间号</span>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABCDE"
                maxLength={6}
              />
              <button
                type="button"
                className="lobby-mini-btn"
                onClick={() => setRoomCode(randomRoomCode())}
              >
                随机
              </button>
            </label>

            <label className="lobby-field">
              <span>代表名号</span>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value.slice(0, 16))}
                placeholder="如：哈里·霍普金斯"
                maxLength={16}
              />
            </label>

            <div className="lobby-field">
              <span>预设角色（可后改）</span>
              <div className="role-pick-row">
                {LEADER_OPTIONS.map((opt) => (
                  <button
                    key={opt.role}
                    type="button"
                    className={`role-pick ${pickedRole === opt.role ? 'active' : ''}`}
                    style={{ borderColor: NATION_COLOR[opt.nation] }}
                    onClick={() => setPickedRole(opt.role)}
                  >
                    <span className="role-pick-nation" style={{ color: NATION_COLOR[opt.nation] }}>
                      {NATION_LABEL[opt.nation]}
                    </span>
                    <span className="role-pick-name">{opt.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={`role-pick ${pickedRole === 'SPECTATOR' ? 'active' : ''}`}
                  onClick={() => setPickedRole('SPECTATOR')}
                >
                  <span className="role-pick-nation">无</span>
                  <span className="role-pick-name">旁观者</span>
                </button>
              </div>
              <p className="lobby-hint">幕僚角色可在加入后于席位列表中挑选</p>
            </div>

            {error && <p className="lobby-error">{error}</p>}

            <button
              className="lobby-btn-primary"
              onClick={handleJoin}
              disabled={!playerName.trim() || !roomCode.trim()}
            >
              进入会议厅
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ===== 连接中 / 重连中 =====
  if (status === 'connecting' || status === 'reconnecting') {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <div className="lobby-header">
            <span className="lobby-ornament">❦</span>
            <h1>{status === 'reconnecting' ? '重新连接中…' : '正在抵达雅尔塔…'}</h1>
            <span className="lobby-ornament">❦</span>
          </div>
          <p className="lobby-sub">{error ?? '请稍候'}</p>
        </div>
      </div>
    )
  }

  // ===== 已连接未开始：显示房间等待厅 =====
  if (!room) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <p className="lobby-sub">等待房间信息…</p>
        </div>
      </div>
    )
  }

  const amLeader = self ? isLeader(self.role) : false
  const leaderPlayers = room.players.filter((p) => isLeader(p.role))

  return (
    <div className="lobby">
      <div className="lobby-card lobby-card-wide">
        <div className="lobby-header">
          <span className="lobby-ornament">❦</span>
          <h1>大厅 · 房间 {room.code}</h1>
          <span className="lobby-ornament">❦</span>
        </div>
        <p className="lobby-sub">
          当前 {room.players.length} 位代表在线 · 等待队长开局
        </p>

        {/* 队长席位选择 */}
        <div className="lobby-section">
          <h3>三巨头席位</h3>
          <div className="seat-grid">
            {LEADER_OPTIONS.map((opt) => {
              const occupant = room.players.find((p) => p.role === opt.role)
              const isMe = occupant?.id === self?.id
              const isOccupied = !!occupant && !isMe
              return (
                <button
                  key={opt.role}
                  type="button"
                  className={`seat-card ${isMe ? 'mine' : ''}`}
                  style={{ borderColor: NATION_COLOR[opt.nation] }}
                  disabled={isOccupied}
                  onClick={() => handleSwitchRole(opt.role)}
                >
                  <span className="seat-nation" style={{ color: NATION_COLOR[opt.nation] }}>
                    {NATION_LABEL[opt.nation]}
                  </span>
                  <span className="seat-name">{opt.label}</span>
                  <span className="seat-status">
                    {isMe ? '✓ 已就座' : occupant ? `${occupant.name} 已就座` : '空缺 · 点击就座'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 幕僚席位选择（简化：列出军事/情报席位，可选） */}
        <details className="lobby-section lobby-details">
          <summary>选择幕僚席位（可选，担任专项官员）</summary>
          <div className="seat-grid seat-grid-tight">
            {SEATS.filter((s) => s.role === 'MILITARY' || s.role === 'INTEL').map((s) => {
              const role: PlayerRole = { type: 'SUPPORT', seatId: s.id, nation: s.nation }
              const occupant = room.players.find((p) =>
                typeof p.role === 'object' && (p.role as any).seatId === s.id,
              )
              const isMe = occupant?.id === self?.id
              const isOccupied = !!occupant && !isMe
              return (
                <button
                  key={s.id}
                  type="button"
                  className={`seat-card seat-card-mini ${isMe ? 'mine' : ''}`}
                  style={{ borderColor: NATION_COLOR[s.nation] }}
                  disabled={isOccupied}
                  onClick={() => handleSwitchRole(role)}
                >
                  <span className="seat-nation" style={{ color: NATION_COLOR[s.nation] }}>
                    {NATION_LABEL[s.nation]} · {s.role === 'MILITARY' ? '军事' : '情报'}
                  </span>
                  <span className="seat-name">{s.name}</span>
                  <span className="seat-status">
                    {isMe ? '✓' : occupant ? occupant.name : '空缺'}
                  </span>
                </button>
              )
            })}
          </div>
        </details>

        {/* 玩家列表 */}
        <div className="lobby-section">
          <h3>在线代表（{room.players.length}）</h3>
          <ul className="player-list">
            {room.players.map((p) => (
              <li key={p.id} className={p.id === self?.id ? 'me' : ''}>
                <span className={`player-dot ${p.online ? 'on' : 'off'}`} />
                <span className="player-name">{p.name}</span>
                <span className="player-role">{roleLabel(p.role)}</span>
                {p.id === self?.id && <span className="player-tag">我</span>}
              </li>
            ))}
          </ul>
        </div>

        {/* 操作栏 */}
        <div className="lobby-action-bar">
          <button className="lobby-btn-ghost" onClick={handleLeave}>
            离开房间
          </button>
          {amLeader ? (
            <button
              className="lobby-btn-primary"
              onClick={handleStart}
              disabled={leaderPlayers.length === 0}
            >
              以队长身份开局
            </button>
          ) : (
            <p className="lobby-hint">
              {leaderPlayers.length > 0
                ? `等待队长开局（${leaderPlayers.map((p) => p.name).join('、')}）`
                : '尚无队长就座，请选择一位三巨头席位开局'}
            </p>
          )}
        </div>

        {error && (
          <p className="lobby-error">
            {error}
            <button type="button" onClick={clearError} className="lobby-mini-btn">×</button>
          </p>
        )}
      </div>
    </div>
  )
}
