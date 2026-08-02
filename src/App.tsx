import { useState, useRef, useEffect, type RefObject } from 'react'
import { useGameState } from './state/gameStore'
import { useConnection, useRoom, useSelf } from './net/client'
import { MetricsPanel } from './components/MetricsPanel'
import { EventChainsPanel } from './components/EventChainsPanel'
import { ActionCard } from './components/ActionCard'
import { Lobby } from './components/Lobby'
import { IntelDrawer } from './components/IntelDrawer'
import { PhaseIndicator } from './components/PhaseIndicator'
import { SessionDots } from './components/SessionDots'
import { TurnIndicator } from './components/TurnIndicator'
import { Tutorial } from './components/Tutorial'
import { VenueMap } from './components/VenueMap'
import { ProtocolPanel } from './components/ProtocolPanel'
import { SettlementScreen } from './components/SettlementScreen'
import { LogPanel } from './components/LogPanel'
import { TopNewsTicker } from './components/TopNewsTicker'
import ServerAnnouncement from './components/ServerAnnouncement'
import { roleLabel } from '@shared/protocol'

const SESSION_DATE = ['1945.02.04', '1945.02.05', '1945.02.06', '1945.02.07', '1945.02.08', '1945.02.09', '1945.02.10']

export default function App() {
  const { status } = useConnection()
  const room = useRoom()
  const state = useGameState()
  const self = useSelf()

  // ⚠️ 所有 Hook 必须在任何提前 return 之前、以固定顺序调用（React Hooks 规则）。
  // 之前 useState/useRef 写在 inLobby 的提前 return 之后，导致大厅态只跑 4 个 Hook、
  // 进入游戏后变成 11 个，触发 “Rendered more hooks” 崩溃、页面只剩横杠。
  const [mobileTab, setMobileTab] = useState('cards')
  const [showTutorial, setShowTutorial] = useState(false)
  const mapRef = useRef<HTMLDivElement>(null)
  const cardsRef = useRef<HTMLDivElement>(null)
  const eventsRef = useRef<HTMLDivElement>(null)
  const protocolRef = useRef<HTMLDivElement>(null)
  const logRef = useRef<HTMLDivElement>(null)

  // 未连接 / 连接中 / 已连接但游戏未开始 → 显示大厅
  const inLobby = status !== 'connected' || !room || !room.started

  // 首次进入游戏自动弹出新手教程（localStorage 记忆，可随时点「?」重看）
  useEffect(() => {
    if (!inLobby) {
      let seen = false
      try {
        seen = localStorage.getItem('yalta_tutorial_seen') === '1'
      } catch {
        seen = false
      }
      if (!seen) setShowTutorial(true)
    }
  }, [inLobby])

  function closeTutorial() {
    setShowTutorial(false)
    try {
      localStorage.setItem('yalta_tutorial_seen', '1')
    } catch {
      /* ignore */
    }
  }
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

  // 移动端底部 Tab 导航：点击平滑滚动到对应区块
  const TABS = [
    { id: 'map', label: '会场', ref: mapRef },
    { id: 'cards', label: '行动', ref: cardsRef },
    { id: 'events', label: '事件链', ref: eventsRef },
    { id: 'protocol', label: '协议', ref: protocolRef },
    { id: 'log', label: '电报', ref: logRef as RefObject<HTMLElement> },
  ]
  const gotoTab = (id: string, ref: RefObject<HTMLElement>) => {
    setMobileTab(id)
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="app">
      {/* 整页最顶部：最新电报「新闻字幕式」滚动通知 */}
      <TopNewsTicker />

      {/* 全服公告：服务器后台配置，所有玩家在游戏中可见 */}
      <ServerAnnouncement />

      {/* 顶部：会期 + 阶段流程指示器 */}
      <header className="masthead">
        <div className="masthead-title-row">
          <div className="masthead-title-block">
            <span className="title-cn">雅尔塔会议</span>
            <SessionDots session={state.session} />
          </div>
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
            <button
              type="button"
              className="masthead-help"
              onClick={() => setShowTutorial(true)}
              aria-label="查看教程"
              title="查看教程"
            >
              ?
            </button>
          </div>
        </div>
        <PhaseIndicator phase={state.phase} gameEnded={state.gameEnded} />
        <TurnIndicator phase={state.phase} phaseStartedAt={state.phaseStartedAt} gameEnded={state.gameEnded} />
      </header>

      {/* 主区：填满视口的多栏仪表盘（整页不滚动，仅栏内按需滚动） */}
      <main className="app-body">
        <div className="game-col col-left" ref={mapRef}>
          <VenueMap phase={state.phase} session={state.session} />
          <MetricsPanel />
        </div>

        <div className="game-col col-center" ref={cardsRef}>
          <ActionCard />
        </div>

        <div className="game-col col-right">
          <div className="game-section" ref={eventsRef}>
            <EventChainsPanel />
          </div>
          <div className="game-section" ref={protocolRef}>
            <ProtocolPanel />
          </div>
          <div className="game-section" ref={logRef}>
            <LogPanel />
          </div>
        </div>
      </main>

      {/* 移动端底部 Tab 导航 */}
      <nav className="mobile-tabbar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab-btn ${mobileTab === t.id ? 'active' : ''}`}
            onClick={() => gotoTab(t.id, t.ref as RefObject<HTMLElement>)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* 私密情报抽屉（窃听方可见） */}
      <IntelDrawer />

      {/* 结算总览（第 7 会期闭幕时覆盖展示） */}
      <SettlementScreen />

      {/* 新手教程（首次进入自动弹出；可点报头「?」重看） */}
      <Tutorial open={showTutorial} onClose={closeTutorial} />
    </div>
  )
}
