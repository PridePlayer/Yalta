// 协议面板（rules.md §4）：展示草案 / 已签协议、受益分配、签署进度，
// 以及各国战略目标的达成情况（§6.2）

import { useGameState } from '../state/gameStore'
import { PROTOCOL_TOPIC_LABEL } from '@shared/domain/types'
import type { Protocol, Nation } from '@shared/domain/types'

const NATION_LABEL: Record<Nation, string> = { US: '美', UK: '英', SU: '苏' }
const ALL_NATIONS: Nation[] = ['US', 'UK', 'SU']

const STATUS_LABEL: Record<Protocol['status'], string> = {
  PROPOSED: '待签',
  SIGNED: '已签',
  REJECTED: '作废',
}

export function ProtocolPanel() {
  const state = useGameState()
  if (!state) return null

  const maxAbs = Math.max(20, ...state.protocols.flatMap((p) => ALL_NATIONS.map((n) => Math.abs(p.beneficiary[n]))))

  return (
    <div className="panel protocol-panel">
      <div className="panel-header">
        <span className="panel-title">协议 · 战略目标</span>
        <span className="panel-sub">§4 协议系统</span>
      </div>

      {/* 协议列表 */}
      <div className="protocol-list">
        {state.protocols.length === 0 && (
          <div className="protocol-empty">尚无协议提案。于分会场或危机阶段，队长可拟定草案。</div>
        )}
        {state.protocols.map((p) => (
          <div key={p.id} className={`protocol-item status-${p.status.toLowerCase()}`}>
            <div className="protocol-item-head">
              <span className="protocol-name">《{p.title}》</span>
              <span className={`protocol-status status-${p.status.toLowerCase()}`}>{STATUS_LABEL[p.status]}</span>
            </div>
            <div className="protocol-item-meta">
              {PROTOCOL_TOPIC_LABEL[p.topic]} · 激进 {p.radicalness}{p.secret ? ' · 密约' : ''}
            </div>
            <div className="protocol-bars">
              {ALL_NATIONS.map((n) => {
                const v = p.beneficiary[n]
                const pct = (Math.abs(v) / maxAbs) * 50
                const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero'
                return (
                  <div key={n} className="pbar-row">
                    <span className="pbar-nation">{NATION_LABEL[n]}</span>
                    <div className="pbar-track">
                      <div className={`pbar-fill ${cls}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="pbar-val">{v > 0 ? '+' : ''}{v}</span>
                  </div>
                )
              })}
            </div>
            <div className="protocol-sigs">
              {p.signatories.map((n) => (
                <span key={n} className={`sig-dot ${p.agreed.includes(n) ? 'on' : ''}`} title={`${NATION_LABEL[n]}方${p.agreed.includes(n) ? '已签' : '待签'}`}>
                  {NATION_LABEL[n]}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 战略目标达成 */}
      <div className="goals-block">
        <div className="goals-title">战略目标达成</div>
        {ALL_NATIONS.map((n) => {
          const goals = state.achievedGoals[n]
          return (
            <div key={n} className="goal-row">
              <span className="goal-nation">{NATION_LABEL[n]}方</span>
              <span className="goal-count">
                {n === 'US' ? 3 : n === 'UK' ? 3 : 3} 项中 {goals.length} 达成
              </span>
              <div className="goal-tags">
                {goals.length === 0 && <span className="goal-tag none">尚无</span>}
                {goals.map((g) => (
                  <span key={g} className="goal-tag done">{g}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
