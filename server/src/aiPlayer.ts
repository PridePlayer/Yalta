// AI 玩家：单人模式下，未被真人占据的队长位由 AI 接管
// 决策基于 rules.md 第5节：nationalInterest × 0.4 + roleDuty × 0.3 + personality × 0.2 + ambition × 0.1
// 原型阶段简化：按角色性格（hawkish/pragmatic/loyal）做加权随机选择

import type { GameAction } from '../../shared/protocol'
import type {
  Nation,
  MilitaryOrderType,
  MilitaryOrder,
  WiretapOrder,
  WiretapTier,
  VenueId,
} from '../../shared/domain/types'
import { SEATS } from '../../shared/data/seats'
import { VENUES } from '../../shared/data/venues'
import type { SerializableGameState } from '../../shared/protocol'
import type { GameServer } from './gameServer'
import type { ActionResult } from './gameServer'

const LEADER_NATIONS: Nation[] = ['US', 'UK', 'SU']

const MILITARY_TARGETS = ['柏林', '华沙', '维也纳', '布拉格', '布达佩斯', '柯尼斯堡']

/** AI 决策上下文 */
export interface AIContext {
  /** AI 控制的国家列表 */
  nations: Nation[]
  /** 当前游戏状态（序列化后的可见状态） */
  state: SerializableGameState
  /** 执行动作的回调（直接调用 gameServer.performAction） */
  act: (action: GameAction) => ActionResult
  /** 记录日志的回调 */
  log: (text: string) => void
}

/** 阶段内 AI 是否已行动过的标记（key = `${nation}-${phase}-${session}`） */
const aiActedFlags = new Set<string>()

/** 重置 AI 行动标记（每次推进阶段时调用） */
export function resetAIActed(): void {
  aiActedFlags.clear()
}

/** 判定某国在本阶段是否已行动 */
function hasActed(nation: Nation, state: SerializableGameState): boolean {
  const key = `${nation}-${state.phase}-${state.session}`
  return aiActedFlags.has(key)
}

/** 标记某国已行动 */
function markActed(nation: Nation, state: SerializableGameState): void {
  const key = `${nation}-${state.phase}-${state.session}`
  aiActedFlags.add(key)
}

/**
 * 触发 AI 决策。在每次 advancePhase 后调用。
 * AI 会为每个受控国家生成并执行一个动作。
 */
export function runAIPlayers(ctx: AIContext): void {
  const { nations, state, act, log } = ctx

  for (const nation of nations) {
    if (hasActed(nation, state)) continue

    const action = decideAction(nation, state)
    if (!action) continue

    log(`〔AI〕${nationLabel(nation)}代表团正在权衡…`)
    const result = act(action)
    if (result.success) {
      markActed(nation, state)
    }
  }
}

/** 生成 AI 动作（不执行） */
function decideAction(nation: Nation, state: SerializableGameState): GameAction | null {
  // 优先处理危机事件链
  const crisis = decideCrisis(nation, state)
  if (crisis) return crisis

  // 按阶段决策
  switch (state.phase) {
    case 'MILITARY':
      return decideMilitary(nation, state)
    case 'VENUE':
      return decideWiretap(nation, state)
    default:
      return null
  }
}

// ========== 危机事件链决策 ==========

function decideCrisis(nation: Nation, state: SerializableGameState): GameAction | null {
  // 斯大林情报库：苏联 AI 在条件满足时调用
  if (
    nation === 'SU' &&
    state.polandUprising.polandDiscussedSessions >= 2 &&
    !state.stalinArchive.invoked
  ) {
    return { kind: 'INVOKE_STALIN_ARCHIVE' }
  }

  // 波兰危机 OUTBREAK 阶段
  if (state.polandUprising.phase === 'OUTBREAK') {
    if (nation === 'SU') {
      // 苏联：pragmatic 高则 ALLOW，否则 SUPPRESS
      const suLeader = SEATS.find((s) => s.id === 'SU-01')!
      const response = suLeader.personality.pragmatic > 0.75 ? 'ALLOW' : 'SUPPRESS'
      return { kind: 'POLAND_RESPONSE', response }
    }
    if (nation === 'US' || nation === 'UK') {
      // 西方：hawkish 高则 SUPPORT
      const leader = SEATS.find((s) => s.id === `${nation}-01`)!
      if (leader.personality.hawkish > 0.6) {
        return { kind: 'POLAND_RESPONSE', response: 'SUPPORT' }
      }
    }
  }

  // 波兰危机 ESCALATION → RESOLUTION
  if (state.polandUprising.phase === 'ESCALATION') {
    return { kind: 'POLAND_RESOLVE' }
  }

  // 抗议信处理：AI 队长自动处置
  // 注意：petitionId 需要客户端传入，AI 这里处理第一封待处理抗议信
  // 但 SerializableGameState 的 pending 是 any[]，需要从完整状态获取
  // 简化：AI 不主动处理抗议信，留给玩家或后续扩展

  return null
}

