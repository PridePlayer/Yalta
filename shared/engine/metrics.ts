import type { GameState, MetricDelta, Nation, NationMetrics } from '../domain/types'
import { clamp } from './random'

// 初始指标值，来自 rules.md 第 1 节
const INITIAL_METRICS: Record<Nation, NationMetrics> = {
  US: { publicSupport: 60, intelPoints: 10, oppositionPressure: 30, colonyUnrest: 0 },
  UK: { publicSupport: 55, intelPoints: 10, oppositionPressure: 45, colonyUnrest: 30 },
  SU: { publicSupport: 75, intelPoints: 12, oppositionPressure: 10, colonyUnrest: 0 },
}

/** 创建初始游戏状态 */
export function createInitialState(seed: number): GameState {
  return {
    seed,
    session: 1,
    phase: 'TOPIC',
    metrics: structuredClone(INITIAL_METRICS),
    intlOpinion: 20,
    rooseveltHealth: 50,
    roosevelt: {
      status: 'STABLE',
      vigorPoints: 10,
      trumanSucceeded: false,
      bulletinDelivered: false,
    },
    medicalBulletins: [],
    sovietJammerActive: false,
    stalinArchive: {
      status: 'DORMANT',
      triggered: false,
      invoked: false,
      sovietCredibility: 80,
      backlashTurns: 0,
    },
    polandUprising: {
      status: 'DORMANT',
      phase: 'DORMANT',
      polandDiscussedSessions: 0,
      westernIntervened: false,
      sovietConceded: false,
    },
    ukElection: {
      status: 'ACTIVE',
      countdown: 7,
      laborPolling: 35,
      hawkishActions: 0,
      softActions: 0,
      churchillRetired: false,
      churchillAway: false,
    },
    petitions: {
      pending: [],
      history: [],
      consecutiveColonyIgnored: 0,
      colonyUprisingTriggered: false,
    },
    events: [],
    logs: [
      {
        id: 'init',
        session: 1,
        phase: 'TOPIC',
        text: '1945年2月4日，克里米亚半岛利瓦季亚宫。三巨头抵达，雅尔塔会议开幕。窗外黑海浪涌，宫内烛火摇曳——历史的指针在此停顿。',
        kind: 'info',
      },
    ],
    actionCounter: 0,
  }
}

/** 每项指标的上下限 */
const METRIC_BOUNDS: Record<string, [number, number]> = {
  publicSupport: [0, 100],
  intelPoints: [0, 30],
  oppositionPressure: [0, 100],
  colonyUnrest: [0, 100],
  intlOpinion: [0, 100],
  rooseveltHealth: [0, 100],
}

/** 将一组 delta 应用到状态，返回新状态（不可变更新） */
export function applyDeltas(state: GameState, deltas: MetricDelta[]): GameState {
  const next: GameState = {
    ...state,
    metrics: {
      US: { ...state.metrics.US },
      UK: { ...state.metrics.UK },
      SU: { ...state.metrics.SU },
    },
  }

  for (const d of deltas) {
    const [lo, hi] = METRIC_BOUNDS[d.key]
    if (d.key === 'intlOpinion') {
      next.intlOpinion = clamp(next.intlOpinion + d.delta, lo, hi)
    } else if (d.key === 'rooseveltHealth') {
      next.rooseveltHealth = clamp(next.rooseveltHealth + d.delta, lo, hi)
    } else {
      const m = next.metrics[d.nation]
      const k = d.key as keyof NationMetrics
      m[k] = clamp(m[k] + d.delta, lo, hi)
    }
  }
  return next
}

/** 获取某国某指标当前值（含全局指标） */
export function getMetric(state: GameState, nation: Nation, key: string): number {
  if (key === 'intlOpinion') return state.intlOpinion
  if (key === 'rooseveltHealth') return state.rooseveltHealth
  return state.metrics[nation][key as keyof NationMetrics]
}
