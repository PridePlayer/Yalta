import { useGameState, getPhaseName } from './state/gameStore'
import { useConnection, useRoom } from './net/client'
import { MetricsPanel } from './components/MetricsPanel'
import { EventChainsPanel } from './components/EventChainsPanel'
import { ActionPanel } from './components/ActionPanel'
import { LogPanel } from './components/LogPanel'
import { Lobby } from './components/Lobby'
import { IntelPanel } from './components/IntelPanel'

const SESSION_DATE = ['1945.02.04', '1945.02.05', '1945.02.06', '1945.02.07', '1945.02.08', '1945.02.09', '1945.02.10']

export default function App() {
  const { status } = useConnection()
  const room = useRoom()
  const state = useGameState()

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
      <header className="masthead">
        <div className="masthead-rule" />
        <h1 className="masthead-title">
          <span className="title-cn">雅尔塔会议</span>
          <span className="title-en">THE YALTA CONFERENCE · 1945</span>
        </h1>
        <div className="masthead-rule" />
        <div className="masthead-meta">
          <span className="meta-date">{SESSION_DATE[state.session - 1]}</span>
          <span className="meta-sep">·</span>
          <span>第 {state.session} 会期 / 共 7 期</span>
          <span className="meta-sep">·</span>
          <span className="meta-phase">{getPhaseName(state.phase)}</span>
          <span className="meta-sep">·</span>
          <span className="meta-room">房间 {room.code}</span>
        </div>
      </header>

      <main className="app-main">
        <MetricsPanel />
        <EventChainsPanel />
        <ActionPanel />
        <LogPanel />
      </main>

      <footer className="app-footer">
        <span>利瓦季亚宫 · 克里米亚 · 黑海之滨</span>
      </footer>

      {/* 私密情报浮层（仅窃听方收到） */}
      <IntelPanel />
    </div>
  )
}
