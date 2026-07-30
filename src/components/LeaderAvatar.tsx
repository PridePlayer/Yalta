// 三巨头头像：SVG 圆形头像 + 国徽 + 状态指示

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

const NATION_META: Record<Nation, { color: string; name: string; initial: string; emblem: string }> = {
  US: { color: '#3a6ea5', name: '罗斯福', initial: 'FDR', emblem: '★' },
  UK: { color: '#8b2c2c', name: '丘吉尔', initial: 'WSC', emblem: '✦' },
  SU: { color: '#a83232', name: '斯大林', initial: 'JVS', emblem: '☭' },
}

export function LeaderAvatar({ nation, size = 48, absent = false, active = false }: Props) {
  const meta = NATION_META[nation]
  const r = size / 2 - 2

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`leader-avatar ${absent ? 'absent' : ''} ${active ? 'active' : ''}`}
      role="img"
      aria-label={`${meta.name}头像`}
    >
      {/* 外环：国色 + 活跃脉动 */}
      {active && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r + 2}
          fill="none"
          stroke={meta.color}
          strokeWidth="1.5"
          opacity="0.6"
        >
          <animate attributeName="r" values={`${r + 1};${r + 4};${r + 1}`} dur="1.6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.1;0.6" dur="1.6s" repeatCount="indefinite" />
        </circle>
      )}

      {/* 主圆 */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill={`url(#grad-${nation})`}
        stroke={meta.color}
        strokeWidth={active ? 2 : 1}
        opacity={absent ? 0.35 : 1}
      />

      {/* 渐变定义 */}
      <defs>
        <radialGradient id={`grad-${nation}`} cx="35%" cy="30%">
          <stop offset="0%" stopColor="#3a2a1a" />
          <stop offset="100%" stopColor={meta.color} stopOpacity="0.7" />
        </radialGradient>
      </defs>

      {/* 国徽符号 */}
      <text
        x={size / 2}
        y={size / 2 - 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.32}
        fill="#f0e4c8"
        fontFamily="Georgia, serif"
      >
        {meta.emblem}
      </text>

      {/* 姓名首字母 */}
      <text
        x={size / 2}
        y={size / 2 + size * 0.22}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={size * 0.16}
        fill="#f0e4c8"
        fontFamily="Georgia, serif"
        letterSpacing="1"
      >
        {meta.initial}
      </text>

      {/* 离场斜杠 */}
      {absent && (
        <line
          x1="4"
          y1={size - 4}
          x2={size - 4}
          y2="4"
          stroke="#8b2c2c"
          strokeWidth="2"
          opacity="0.8"
        />
      )}
    </svg>
  )
}
