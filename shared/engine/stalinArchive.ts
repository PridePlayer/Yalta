import type { StalinArchiveState, MetricDelta } from '../domain/types'
import { randInt, createRng, rollCheck } from './random'

// 斯大林情报库事件链，规则见 rules.md 第 3.2 节
// 触发：波兰问题僵局（连续 2 会期未达成波兰协议）
// 机制：100% 成功，30% 反噬 → 信誉归零，3 会期西方拒绝苏方提议

/** 检查触发条件：波兰讨论 ≥ 2 会期且未达成协议 */
export function checkTrigger(polandDiscussedSessions: number): boolean {
  return polandDiscussedSessions >= 2
}

/** 调用情报库威胁西方领导人 */
export function invokeStalinArchive(
  state: StalinArchiveState,
  seed: number,
  session: number,
): { newState: StalinArchiveState; deltas: MetricDelta[]; narrative: string } {
  if (state.invoked) {
    return { newState: state, deltas: [], narrative: '情报库已调用，不可重复使用。' }
  }

  const rng = createRng(seed + session * 31337)
  // 30% 反噬
  const { success: noBacklash } = rollCheck(rng, session * 7, 70)
  const backlash = !noBacklash

  const deltas: MetricDelta[] = []
  let narrative: string

  if (backlash) {
    deltas.push({ nation: 'SU', key: 'publicSupport', delta: -8, reason: '信誉破产，国内震动' })
    const newState: StalinArchiveState = {
      ...state,
      status: 'ACTIVE',
      invoked: true,
      triggered: true,
      sovietCredibility: 0,
      backlashTurns: 3,
    }
    narrative = '斯大林亮出情报库底牌——然而西方领袖早有防备，情报反成笑柄。斯大林信誉扫地，后续三会期内西方拒绝任何苏方提议。'
    return { newState, deltas, narrative }
  }

  // 成功：无反噬，但信誉受损
  deltas.push({ nation: 'SU', key: 'publicSupport', delta: 3, reason: '情报威慑奏效' })
  const newState: StalinArchiveState = {
    ...state,
    status: 'RESOLVED',
    invoked: true,
    triggered: true,
    sovietCredibility: 40,
    backlashTurns: 0,
  }
  narrative = '斯大林亮出情报库底牌，西方领袖面露难色。情报威慑奏效，但斯大林信誉亦受折损。'
  return { newState, deltas, narrative }
}

/** 会期末反噬倒计时递减与信誉恢复 */
export function settleStalinArchiveAtSessionEnd(state: StalinArchiveState): {
  newState: StalinArchiveState
  narrative?: string
} {
  if (state.backlashTurns > 0) {
    const remaining = state.backlashTurns - 1
    if (remaining === 0) {
      // 恢复信誉至 50
      return {
        newState: { ...state, backlashTurns: 0, sovietCredibility: 50, status: 'RESOLVED' },
        narrative: '苏联国际信誉已恢复至 50，正常谈判恢复。',
      }
    }
    return {
      newState: { ...state, backlashTurns: remaining },
      narrative: `苏联信誉破产效应尚余 ${remaining} 会期。`,
    }
  }
  return { newState: state }
}
