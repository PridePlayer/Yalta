// 会场地图：SVG 示意图级
// 利瓦季亚宫平面图：3 个代表团厅 + 中央议事厅
// 三巨头头像根据当前阶段在不同位置

import type { SessionPhase } from '@shared/domain/types'
import { LeaderAvatar } from './LeaderAvatar'
import { useGameState } from '../state/gameStore'
import type { Nation } from '@shared/domain/types'

interface Props {
  phase: SessionPhase
  session: number
}

// 会场坐标定义（SVG viewBox 240x200）
const VENUE_BOXES = [
  { id: 'main', name: '中央议事厅', x: 80, y: 70, w: 80, h: 60 },
  { id: 'us', name: '美方厅', x: 20, y: 140, w: 70, h: 50 },
  { id: 'uk', name: '英方厅', x: 150, y: 140, w: 70, h: 50 },
  { id: 'su', name: '苏方厅', x: 20, y: 10, w: 70, h: 50 },
  { id: 'press', name: '新闻厅', x: 150, y: 10, w: 70, h: 50 },
]

// 三巨头在不同阶段的位置（SVG 坐标）
function getLeaderPositions(phase: SessionPhase): Record<Nation, { x: number; y: number }> {
  // 默认在中央议事厅
  const centerInMain: Record<Nation, { x: number; y: number }> = {
    US: { x: 105, y: 100 },
    UK: { x: 120, y: 100 },
    SU: { x: 135, y: 100 },
  }
  switch (phase) {
    case 'TOPIC':
      // 议程阶段：三巨头齐聚中央议事厅
      return centerInMain
    case 'VENUE':
      // 分会场阶段：各回各厅
      return {
        US: { x: 55, y: 165 },
        UK: { x: 185, y: 165 },
        SU: { x: 55, y: 35 },
      }
    case 'MILITARY':
      // 军议阶段：在中央议事厅作战室
      return centerInMain
    case 'CRISIS':
      // 危机阶段：紧急回中央议事厅
      return centerInMain
    case 'PRESS':
      // 记者会：移到新闻厅
      return {
        US: { x: 175, y: 35 },
        UK: { x: 185, y: 35 },
        SU: { x: 195, y: 35 },
      }
  }
}

export function VenueMap({ phase }: Props) {
  const state = useGameState()
  if (!state) return null

  const positions = getLeaderPositions(phase)

  // 罗斯福健康状态判断是否离场
  const fdrAbsent = state.roosevelt.trumanSucceeded ? false : state.roosevelt.status === 'DECEASED'
  // 丘吉尔提前退出
  const churchillAbsent = state.ukElection.churchillRetired

  return (
    <div className="venue-map panel">
      <div className="panel-heading">
        <span className="heading-ornament">❦</span>
        <h3>利瓦季亚宫</h3>
        <span className="heading-ornament">❦</span>
      </div>

      <svg viewBox="0 0 240 200" className="venue-svg" xmlns="http://www.w3.org/2000/svg">
        {/* 宫殿外轮廓 */}
        <rect x="8" y="4" width="224" height="192" rx="4" fill="none" stroke="#5a4d36" strokeWidth="1.5" strokeDasharray="2 3" />

        {/* 会场方块 */}
        {VENUE_BOXES.map((v) => {
          // 根据阶段高亮当前活跃会场
          let active = false
          if (phase === 'VENUE') {
            active = v.id === 'us' || v.id === 'uk' || v.id === 'su'
          } else if (phase === 'PRESS') {
            active = v.id === 'press'
          } else {
            active = v.id === 'main'
          }
          return (
            <g key={v.id}>
              <rect
                x={v.x}
                y={v.y}
                width={v.w}
                height={v.h}
                rx="2"
                fill={active ? 'rgba(201,169,97,0.12)' : 'rgba(0,0,0,0.3)'}
                stroke={active ? '#c9a961' : '#4a3d2a'}
                strokeWidth={active ? 1.5 : 1}
              />
              <text
                x={v.x + v.w / 2}
                y={v.y + v.h / 2}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="9"
                fill={active ? '#c9a961' : '#786850'}
                fontFamily="Georgia, SimSun, serif"
                letterSpacing="1"
              >
                {v.name}
              </text>
            </g>
          )
        })}

        {/* 走廊连线 */}
        <g stroke="#4a3d2a" strokeWidth="0.5" strokeDasharray="1 2" fill="none">
          <line x1="120" y1="100" x2="55" y2="165" />
          <line x1="120" y1="100" x2="185" y2="165" />
          <line x1="120" y1="100" x2="55" y2="35" />
          <line x1="120" y1="100" x2="185" y2="35" />
        </g>

        {/* 三巨头头像位置标记（SVG 圆点 + 国色） */}
        {(['US', 'UK', 'SU'] as Nation[]).map((n) => {
          const pos = positions[n]
          const absent = n === 'US' ? fdrAbsent : n === 'UK' ? churchillAbsent : false
          return (
            <g key={n} transform={`translate(${pos.x - 8}, ${pos.y - 8})`}>
              <circle cx="8" cy="8" r="7" fill={n === 'US' ? '#3a6ea5' : n === 'UK' ? '#8b2c2c' : '#a83232'} stroke="#f0e4c8" strokeWidth="1" opacity={absent ? 0.3 : 1} />
              <text x="8" y="8" textAnchor="middle" dominantBaseline="middle" fontSize="7" fill="#f0e4c8" fontFamily="Georgia, serif">
                {n === 'US' ? '美' : n === 'UK' ? '英' : '苏'}
              </text>
              {absent && (
                <line x1="0" y1="14" x2="14" y2="0" stroke="#8b2c2c" strokeWidth="1.5" />
              )}
            </g>
          )
        })}

        {/* 阶段标识 */}
        <text x="120" y="196" textAnchor="middle" fontSize="8" fill="#786850" fontFamily="Georgia, SimSun, serif" letterSpacing="2">
          〔当前：{phaseLabel(phase)}〕
        </text>
      </svg>

      {/* 头像栏：横排显示三巨头头像 */}
      <div className="leader-row">
        <div className="leader-cell">
          <LeaderAvatar nation="US" size={44} absent={fdrAbsent} />
          <span className="leader-name">{state.roosevelt.trumanSucceeded ? '杜鲁门' : '罗斯福'}</span>
        </div>
        <div className="leader-cell">
          <LeaderAvatar nation="UK" size={44} absent={churchillAbsent} />
          <span className="leader-name">{state.ukElection.churchillRetired ? '艾登' : '丘吉尔'}</span>
        </div>
        <div className="leader-cell">
          <LeaderAvatar nation="SU" size={44} />
          <span className="leader-name">斯大林</span>
        </div>
      </div>
    </div>
  )
}

function phaseLabel(phase: SessionPhase): string {
  const map: Record<SessionPhase, string> = {
    TOPIC: '议程',
    VENUE: '分会场',
    MILITARY: '军议',
    CRISIS: '危机',
    PRESS: '记者会',
  }
  return map[phase]
}
