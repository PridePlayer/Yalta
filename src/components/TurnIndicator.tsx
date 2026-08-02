// 行动指示 + 阶段倒计时
// 游戏为「阶段制」而非轮流制：同一阶段内所有相关玩家可同时行动，由队长手动推进。
// 本组件提示：当前阶段、本阶段剩余时间（服务器同步，仅提醒不自动推进）、本阶段行动方。

import { useEffect, useState } from 'react'
import type { SessionPhase } from '@shared/domain/types'

/** 各阶段「建议时长」（秒）。仅作 UI 软提示，超时不会自动推进，需队长手动推进。 */
const PHASE_SOFT_LIMIT: Record<SessionPhase, number> = {
  TOPIC: 120,
  VENUE: 180,
  MILITARY: 180,
  CRISIS: 150,
  PRESS: 120,
}

const PHASE_NAME: Record<SessionPhase, string> = {
  TOPIC: '议程',
  VENUE: '分会场',
  MILITARY: '军议',
  CRISIS: '危机',
  PRESS: '记者会',
}

/** 本阶段可行动的一方（用于提示「谁该行动」） */
const PHASE_ACTORS: Record<SessionPhase, string> = {
  TOPIC: '三巨头（队长）议定本日议程',
  VENUE: '情报官潜入窃听 · 队长可拟定协议',
  MILITARY: '各国军事官签发军令',
  CRISIS: '队长应对危机（波兰 / 请愿 / 协议）',
  PRESS: '队长出席记者会 · 推进议程',
}

interface Props {
  phase: SessionPhase
  phaseStartedAt: number
  gameEnded: boolean
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function TurnIndicator({ phase, phaseStartedAt, gameEnded }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (gameEnded) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [gameEnded])

  // 阶段切换时立即刷新一次，避免倒计时滞后一秒
  useEffect(() => {
    setNow(Date.now())
  }, [phase, phaseStartedAt])

  if (gameEnded) {
    return (
      <div className="turn-indicator turn-ended">
        <span className="turn-phase">会议闭幕</span>
        <span className="turn-actors">历史已成定局，查看最终结算</span>
      </div>
    )
  }

  const elapsed = Math.max(0, (now - phaseStartedAt) / 1000)
  const limit = PHASE_SOFT_LIMIT[phase]
  const remaining = limit - elapsed
  const overtime = remaining <= 0
  const urgent = !overtime && remaining <= 30

  return (
    <div className="turn-indicator">
      <span className="turn-phase">
        本阶段 · {PHASE_NAME[phase]}
      </span>

      <span className={`turn-timer ${urgent ? 'urgent' : ''} ${overtime ? 'overtime' : ''}`}>
        <span className="turn-timer-label">{overtime ? '已超时' : '剩余'}</span>
        <span className="turn-timer-value">{overtime ? fmt(-remaining) : fmt(remaining)}</span>
        {overtime && <span className="turn-timer-hint">· 等待队长推进</span>}
      </span>

      <span className="turn-actors">行动方：{PHASE_ACTORS[phase]}</span>
    </div>
  )
}