// ========== 军事命令决策 ==========

function decideMilitary(nation: Nation, state: SerializableGameState): GameAction | null {
  // 选本国 commanderSkill 最高的军事席位
  const militarySeats = SEATS.filter((s) => s.nation === nation && s.role === 'MILITARY')
  if (militarySeats.length === 0) return null

  const seat = militarySeats.reduce((best, s) =>
    (s.commanderSkill ?? 0) > (best.commanderSkill ?? 0) ? s : best,
  )

  const leader = SEATS.find((s) => s.id === `${nation}-01`)!
  const { hawkish, pragmatic } = leader.personality

  // 决策类型：鹰派偏进攻，务实偏防御，否则重新部署
  let type: MilitaryOrderType
  if (hawkish > 0.65) {
    type = 'OFFENSIVE'
  } else if (pragmatic > 0.7) {
    type = 'DEFENSIVE'
  } else {
    type = 'REDEPLOY'
  }

  // 兵力：鹰派投入更多
  const force = Math.max(3, Math.min(10, Math.round(hawkish * 8 + 2)))

  // 目标：随机选一个
  const target = MILITARY_TARGETS[Math.floor(seededRandom(state, nation) * MILITARY_TARGETS.length)]

  const order: MilitaryOrder = {
    seatId: seat.id,
    nation,
    type,
    force,
    target,
    intent: `〔AI〕${type === 'OFFENSIVE' ? '攻势推进' : type === 'DEFENSIVE' ? '稳固防线' : '战略调动'}`,
  }

  return { kind: 'MILITARY_ORDER', order }
}

// ========== 窃听决策 ==========

function decideWiretap(nation: Nation, state: SerializableGameState): GameAction | null {
  // 选本国 intelSkill 最高的情报席位
  const intelSeats = SEATS.filter((s) => s.nation === nation && s.role === 'INTEL')
  if (intelSeats.length === 0) return null

  const seat = intelSeats.reduce((best, s) =>
    (s.intelSkill ?? 0) > (best.intelSkill ?? 0) ? s : best,
  )

  // 选可窃听会场（排除本国主场）
  const wiretapVenues = VENUES.filter((v) => v.allowWiretap)
  if (wiretapVenues.length === 0) return null

  const idx = Math.floor(seededRandom(state, nation) * wiretapVenues.length)
  const venue = wiretapVenues[idx]

  // 目标国家：会场归属
  const venueNationMap: Record<string, Nation> = { V2: 'US', V3: 'UK', V4: 'SU', V5: 'SU' }
  const targetNation = venueNationMap[venue.id] ?? 'US'
  // 不窃听本国
  if (targetNation === nation) {
    // 改为窃听其他会场
    const alt = wiretapVenues.find((v) => venueNationMap[v.id] !== nation)
    if (!alt) return null
    const altNation = venueNationMap[alt.id] ?? 'US'
    const tier: WiretapTier = nation === 'SU' ? 'PARTIAL' : 'FULL'
    const order: WiretapOrder = {
      seatId: seat.id,
      nation,
      targetVenue: alt.id as VenueId,
      targetNation: altNation,
      tier,
    }
    return { kind: 'WIRETAP', order }
  }

  // 苏联可用 PARTIAL，其他用 FULL
  const tier: WiretapTier = nation === 'SU' ? 'PARTIAL' : 'FULL'
  const order: WiretapOrder = {
    seatId: seat.id,
    nation,
    targetVenue: venue.id as VenueId,
    targetNation,
    tier,
  }

  return { kind: 'WIRETAP', order }
}

// ========== 辅助 ==========

function nationLabel(n: Nation): string {
  return n === 'US' ? '美方' : n === 'UK' ? '英方' : '苏方'
}

/** 基于 state 的 seeded 随机，保证同一状态多次调用结果一致（避免 AI 反复重试） */
function seededRandom(state: SerializableGameState, nation: Nation): number {
  const seed = state.session * 1000 + state.session + nation.charCodeAt(0)
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}
