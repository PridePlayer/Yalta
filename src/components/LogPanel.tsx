import { useEffect, useRef } from 'react'
import { useGameState } from '../state/gameStore'
import type { LogEntry } from '@shared/domain/types'

const KIND_TAG: Record<LogEntry['kind'], string> = {
  info: '讯',
  action: '令',
  result: '报',
  crisis: '急',
}

const PHASE_LABEL: Record<LogEntry['phase'], string> = {
  TOPIC: '议程',
  VENUE: '会场',
  MILITARY: '军议',
  CRISIS: '危机',
  PRESS: '记者会',
}

// 按会期分组，便于在日志中插入会期分隔线
function groupBySession(logs: LogEntry[]): { session: number; entries: LogEntry[] }[] {
  const groups: { session: number; entries: LogEntry[] }[] = []
  for (const log of logs) {
    let g = groups.find((x) => x.session === log.session)
    if (!g) {
      g = { session: log.session, entries: [] }
      groups.push(g)
    }
    g.entries.push(log)
  }
  return groups
}

export function LogPanel() {
  const state = useGameState()
  const scrollRef = useRef<HTMLDivElement>(null)
  const logs = state?.logs ?? [] // 正序，最新在底部
  const groups = groupBySession(logs)

  // 新日志自动滚到底
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs.length])

  return (
    <div className="panel panel-log">
      <div className="panel-heading">
        <span className="heading-ornament">❦</span>
        <h2>电报机 · 会议纪事</h2>
        <span className="heading-ornament">❦</span>
      </div>

      <div className="ticker-strip">
        <span className="ticker-dot" />
        <span className="ticker-text">接收中 · 利瓦季亚宫专线</span>
      </div>

      <div className="log-scroll" ref={scrollRef}>
        {groups.map((g) => (
          <div key={g.session} className="log-session">
            <div className="log-session-divider">
              <span className="divider-line" />
              <span className="divider-text">第 {g.session} 会期</span>
              <span className="divider-line" />
            </div>
            {g.entries.map((log) => (
              <div key={log.id} className={`log-tick log-tick-${log.kind}`}>
                <span className="tick-tag">{KIND_TAG[log.kind]}</span>
                <span className="tick-body">
                  <span className="tick-phase">{PHASE_LABEL[log.phase]}</span>
                  <span className="tick-text">{log.text}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
        <div className="log-cursor">▍</div>
      </div>
    </div>
  )
}
