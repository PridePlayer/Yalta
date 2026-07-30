// 私密情报浮层：展示本玩家收到的窃听情报，逐条可关闭

import { usePrivateIntels, dismissIntel } from '../net/client'

export function IntelPanel() {
  const intels = usePrivateIntels()
  if (intels.length === 0) return null

  return (
    <div className="intel-stack">
      {intels.map((intel) => (
        <div key={intel.id} className="intel-card">
          <div className="intel-header">
            <span className="intel-stamp">
              {intel.tier === 'FULL' ? '完整情报' : '部分情报'}
            </span>
            <span className="intel-meta">
              第 {intel.session} 会期 · {intel.venueName}
            </span>
            <button
              type="button"
              className="intel-close"
              onClick={() => dismissIntel(intel.id)}
              aria-label="关闭"
            >
              ×
            </button>
          </div>
          <p className="intel-body">{intel.content}</p>
        </div>
      ))}
    </div>
  )
}
