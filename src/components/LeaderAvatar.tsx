// 三巨头头像：真实肖像照片（圆形裁切）+ 国色描边 + 状态指示

import type { Nation } from '@shared/domain/types'

interface Props {
  nation: Nation
  /** 头像尺寸（px） */
  size?: number
  /** 是否离场（中断参会/去世/被替换） */
  absent?: boolean
  /** 是否当前发言人 */
  active?: boolean
}

const NATION_META: Record<Nation, { color: string; name: string; portrait: string }> = {
  US: { color: '#3a6ea5', name: '罗斯福', portrait: '/photos/FDR-portrait.jpg' },
  UK: { color: '#8b2c2c', name: '丘吉尔', portrait: '/photos/churchill-portrait.jpg' },
  SU: { color: '#a83232', name: '斯大林', portrait: '/photos/stalin-portrait.jpg' },
}

export function LeaderAvatar({ nation, size = 48, absent = false, active = false }: Props) {
  const meta = NATION_META[nation]
  return (
    <div
      className={`leader-avatar ${absent ? 'absent' : ''} ${active ? 'active' : ''}`}
      style={{ width: size, height: size, borderColor: meta.color }}
      role="img"
      aria-label={`${meta.name}头像`}
    >
      <img className="leader-avatar-img" src={meta.portrait} alt={meta.name} loading="lazy" />
      {active && <span className="leader-avatar-ring" style={{ borderColor: meta.color }} />}
      {absent && <span className="leader-avatar-slash" />}
    </div>
  )
}
