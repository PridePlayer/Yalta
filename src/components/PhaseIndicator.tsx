// 阶段流程指示器：5 阶段进度条 + 当前阶段高亮
// 会期圆点（1234567）已上移至报头标题行，与「雅尔塔会议」同处一行。

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
  gameEnded: boolean
}

export function PhaseIndicator({ phase, gameEnded }: Props) {
  const currentIdx = PHASES.findIndex((p) => p.key === phase)

  return (
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
  )
}
