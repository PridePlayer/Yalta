import { useGameState } from './state/gameStore'
import { useConnection, useRoom, useSelf } from './net/client'
import { MetricsPanel } from './components/MetricsPanel'
import { EventChainsPanel } from './components/EventChainsPanel'
import { ActionCard } from './components/ActionCard'
import { LogPanel } from './components/LogPanel'
import { Lobby } from './components/Lobby'
import { IntelDrawer } from './components/IntelDrawer'
import { PhaseIndicator } from './components/PhaseIndicator'
import { VenueMap } from './components/VenueMap'
import { roleLabel } from '@shared/protocol'

const SESSION_DATE = ['1945.02.04', '1945.02.05', '1945.02.06', '1945.02.07', '1945.02.08', '1945.02.09', '1945.02.10']

export default function App() {
  const { status } = useConnection()
  const room = useRoom()
  const state = useGameState()
  const self = useSelf()

  // 未连接 / 连接中 / 已连接但游戏未开始 → 显示大厅
  const inLobby = status !== 'connected' || !room || !room.started
  if (inLobby) {
    return <Lobby />
  }

  // 游戏已开始但状态尚未推送 → 加载中
  if (!state) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <p className="lobby-sub">会议厅正在布置…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      {/* 顶部：会期 + 阶段流程指示器 */}
      <header className="masthead">
        <div className="masthead-title-row">
          <span className="title-cn">雅尔塔会议</span>
          <div className="masthead-meta">
            <span className="meta-date">{SESSION_DATE[state.session - 1]}</span>
            <span className="meta-sep">·</span>
            <span>第 {state.session} / 7 期</span>
            <span className="meta-sep">·</span>
            <span className="meta-room">房 {room.code}</span>
            {self && (
              <>
                <span className="meta-sep">·</span>
                <span className="meta-role">{roleLabel(self.role)}</span>
              </>
            )}
          </div>
        </div>
        <PhaseIndicator phase={state.phase} session={state.session} gameEnded={state.gameEnded} />
      </header>

      {/* 主区：左地图 + 中卡牌 + 右侧栏 */}
      <main className="app-main">
        <aside className="app-left">
          <VenueMap phase={state.phase} session={state.session} />
          <MetricsPanel />
        </aside>

        <section className="app-center">
          <ActionCard />
        </section>

        <aside className="app-right">
          <EventChainsPanel />
        </aside>
      </main>

      {/* 底部：日志流 */}
      <footer className="app-bottom">
        <LogPanel />
      </footer>

      {/* 私密情报抽屉（窃听方可见） */}
      <IntelDrawer />
    </div>
  )
}
