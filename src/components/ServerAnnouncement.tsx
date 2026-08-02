import { useAnnouncement } from '../net/client'

// 全服公告横幅：服务器后台 data/announcement.txt 配置，保存后最多数秒全员可见。
// 仅在存在公告文本时渲染。
export default function ServerAnnouncement() {
  const text = useAnnouncement()
  if (!text) return null
  return (
    <div className="server-announcement" role="alert">
      <span className="sa-label">全服公告</span>
      <span className="sa-text">{text}</span>
    </div>
  )
}
