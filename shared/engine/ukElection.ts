import type { UKElectionState, MetricDelta } from '../domain/types'
import { randInt, createRng, clamp } from './random'

// 英国大选倒计时事件链，规则见 rules.md 第 3.4 节
// 时钟：countdown 初始 7，每会期 -1
// 民调：baseChange = 5 + randInt(0,5)，强硬 +3，软化 -4
// 阈值：≥50% 丘吉尔筹码 -20%；≥60% 中断 1 会期回国；=0 大选丘吉尔退出

/** 记录丘吉尔动作（强硬/软化），影响民调 */
export function recordChurchillAction(
  state: UKElectionState,
  action: 'HAWKISH' | 'SOFT',
): UKElectionState {
  if (state.churchillRetired) return state
  if (action === 'HAWKISH') {
    return { ...state, hawkishActions: state.hawkishActions + 1 }
  }
  return { ...state, softActions: state.softActions + 1 }
}

/** 会期末英国大选结算 */
export function settleUKElectionAtSessionEnd(
  state: UKElectionState,
  seed: number,
  session: number,
): { newState: UKElectionState; deltas: MetricDelta[]; narratives: string[] } {
  if (state.churchillRetired) {
    return { newState: state, deltas: [], narratives: [] }
  }

  const rng = createRng(seed + session * 6271)
  const deltas: MetricDelta[] = []
  const narratives: string[] = []

  // 倒计时 -1
  const newCountdown = state.countdown - 1

  // 若上会期丘吉尔中断离场，本会期已返回
  const wasAway = state.churchillAway

  // 民调变化
  const baseChange = 5 + randInt(rng, session * 13, 0, 5)
  let actualChange = baseChange
  // 每 3 个强硬动作 → +5
  const hawkishBonus = Math.floor(state.hawkishActions / 3) * 5
  actualChange += hawkishBonus
  // 每 2 个软化动作 → 反对派 -4（此处简化为民调 -2 体现选民好感）
  const softReduction = Math.floor(state.softActions / 2) * 2
  actualChange -= softReduction

  const newPolling = clamp(state.laborPolling + actualChange, 0, 100)

  narratives.push(`英国工党民调：${state.laborPolling}% → ${newPolling}%（变化 ${actualChange > 0 ? '+' : ''}${actualChange}%）。`)

  let newState: UKElectionState = {
    ...state,
    countdown: newCountdown,
    laborPolling: newPolling,
    churchillAway: false, // 默认清除（若上会期离场，本会期已返回）
  }

  if (wasAway) {
    narratives.push('丘吉尔自伦敦返抵雅尔塔，重新主持英方代表团。')
  }

  // 民调阈值效应（仅当丘吉尔在场时）
  if (newPolling >= 60 && !state.churchillRetired) {
    newState = { ...newState, churchillAway: true }
    narratives.push('工党民调突破 60%！丘吉尔被迫中断下会期，飞返伦敦组织竞选。艾登将暂代英方首席。')
    deltas.push({ nation: 'UK', key: 'oppositionPressure', delta: 8, reason: '丘吉尔离场，党内动荡' })
  } else if (newPolling >= 50) {
    narratives.push('工党民调过半，丘吉尔谈判筹码折损 20%。')
    deltas.push({ nation: 'UK', key: 'oppositionPressure', delta: 4, reason: '民调不利，筹码折损' })
  }

  // 倒计时归零 → 大选，丘吉尔永久退出
  if (newCountdown <= 0) {
    newState = {
      ...newState,
      churchillRetired: true,
      status: 'RESOLVED',
      churchillAway: false,
    }
    const won = newPolling < 50 // 民调低于 50% 丘吉尔险胜
    if (won) {
      narratives.push('英国大选落幕——丘吉尔险胜连任，但已无法返回雅尔塔。艾登正式接任英方首席。')
      deltas.push({ nation: 'UK', key: 'publicSupport', delta: 5, reason: '选举胜利' })
    } else {
      narratives.push('英国大选落幕——工党大胜，丘吉尔败选下台。艾登临危受命，接任英方首席。')
      deltas.push({ nation: 'UK', key: 'publicSupport', delta: -10, reason: '执政党败选' })
      deltas.push({ nation: 'UK', key: 'oppositionPressure', delta: 15, reason: '工党执政压力' })
    }
  }

  return { newState, deltas, narratives }
}
