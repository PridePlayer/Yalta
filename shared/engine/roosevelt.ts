import type { RooseveltStatus, RooseveltState, MedicalBulletin, MetricDelta } from '../domain/types'
import { clamp, randInt, createRng } from './random'

// 罗斯福健康事件链，规则见 rules.md 第 3.1 节
// 状态机：STABLE → DECLINING → CRITICAL → DECEASED

/** 由健康度推断状态 */
export function statusFromHealth(health: number, current: RooseveltStatus): RooseveltStatus {
  if (current === 'DECEASED') return 'DECEASED'
  if (health <= 0) return 'DECEASED'
  if (health < 40) return 'CRITICAL'
  if (health < 70) return 'DECLINING'
  return 'STABLE'
}

/** 各状态的每会期健康衰减区间（rules.md 3.1） */
const DECAY_RANGE: Record<RooseveltStatus, [number, number]> = {
  STABLE: [3, 7],       // 均值约 -5
  DECLINING: [7, 13],   // 均值约 -10
  CRITICAL: [18, 27],   // -15 × 1.5，均值约 -22
  DECEASED: [0, 0],
}

/** 计算会期末健康衰减与状态迁移 */
export function computeSessionEndHealth(
  health: number,
  status: RooseveltStatus,
  session: number,
  seed: number,
): { newHealth: number; newStatus: RooseveltStatus; decay: number } {
  if (status === 'DECEASED') {
    return { newHealth: health, newStatus: 'DECEASED', decay: 0 }
  }

  const rng = createRng(seed + session * 7919)
  const [lo, hi] = DECAY_RANGE[status]
  // 会期序号混入种子，保证每会期衰减不同但确定
  const decay = randInt(rng, session * 31, lo, hi)
  const newHealth = clamp(health - decay, 0, 100)
  const newStatus = statusFromHealth(newHealth, status)

  return { newHealth, newStatus, decay }
}

/** 生成医疗简报 */
export function createBulletin(health: number, session: number): MedicalBulletin {
  let assessment: string
  let urgent = false

  if (health >= 70) {
    assessment = '总统气色尚佳，血压平稳，可负荷繁重议程。'
  } else if (health >= 40) {
    assessment = '总统面色倦怠，偶有咳喘，医师嘱其节劳。'
  } else if (health >= 20) {
    assessment = '总统形容枯槁，咳血时作，心肺功能急剧衰退。'
    urgent = true
  } else {
    assessment = '总统危在旦夕，血压居高不下，意识时清时昧。紧急！'
    urgent = true
  }

  return { session, assessment, urgent, health }
}

/** 罗斯福去世后的杜鲁门继任处理 */
export function handleTrumanSuccession(
  roosevelt: RooseveltState,
  health: number,
): { newRoosevelt: RooseveltState; newHealth: number; deltas: MetricDelta[] } {
  // 健康重置为 70，但谈判筹码 -30%（以美方支持度下降体现）
  const newRoosevelt: RooseveltState = {
    ...roosevelt,
    status: 'STABLE', // 杜鲁门健康重置
    trumanSucceeded: true,
    vigorPoints: 10,
  }
  const newHealth = 70
  const deltas: MetricDelta[] = [
    { nation: 'US', key: 'publicSupport', delta: -15, reason: '总统更迭，国内震动' },
    { nation: 'US', key: 'oppositionPressure', delta: 10, reason: '反对派借机发难' },
  ]
  return { newRoosevelt, newHealth, deltas }
}

/** 状态中文名 */
export const STATUS_LABEL: Record<RooseveltStatus, string> = {
  STABLE: '尚可',
  DECLINING: '渐衰',
  CRITICAL: '危急',
  DECEASED: '驾鹤',
}
