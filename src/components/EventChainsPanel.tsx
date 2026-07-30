import { useGameState } from '../state/gameStore'
import type { EventChainStatus, PolandUprisingPhase } from '@shared/domain/types'

// 注：本组件依赖 useGameState()，但 useGameState() 可能返回 null（未连接/未开始）
// 因此组件先判空再读取，由 App.tsx 在状态就绪后才挂载本组件以保证不会渲染空状态

const STATUS_TONE: Record<EventChainStatus, string> = {
  DORMANT: '#786850',
  ACTIVE: '#c9a961',
  RESOLVED: '#3a6b3a',
  FAILED: '#8b2c2c',
}

const STATUS_LABEL: Record<EventChainStatus, string> = {
  DORMANT: '蛰伏',
  ACTIVE: '激化',
  RESOLVED: '已决',
  FAILED: '溃败',
}

const POLAND_PHASE_LABEL: Record<PolandUprisingPhase, string> = {
  DORMANT: '蛰伏',
  OUTBREAK: '爆发',
  ESCALATION: '升级',
  RESOLUTION: '终局',
}

function ChainCard({
  title,
  status,
  children,
}: {
  title: string
  status: EventChainStatus
  children?: React.ReactNode
}) {
  return (
    <div className="chain-card">
      <div className="chain-header">
        <span className="chain-title">{title}</span>
        <span className="chain-status" style={{ color: STATUS_TONE[status], borderColor: STATUS_TONE[status] }}>
          {STATUS_LABEL[status]}
        </span>
      </div>
      {children && <div className="chain-body">{children}</div>}
    </div>
  )
}

export function EventChainsPanel() {
  const state = useGameState()
  if (!state) return null
  const { stalinArchive, polandUprising, ukElection, petitions } = state
  // SerializableGameState 中 status/phase 是 string，组件层强转为枚举
  const stalinStatus = stalinArchive.status as EventChainStatus
  const polandStatus = polandUprising.status as EventChainStatus
  const polandPhase = polandUprising.phase as PolandUprisingPhase
  const ukStatus = ukElection.status as EventChainStatus
  const petitionStatus: EventChainStatus = petitions.colonyUprisingTriggered
    ? 'FAILED'
    : petitions.pending.length > 0
      ? 'ACTIVE'
      : 'DORMANT'

  return (
    <div className="panel panel-chains">
      <div className="panel-heading">
        <span className="heading-ornament">❦</span>
        <h2>暗流·事件链</h2>
        <span className="heading-ornament">❦</span>
      </div>

      <div className="chains-list">
        {/* 斯大林情报库 */}
        <ChainCard title="斯大林情报库" status={stalinStatus}>
          <div className="chain-row">
            <span>苏联信誉</span>
            <span className="chain-val">{stalinArchive.sovietCredibility}</span>
          </div>
          {stalinArchive.backlashTurns > 0 && (
            <div className="chain-row chain-row-warn">
              <span>反噬剩余</span>
              <span className="chain-val">{stalinArchive.backlashTurns} 会期</span>
            </div>
          )}
          {stalinArchive.invoked && <div className="chain-note">已调用，不可复用</div>}
        </ChainCard>

        {/* 波兰起义 */}
        <ChainCard title="波兰起义" status={polandStatus}>
          <div className="chain-row">
            <span>当前阶段</span>
            <span className="chain-val">{POLAND_PHASE_LABEL[polandPhase]}</span>
          </div>
          <div className="chain-row">
            <span>波兰讨论</span>
            <span className="chain-val">{polandUprising.polandDiscussedSessions} 会期</span>
          </div>
          {polandUprising.resolution && (
            <div className="chain-note chain-note-resolved">{polandUprising.resolution}</div>
          )}
        </ChainCard>

        {/* 英国大选 */}
        <ChainCard title="英国大选" status={ukStatus}>
          <div className="chain-row">
            <span>倒计时</span>
            <span className="chain-val">{ukElection.countdown} 会期</span>
          </div>
          <div className="chain-row">
            <span>工党民调</span>
            <span className="chain-bar-mini">
              <span
                className="chain-bar-mini-fill"
                style={{
                  width: `${ukElection.laborPolling}%`,
                  background: ukElection.laborPolling >= 60 ? '#8b2c2c' : ukElection.laborPolling >= 50 ? '#a8732c' : '#6b6b3a',
                }}
              />
            </span>
            <span className="chain-val">{ukElection.laborPolling}%</span>
          </div>
          {ukElection.churchillRetired && <div className="chain-note chain-note-resolved">丘吉尔已退出，艾登接任</div>}
          {ukElection.churchillAway && !ukElection.churchillRetired && (
            <div className="chain-row chain-row-warn">
              <span>丘吉尔</span>
              <span className="chain-val">离场竞选</span>
            </div>
          )}
        </ChainCard>

        {/* 抗议信 */}
        <ChainCard title="抗议请愿" status={petitionStatus}>
          <div className="chain-row">
            <span>待处理</span>
            <span className="chain-val">{petitions.pending.length} 封</span>
          </div>
          <div className="chain-row">
            <span>已处理</span>
            <span className="chain-val">{petitions.historyCount} 封</span>
          </div>
          {petitions.consecutiveColonyIgnored > 0 && (
            <div className={`chain-row ${petitions.consecutiveColonyIgnored >= 2 ? 'chain-row-warn' : ''}`}>
              <span>殖民地连续忽略</span>
              <span className="chain-val">{petitions.consecutiveColonyIgnored}</span>
            </div>
          )}
          {petitions.colonyUprisingTriggered && (
            <div className="chain-note chain-note-crisis">殖民地起义已爆发！</div>
          )}
        </ChainCard>
      </div>
    </div>
  )
}
