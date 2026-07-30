// 回合制流程指示器：5 阶段进度条 + 当前阶段高亮

import type { SessionPhase } from '@shared/domain/types'

const PHASES: { key: SessionPhase; label: string; icon: string }[] = [
  { key: 'TOPIC', label: '议程', icon: '❶' },
  { key: 'VENUE', label: '分会场', icon: '❷' },
  { key: 'MILITARY', label: '军议', icon: '❸' },
  { key: 'CRISIS', label: '危机', icon: '❹' },
  { key: 'PRESS', label: '记者会', icon: '❺' },
]

interface Props {
  phase: SessionPhase
  session: number
  gameEnded: boolean
}

export function PhaseIndicator({ phase, session, gameEnded }: Props) {
  const currentIdx = PHASES.findIndex((p) => p.key === phase)

  return (
    <div className="phase-indicator">
      {/* 会期圆点：7 期 */}
      <div className="session-dots">
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className={`session-dot ${i + 1 < session ? 'done' : ''} ${i + 1 === session ? 'current' : ''} ${i + 1 > session ? 'future' : ''}`}
          >
            {i + 1}
          </span>
        ))}
      </div>

      {/* 阶段流程条 */}
      <div className="phase-track">
        {PHASES.map((p, i) => {
          const isCurrent = i === currentIdx
          const isDone = i < currentIdx
          const isFuture = i > currentIdx
          return (
            <div
              key={p.key}
              className={`phase-node ${isCurrent ? 'current' : ''} ${isDone ? 'done' : ''} ${isFuture ? 'future' : ''} ${gameEnded ? 'ended' : ''}`}
            >
              <span className="phase-icon">{p.icon}</span>
              <span className="phase-label">{p.label}</span>
              {isCurrent && !gameEnded && <span className="phase-pulse" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
