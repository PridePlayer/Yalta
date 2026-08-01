import { useGameState } from '../state/gameStore'
import { STATUS_LABEL } from '@shared/engine/roosevelt'
import type { Nation, RooseveltStatus } from '@shared/domain/types'

// 注：useGameState() 可能返回 null，组件先判空再读取
// 由 App.tsx 在状态就绪后才挂载本组件

const NATION_LABEL: Record<Nation, string> = { US: '美利坚合众国', UK: '大不列颠', SU: '苏维埃联盟' }
const NATION_LEADER: Record<Nation, string> = { US: '罗斯福总统', UK: '丘吉尔首相', SU: '斯大林元帅' }
const NATION_COLOR: Record<Nation, string> = { US: '#3a6ea5', UK: '#8b2c2c', SU: '#a83232' }

const NATION_FLAG: Record<Nation, string> = {
  US: '/photos/Flag_of_the_United_States_(1912-1959).svg',
  UK: '/photos/Flag_of_the_United_Kingdom.svg',
  SU: '/photos/Flag_of_the_Soviet_Union.svg',
}

const STATUS_TONE: Record<RooseveltStatus, string> = {
  STABLE: '#3a6b3a',
  DECLINING: '#a8732c',
  CRITICAL: '#8b2c2c',
  DECEASED: '#5a3a3a',
}

function MetricRow({ label, value, max = 100, danger }: { label: string; value: number; max?: number; danger?: boolean }) {
  const pct = (value / max) * 100
  const tone = danger
    ? pct > 60 ? '#8b2c2c' : pct > 30 ? '#a8732c' : '#3a6b3a'
    : pct > 60 ? '#3a6b3a' : pct > 30 ? '#a8732c' : '#8b2c2c'
  return (
    <div className="brief-row">
      <span className="brief-label">{label}</span>
      <span className="brief-bar">
        <span className="brief-bar-fill" style={{ width: `${pct}%`, background: tone }} />
      </span>
      <span className="brief-num">{value}</span>
    </div>
  )
}

export function MetricsPanel() {
  const state = useGameState()
  if (!state) return null
  const rooseveltStatus = state.roosevelt.status as RooseveltStatus
  return (
    <div className="panel panel-brief">
      <div className="panel-heading">
        <span className="heading-ornament">❦</span>
        <h2>国情简报</h2>
        <span className="heading-ornament">❦</span>
      </div>

      <div className="global-brief">
        <div className="brief-row brief-row-wide">
          <span className="brief-label">国际舆论</span>
          <span className="brief-bar">
            <span className="brief-bar-fill" style={{ width: `${state.intlOpinion}%`, background: state.intlOpinion > 60 ? '#8b2c2c' : state.intlOpinion > 30 ? '#a8732c' : '#3a6b3a' }} />
          </span>
          <span className="brief-num">{state.intlOpinion}</span>
        </div>
        <div className="brief-row brief-row-wide">
          <span className="brief-label">罗斯福健康</span>
          <span className="brief-bar">
            <span className="brief-bar-fill" style={{ width: `${state.rooseveltHealth}%`, background: state.rooseveltHealth > 60 ? '#3a6b3a' : state.rooseveltHealth > 30 ? '#a8732c' : '#8b2c2c' }} />
          </span>
          <span className="brief-num">{state.rooseveltHealth}</span>
        </div>

        {/* 罗斯福健康事件链状态 */}
        <div className="roosevelt-status">
          <span className="status-tag" style={{ color: STATUS_TONE[rooseveltStatus], borderColor: STATUS_TONE[rooseveltStatus] }}>
            {state.roosevelt.trumanSucceeded ? '杜鲁门继任' : STATUS_LABEL[rooseveltStatus]}
          </span>
          {rooseveltStatus !== 'DECEASED' && (
            <span className="status-vigor">精力 {state.roosevelt.vigorPoints}</span>
          )}
        </div>

        {/* 最新医疗简报 */}
        {state.medicalBulletins.length > 0 && rooseveltStatus !== 'DECEASED' && (
          <div className={`medical-bulletin ${state.medicalBulletins[state.medicalBulletins.length - 1].urgent ? 'urgent' : ''}`}>
            <span className="bulletin-label">最新简报</span>
            <span className="bulletin-text">{state.medicalBulletins[state.medicalBulletins.length - 1].assessment}</span>
          </div>
        )}
      </div>

      <div className="delegations">
        {(['US', 'UK', 'SU'] as Nation[]).map((n) => (
          <div key={n} className="delegation-card" style={{ borderColor: NATION_COLOR[n] }}>
            <div className="delegation-header" style={{ borderLeft: `3px solid ${NATION_COLOR[n]}` }}>
              <img className="delegation-flag" src={NATION_FLAG[n]} alt={NATION_LABEL[n]} />
              <div className="delegation-header-text">
                <span className="delegation-name">{NATION_LABEL[n]}</span>
                <span className="delegation-leader">{NATION_LEADER[n]}</span>
              </div>
            </div>
            <div className="delegation-body">
              <MetricRow label="民望" value={state.metrics[n].publicSupport} />
              <MetricRow label="情报" value={state.metrics[n].intelPoints} max={30} />
              <MetricRow label="反对派" value={state.metrics[n].oppositionPressure} danger />
              <MetricRow label="殖民地" value={state.metrics[n].colonyUnrest} danger />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
