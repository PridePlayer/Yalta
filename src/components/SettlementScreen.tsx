// 结算总览（rules.md §6）：游戏结束时展示各国胜利分、战略目标、
// 特殊结局与最终叙事

import { useGameState } from '../state/gameStore'
import { resetGame } from '../state/gameStore'
import type { Nation, VictoryResult, NationVictoryScore } from '@shared/domain/types'

const NATION_LABEL: Record<Nation, string> = { US: '美方', UK: '英方', SU: '苏方' }
const ALL_NATIONS: Nation[] = ['US', 'UK', 'SU']

function outcomeBanner(r: VictoryResult): { text: string; cls: string } {
  switch (r.outcome) {
    case 'SHARED':
      return { text: '完美雅尔塔 · 共同胜利', cls: 'out-shared' }
    case 'ALL_LOSE':
      return { text: '第三次世界大战 · 全员失败', cls: 'out-lose' }
    case 'DRAW':
      return { text: '势均力敌 · 难分高下', cls: 'out-draw' }
    default:
      return { text: `${NATION_LABEL[r.outcome as Nation]}占据上风`, cls: `out-${r.outcome as Nation}` }
  }
}

function ScoreCard({ s }: { s: NationVictoryScore }) {
  const b = s.breakdown
  return (
    <div className={`score-card nation-${s.nation}`}>
      <div className="score-head">
        <span className="score-nation">{NATION_LABEL[s.nation]}</span>
        <span className="score-total">{s.victoryScore}</span>
      </div>
      <div className="score-breakdown">
        <div className="sb-row"><span>民众支持</span><span>{b.publicSupport >= 0 ? '+' : ''}{b.publicSupport}</span></div>
        <div className="sb-row"><span>反对派压力</span><span>{b.oppositionPressure >= 0 ? '+' : ''}{b.oppositionPressure}</span></div>
        <div className="sb-row"><span>殖民地动荡</span><span>{b.colonyUnrest >= 0 ? '+' : ''}{b.colonyUnrest}</span></div>
        <div className="sb-row"><span>战略目标</span><span>+{b.achievedGoals}</span></div>
        <div className="sb-row"><span>有利条约</span><span>+{b.favorableTreaties}</span></div>
        {b.penalties !== 0 && (
          <div className="sb-row penalty"><span>特殊惩罚</span><span>{b.penalties}</span></div>
        )}
      </div>
      <div className="score-goals">
        <span className="sg-label">已达成目标（{s.achievedGoals.length}）</span>
        <div className="sg-tags">
          {s.achievedGoals.length === 0 && <span className="sg-none">无</span>}
          {s.achievedGoals.map((g) => (
            <span key={g} className="sg-tag">{g}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

export function SettlementScreen() {
  const state = useGameState()
  if (!state || !state.gameEnded || !state.settlement) return null
  const r = state.settlement
  const banner = outcomeBanner(r)

  return (
    <div className="settlement-overlay">
      <div className="settlement-card">
        <div className={`settlement-banner ${banner.cls}`}>{banner.text}</div>
        <h2 className="settlement-title">{r.endingTitle}</h2>
        <p className="settlement-text">{r.endingText}</p>

        <div className="score-grid">
          {ALL_NATIONS.map((n) => (
            <ScoreCard key={n} s={r.scores[n]} />
          ))}
        </div>

        {r.specialEndings.length > 0 && (
          <div className="special-endings">
            <div className="se-title">特殊结局</div>
            <ul>
              {r.specialEndings.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="settlement-actions">
          <button className="btn-advance" onClick={() => resetGame(20250204)}>
            重启会议
          </button>
        </div>
        <div className="settlement-foot">雅尔塔的风，吹过七日的谈判桌。历史，已在此刻定格。</div>
      </div>
    </div>
  )
}
