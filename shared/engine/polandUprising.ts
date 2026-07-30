import type { PolandUprisingState, PolandUprisingPhase, MetricDelta } from '../domain/types'

// 波兰起义事件链，规则见 rules.md 第 3.3 节
// 状态机：DORMANT → OUTBREAK → ESCALATION → RESOLUTION
// 触发：波兰问题讨论 ≥ 3 会期且未达成协议

/** 检查是否触发爆发 */
export function checkOutbreakTrigger(state: PolandUprisingState): boolean {
  return state.phase === 'DORMANT' && state.polandDiscussedSessions >= 3
}

/** 触发爆发 */
export function triggerOutbreak(state: PolandUprisingState): {
  newState: PolandUprisingState
  narrative: string
} {
  const newState: PolandUprisingState = {
    ...state,
    status: 'ACTIVE',
    phase: 'OUTBREAK',
  }
  return {
    newState,
    narrative: '急电——华沙爆发大规模反苏示威！波兰地下军走上街头，与苏军治安部队发生冲突。三巨头须立即表态。',
  }
}

/** OUTBREAK 阶段应对：SUPPRESS（苏镇压）/ ALLOW（苏默许）/ SUPPORT（西方支持起义） */
export function respondToOutbreak(
  state: PolandUprisingState,
  response: 'SUPPRESS' | 'ALLOW' | 'SUPPORT',
): { newState: PolandUprisingState; deltas: MetricDelta[]; narrative: string; nextPhase: PolandUprisingPhase } {
  const deltas: MetricDelta[] = []
  let narrative: string

  switch (response) {
    case 'SUPPRESS':
      deltas.push({ nation: 'UK', key: 'colonyUnrest', delta: 5, reason: '镇压引发殖民地不安' })
      deltas.push({ nation: 'SU', key: 'publicSupport', delta: 3, reason: '铁腕维护秩序' })
      narrative = '苏军铁腕镇压华沙示威，街垒被推平，领袖被拘押。英属殖民地闻讯不安，国际舆论哗然。'
      break
    case 'ALLOW':
      // 激进度上限 -20（协议系统未实现，以叙事体现）
      deltas.push({ nation: 'SU', key: 'oppositionPressure', delta: 10, reason: '默许引发国内强硬派不满' })
      narrative = '斯大林罕见地默许了示威，波兰问题协议激进度上限下调，但苏联强硬派借此施压。'
      break
    case 'SUPPORT':
      deltas.push({ nation: 'US', key: 'intlOpinion', delta: -5, reason: '西方公开支持起义' })
      narrative = '西方公开支持华沙起义，谴责苏联暴政。此举激怒莫斯科，但波兰问题僵局出现转机。'
      break
  }

  const newState: PolandUprisingState = {
    ...state,
    phase: 'ESCALATION',
    outbreakResponse: response,
    westernIntervened: response === 'SUPPORT',
    sovietConceded: response === 'ALLOW',
  }

  return { newState, deltas, narrative, nextPhase: 'ESCALATION' }
}

/** ESCALATION → RESOLUTION：根据前述选择揭示最终后果 */
export function resolvePolandUprising(state: PolandUprisingState): {
  newState: PolandUprisingState
  deltas: MetricDelta[]
  narrative: string
} {
  const deltas: MetricDelta[] = []
  let narrative: string

  const suppressNoIntervene = state.outbreakResponse === 'SUPPRESS' && !state.westernIntervened
  const intervenedConceded = state.westernIntervened && state.sovietConceded
  const bothHardline = state.outbreakResponse === 'SUPPRESS' && state.westernIntervened

  if (bothHardline) {
    // 双方强硬 → 波兰战争危机
    deltas.push({ nation: 'US', key: 'intlOpinion', delta: 20, reason: '波兰战争危机升级' })
    deltas.push({ nation: 'UK', key: 'intlOpinion', delta: 20, reason: '波兰战争危机升级' })
    narrative = '波兰局势失控——双方强硬对峙，"波兰战争"爆发。国际舆论沸腾，第三次世界大战的阴云笼罩雅尔塔。〔游戏失败结局之一〕'
  } else if (intervenedConceded) {
    // 西方干预且苏联让步 → 波兰中立化
    deltas.push({ nation: 'US', key: 'publicSupport', delta: 10, reason: '波兰中立化，外交胜利' })
    deltas.push({ nation: 'UK', key: 'publicSupport', delta: 10, reason: '波兰中立化，外交胜利' })
    deltas.push({ nation: 'SU', key: 'publicSupport', delta: -5, reason: '波兰中立化，苏联让步' })
    narrative = '在外交斡旋下，波兰实现中立化。西方赢得外交胜利，苏联虽让步但保全了颜面。'
  } else if (suppressNoIntervene) {
    // 全程镇压且西方未干预 → 波兰纳入苏联势力范围
    deltas.push({ nation: 'SU', key: 'publicSupport', delta: 15, reason: '波兰纳入势力范围' })
    deltas.push({ nation: 'US', key: 'publicSupport', delta: -8, reason: '波兰沦陷，国内失望' })
    deltas.push({ nation: 'UK', key: 'publicSupport', delta: -8, reason: '波兰沦陷，国内失望' })
    narrative = '西方袖手旁观，波兰最终纳入苏联势力范围。斯大林大获全胜，西方国内民望受挫。'
  } else {
    // 默许路径 → 妥协达成
    narrative = '波兰局势在各方克制下逐渐平息，妥协方案浮出水面。'
  }

  const newState: PolandUprisingState = {
    ...state,
    phase: 'RESOLUTION',
    status: 'RESOLVED',
    resolution: narrative,
  }

  return { newState, deltas, narrative }
}
