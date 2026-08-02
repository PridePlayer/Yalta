import { useEffect, useState } from 'react'
import { useAnnouncement } from '../net/client'

const SEEN_KEY = 'yalta_announcement_seen'

// 全服公告：服务器后台 data/announcement.txt 配置，保存后最多数秒全员可见。
// 以「可点击浮标 + 弹出悬浮窗」形式呈现：存在公告时显示浮标，点击展开悬浮窗，
// 点击「收起」或遮罩关闭。新公告到达（文本变化）时自动弹出一次。
export default function ServerAnnouncement() {
  const text = useAnnouncement()
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState<string>(() => {
    try {
      return localStorage.getItem(SEEN_KEY) ?? ''
    } catch {
      return ''
    }
  })

  // 公告文本变化（含首次出现）→ 自动弹出一次
  useEffect(() => {
    if (text && text !== seen) {
      setOpen(true)
    }
  }, [text, seen])

  if (!text) return null

  function dismiss() {
    setOpen(false)
    setSeen(text)
    try {
      localStorage.setItem(SEEN_KEY, text)
    } catch {
      /* ignore */
    }
  }

  const isNew = text !== seen

  return (
    <>
      {/* 浮标：仅当公告存在时显示，提示可点击弹出 */}
      <button
        type="button"
        className="ann-fab"
        onClick={() => setOpen((v) => !v)}
        aria-label="全服公告"
        title="全服公告"
      >
        <span className="ann-fab-icon">📢</span>
        <span className="ann-fab-text">公告</span>
        {isNew && !open && <span className="ann-fab-dot" />}
      </button>

      {open && (
        <div className="ann-overlay" onClick={dismiss}>
          <div
            className="ann-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ann-modal-head">
              <span className="ann-modal-stamp">全服公告</span>
              <button type="button" className="ann-modal-close" onClick={dismiss} aria-label="收起">
                ✕
              </button>
            </div>
            <div className="ann-modal-body">{text}</div>
            <div className="ann-modal-foot">
              <button type="button" className="ann-modal-collapse" onClick={dismiss}>
                收起
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
