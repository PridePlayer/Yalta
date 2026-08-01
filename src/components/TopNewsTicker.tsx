import { useGameState } from '../state/gameStore'
import type { LogEntry } from '@shared/domain/types'

const PHASE_LABEL: Record<LogEntry['phase'], string> = {
  TOPIC: '议程',
  VENUE: '会场',
  MILITARY: '军议',
  CRISIS: '危机',
  PRESS: '记者会',
}

// 整页最顶部的「新闻字幕式」滚动通知：展示最新一条电报。
// 以最新消息 id 为 key，新消息到达时自动重新滚动（仿电视新闻底栏字幕）。
export function TopNewsTicker() {
  const state = useGameState()
  const logs = state?.logs ?? []
  const latest = logs.length ? logs[logs.length - 1] : null
  const crawlText = latest
    ? `${PHASE_LABEL[latest.phase]} · ${latest.text}`
    : '利瓦季亚宫专线 · 等待电报传入…'

  return (
    <div className="page-ticker">
      <span className="crawl-tag">快讯</span>
      <div className="crawl-viewport">
        <div className="crawl-track" key={latest?.id ?? 'empty'}>
          <span className="crawl-item">{crawlText}</span>
          <span className="crawl-item" aria-hidden>{crawlText}</span>
        </div>
      </div>
    </div>
  )
}
