// 私密情报抽屉：右侧滑出，窃听所得情报按会期归档

import { useState } from 'react'
import { usePrivateIntels, dismissIntel } from '../net/client'

export function IntelDrawer() {
  const intels = usePrivateIntels()
  const [open, setOpen] = useState(false)

  // 没有情报时不显示入口
  if (intels.length === 0) return null

  // 按会期分组
  const bySession = new Map<number, typeof intels>()
  for (const i of intels) {
    const list = bySession.get(i.session) ?? []
    list.push(i)
    bySession.set(i.session, list)
  }

  return (
    <>
      {/* 抽屉入口按钮（右下角） */}
      {!open && (
        <button
          className="intel-fab"
          onClick={() => setOpen(true)}
          aria-label="私密情报"
        >
          <span className="intel-fab-icon">✉</span>
          <span className="intel-fab-count">{intels.length}</span>
        </button>
      )}

      {/* 抽屉面板 */}
      {open && (
        <div className="intel-drawer-overlay" onClick={() => setOpen(false)}>
          <div className="intel-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="intel-drawer-header">
              <h3>私密情报频道</h3>
              <button className="intel-drawer-close" onClick={() => setOpen(false)}>×</button>
            </div>
            <p className="intel-drawer-hint">仅你可见 · 窃听所得 · 阅后即焚</p>

            <div className="intel-drawer-body">
              {Array.from(bySession.entries())
                .sort((a, b) => b[0] - a[0])
                .map(([session, list]) => (
                  <div key={session} className="intel-session-group">
                    <div className="intel-session-divider">第 {session} 会期</div>
                    {list.map((intel) => (
                      <div key={intel.id} className="intel-card">
                        <div className="intel-header">
                          <span className="intel-stamp">
                            {intel.tier === 'FULL' ? '完整情报' : '部分情报'}
                          </span>
                          <span className="intel-meta">{intel.venueName}</span>
                          <button
                            className="intel-close"
                            onClick={() => dismissIntel(intel.id)}
                            aria-label="阅后即焚"
                          >
                            ×
                          </button>
                        </div>
                        <p className="intel-body">{intel.content}</p>
                      </div>
                    ))}
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
