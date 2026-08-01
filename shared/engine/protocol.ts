// 协议系统引擎（rules.md §4）
// - 协议属性（议题 / 激进度 / 受益分配 / 签署方）
// - 签署条件校验（激进度上限受反对派压力限制、签署方无人在危机中）
// - 协议生效后果（支持度 = beneficiary/10、反对派压力博弈、战略目标推进）

import type {
  GameState,
  Protocol,
  ProtocolDraft,
  ProtocolTopic,
  Nation,
  MetricDelta,
  ProtocolBeneficiary,
} from '../domain/types'
import { applyDeltas, maxRadicalness } from './metrics'

export const NATIONS: Nation[] = ['US', 'UK', 'SU']

/** 协议议题中文标签（本地副本，避免循环依赖） */
const TOPIC_LABEL: Record<ProtocolTopic, string> = {
  GERMANY: '德国问题',
  POLAND: '波兰问题',
  FAR_EAST: '远东问题',
  UN: '联合国',
  OTHER: '其他',
}

/** 各议题默认受益分配（提案国略占优） */
const TOPIC_BASE_BENEFIT: Record<ProtocolTopic, ProtocolBeneficiary> = {
  GERMANY: { US: 30, UK: 45, SU: 45 },
  POLAND: { US: -20, UK: -10, SU: 60 },
  UN: { US: 55, UK: 35, SU: 10 },
  FAR_EAST: { US: 40, UK: 10, SU: 50 },
  OTHER: { US: 20, UK: 20, SU: 20 },
}

/** 生成默认受益分配：让提案国在此基础上 +20，并从最高受益方 -20 */
export function defaultBeneficiary(topic: ProtocolTopic, proposer: Nation): ProtocolBeneficiary {
  const base = { ...TOPIC_BASE_BENEFIT[topic] }
  const others = NATIONS.filter((n) => n !== proposer)
  const highest = others.reduce((m, n) => (base[n] > base[m] ? n : m), others[0])
  base[proposer] = clampBen(base[proposer] + 20)
  base[highest] = clampBen(base[highest] - 20)
  return base
}

function clampBen(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v)))
}

function clampRad(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)))
}

/** 由草案创建协议实例（提案国自动同意，且强制纳入签署方） */
export function createProtocol(draft: ProtocolDraft, proposedBy: Nation, id: string, session: number): Protocol {
  const signatories = Array.from(new Set<Nation>([proposedBy, ...draft.signatories]))
  return {
    id,
    topic: draft.topic,
    title: draft.title.trim() || `${TOPIC_LABEL[draft.topic]}协定`,
    radicalness: clampRad(draft.radicalness),
    beneficiary: {
      US: clampBen(draft.beneficiary.US),
      UK: clampBen(draft.beneficiary.UK),
      SU: clampBen(draft.beneficiary.SU),
    },
    signatories,
    agreed: [proposedBy],
    proposedBy,
    secret: draft.secret,
    status: 'PROPOSED',
    proposedSession: session,
  }
}

/** 签署条件校验（rules.md §4.2） */
export interface SignCheck {
  ok: boolean
  reason?: string
}

export function checkSignConditions(state: GameState, protocol: Protocol, nation: Nation): SignCheck {
  if (!protocol.signatories.includes(nation)) {
    return { ok: false, reason: '非本约签署方' }
  }
  // 激进度上限：受本国反对派压力限制
  const opp = state.metrics[nation].oppositionPressure
  const cap = maxRadicalness(opp)
  if (protocol.radicalness > cap) {
    return { ok: false, reason: `激进度 ${protocol.radicalness} 超出本国上限 ${cap}（反对派压力过高）` }
  }
  // 签署方无人在危机中（领导人退出 / 美方领导人空缺）
  if (nation === 'UK' && state.ukElection.churchillRetired) {
    return { ok: false, reason: '丘吉尔已退出会议，英方无法签署' }
  }
  if (nation === 'US' && state.roosevelt.status === 'DECEASED' && !state.roosevelt.trumanSucceeded) {
    return { ok: false, reason: '美方领导人空缺，无法签署' }
  }
  return { ok: true }
}

/** 协议是否已集齐全部签署方同意 */
export function isFullyAgreed(protocol: Protocol): boolean {
  return protocol.signatories.every((n) => protocol.agreed.includes(n))
}

export interface ProtocolEffect {
  newState: GameState
  deltas: MetricDelta[]
  narrative: string
  achievedGoals: Record<Nation, string[]>
}

/** 协议生效：应用指标后果 + 推进战略目标 + 波兰事件链外交解决 */
export function applyProtocol(state: GameState, protocol: Protocol): ProtocolEffect {
  let next: GameState = { ...state }
  const deltas: MetricDelta[] = []

  if (!protocol.secret) {
    for (const n of NATIONS) {
      const ben = protocol.beneficiary[n]
      // 各国支持度变化 = beneficiary / 10
      deltas.push({
        nation: n,
        key: 'publicSupport',
        delta: ben / 10,
        reason: `协议·${TOPIC_LABEL[protocol.topic]}`,
      })
      // 反对派压力：受益方 -5，受损方 +5
      const oppDelta = ben > 0 ? -5 : ben < 0 ? 5 : 0
      if (oppDelta !== 0) {
        deltas.push({ nation: n, key: 'oppositionPressure', delta: oppDelta, reason: '协议激进度博弈' })
      }
    }
    next = applyDeltas(next, deltas)
  }

  // 战略目标推进（rules.md §6.2）
  const goals: Record<Nation, string[]> = {
    US: [...state.achievedGoals.US],
    UK: [...state.achievedGoals.UK],
    SU: [...state.achievedGoals.SU],
  }
  const addGoal = (n: Nation, g: string) => {
    if (!goals[n].includes(g)) goals[n].push(g)
  }
  if (protocol.topic === 'GERMANY') {
    addGoal('UK', '德国分区占领')
    addGoal('SU', '德国分区占领')
  }
  if (protocol.topic === 'POLAND') addGoal('SU', '波兰受控')
  if (protocol.topic === 'UN') addGoal('US', '联合国建立')
  if (protocol.topic === 'FAR_EAST') {
    addGoal('US', '苏联对日作战承诺')
    addGoal('SU', '远东利益确认')
  }

  const narrative = protocol.secret
    ? `《${protocol.title}》于密室签署，三方约定严守秘密，世间无从窥见其条款。`
    : `《${protocol.title}》经签署生效，各国舆情随利益分配而起伏。`

  // 波兰问题经条约框定 → 视作外交解决，避免武装冲突
  if (protocol.topic === 'POLAND' && !next.polandUprising.polandResolvedByTreaty) {
    next = {
      ...next,
      polandUprising: {
        ...next.polandUprising,
        polandResolvedByTreaty: true,
        status: 'RESOLVED',
        resolution: '经条约框定波兰边界，局势归于外交解决。',
      },
    }
  }

  next = { ...next, achievedGoals: goals }
  return { newState: next, deltas, narrative, achievedGoals: goals }
}

/** 某国已签署的有利条约数（beneficiary > 0） */
export function countFavorableTreaties(state: GameState, nation: Nation): number {
  return state.protocols.filter((p) => p.status === 'SIGNED' && p.beneficiary[nation] > 0).length
}
