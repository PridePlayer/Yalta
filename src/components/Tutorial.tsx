// 新手教程：多步引导浮层。
// 由 App 控制开合（首次进入游戏自动弹出一次，之后可点报头「?」重看）。

import { useEffect, useState } from 'react'

interface Props {
  open: boolean
  onClose: () => void
}

const STEPS: { title: string; body: string[] }[] = [
  {
    title: '欢迎来到雅尔塔',
    body: [
      '1945 年 2 月，黑海之滨的利瓦季亚宫。美、英、苏三巨头在此博弈战后世界秩序。',
      '你将作为一方代表，在七天的会议中纵横捭阖——调兵、窃听、缔约、应对危机。',
    ],
  },
  {
    title: '你的身份',
    body: [
      '三巨头队长（罗斯福 / 丘吉尔 / 斯大林）：可推进议程、拟定与签署协议，是会议的主导者。',
      '幕僚（军事官 / 情报官）：受命于本国，签发军令或潜入他国会场窃听。',
      '旁观者：静观全局，不参与裁决。',
    ],
  },
  {
    title: '会议流程',
    body: [
      '会议共 7 个会期，每会期分 5 个阶段：议程 → 分会场 → 军议 → 危机 → 记者会。',
      '阶段由队长手动推进（顶部「推动议程 ▸」按钮）。本游戏是「阶段制」——同一阶段内相关玩家可同时行动，并非轮流制。',
    ],
  },
  {
    title: '如何行动',
    body: [
      '中间栏「决断之厅」列出你本阶段可签发的动作卡。卡片置灰表示本阶段你无权限或无可行动作。',
      '点击卡片展开表单，填写后用印发出。顶部有倒计时提示本阶段剩余时间，以及「本阶段行动方」提示谁该出手。',
    ],
  },
  {
    title: '情报与协议',
    body: [
      '情报官在「分会场」阶段可潜入他国会场窃听；苏联有主场优势，部分情报免费获取。窃得内容仅你可见（私密情报浮层）。',
      '队长可在分会场 / 危机阶段拟定协议草案，邀约签署方；各方用印同意即生效，影响战后格局。',
    ],
  },
  {
    title: '事件链',
    body: [
      '罗斯福健康、斯大林情报库、波兰起义、英国大选、抗议信等事件会随会议推进触发。',
      '相关动作卡会自动出现在你的「决断之厅」中（如苏方应对波兰、队长处理请愿）。留意右侧事件链面板。',
    ],
  },
  {
    title: '界面导览',
    body: [
      '顶部：全服公告（📢 浮标）、会期与阶段、本阶段倒计时。',
      '左侧：会场地图与各国国情简报。右侧：事件链 / 协议 / 电报机。',
      '私密情报会作为右下浮层推送到你。随时点右上角「?」可重看本教程。祝会议顺利。',
    ],
  },
]

export function Tutorial({ open, onClose }: Props) {
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (open) setStep(0)
  }, [open])

  // 打开时禁止底层滚动
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const total = STEPS.length
  const current = STEPS[step]
  const isLast = step === total - 1

  return (
    <div className="tut-overlay" onClick={onClose}>
      <div className="tut-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="tut-head">
          <span className="tut-stamp">与会须知</span>
          <button type="button" className="tut-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <div className="tut-body">
          <h2 className="tut-title">{current.title}</h2>
          {current.body.map((p, i) => (
            <p key={i} className="tut-para">
              {p}
            </p>
          ))}
        </div>

        <div className="tut-dots">
          {STEPS.map((_, i) => (
            <span key={i} className={`tut-dot ${i === step ? 'active' : ''} ${i < step ? 'done' : ''}`} />
          ))}
        </div>

        <div className="tut-foot">
          <button type="button" className="tut-btn tut-skip" onClick={onClose}>
            {isLast ? '开始会议' : '跳过'}
          </button>
          <div className="tut-nav">
            <button
              type="button"
              className="tut-btn"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              上一步
            </button>
            <button
              type="button"
              className="tut-btn tut-primary"
              onClick={() => (isLast ? onClose() : setStep((s) => Math.min(total - 1, s + 1)))}
            >
              {isLast ? '开始会议' : '下一步'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
