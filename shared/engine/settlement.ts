// 胜负结算引擎（rules.md §6）
// - 各国胜利分 = 民众支持 - 反对派×0.8 - 殖民地×0.5 + 战略目标×10 + 有利条约×5
// - 预设战略目标终判（合并协议派生目标 + 终局状态目标）
// - 特殊结局：第三次世界大战 / 罗斯福去世 / 丘吉尔退出 / 完美雅尔塔

import type { GameState, Nation, VictoryResult, NationVictoryScore } from '../domain/types'
import { countFavorableTreaties } from './protocol'

const NATIONS: Nation[] = ['US', 'UK', 'SU']

/** 各预设战略目标的完整清单（用于"完美雅尔塔"判定） */
const FULL_GOALS: Record<Nation, string[]> = {
  US: ['联合国建立', '苏联对日作战承诺', '罗斯福健康存活'],
  UK: ['德国分区占领', '遏制红色西扩', '丘吉尔全程与会'],
  SU: ['德国分区占领', '波兰受控', '远东利益确认'],
}

export function computeSettlement(state: GameState): VictoryResult {
  // ===== 1. 合并战略目标（协议派生 + 终局状态） =====
  const achieved: Record<Nation, string[]> = {
    US: [...state.achievedGoals.US],
    UK: [...state.achievedGoals.UK],
    SU: [...state.achievedGoals.SU],
  }

  // 美：罗斯福健康存活至会议结束
  if (state.roosevelt.status !== 'DECEASED') achieved.US.push('罗斯福健康存活')
  // 英：丘吉尔未提前退出
  if (!state.ukElection.churchillRetired) achieved.UK.push('丘吉尔全程与会')
  // 英：防止红色势力西扩 —— 至少 1 项有利条约为外交遏制成功
  if (countFavorableTreaties(state, 'UK') >= 1) achieved.UK.push('遏制红色西扩')
  // 苏：波兰经条约外交解决亦算"受控"
  if (state.polandUprising.polandResolvedByTreaty) achieved.SU.push('波兰受控')

  // ===== 2. 计算各国胜利分 =====
  const scores: Record<Nation, NationVictoryScore> = {} as Record<Nation, NationVictoryScore>
  for (const n of NATIONS) {
    const m = state.metrics[n]
    const fav = countFavorableTreaties(state, n)
    const goalsCount = achieved[n].length

    const ps = m.publicSupport * 1.0
    const op = -m.oppositionPressure * 0.8
    const cu = -m.colonyUnrest * 0.5
    const goals = goalsCount * 10
    const treaties = fav * 5
    let penalties = 0
    if (n === 'US' && state.roosevelt.status === 'DECEASED') penalties -= 30
    if (n === 'UK' && state.ukElection.churchillRetired) penalties -= 40

    const victoryScore = ps + op + cu + goals + treaties + penalties
    scores[n] = {
      nation: n,
      victoryScore: Math.round(victoryScore),
      achievedGoals: achieved[n],
      favorableTreaties: fav,
      breakdown: {
        publicSupport: Math.round(ps),
        oppositionPressure: Math.round(op),
        colonyUnrest: Math.round(cu),
        achievedGoals: goals,
        favorableTreaties: treaties,
        penalties,
      },
    }
  }

  // ===== 3. 特殊结局判定 =====
  const specialEndings: string[] = []
  const ww3 =
    state.intlOpinion >= 95 &&
    (state.polandUprising.resolution?.includes('第三次世界大战') ?? false)
  const rooseveltDead = state.roosevelt.status === 'DECEASED'
  const churchillOut = state.ukElection.churchillRetired
  const perfect =
    !ww3 &&
    state.intlOpinion < 40 &&
    NATIONS.every((n) => FULL_GOALS[n].every((g) => achieved[n].includes(g)))

  if (rooseveltDead) specialEndings.push('罗斯福于会议期间溘然长逝，美方胜利分 -30。')
  if (churchillOut) specialEndings.push('丘吉尔提前退出，英方胜利分 -40，由艾登接任收尾。')

  let outcome: VictoryResult['outcome']
  let endingTitle: string
  let endingText: string

  if (ww3) {
    outcome = 'ALL_LOSE'
    endingTitle = '第三次世界大战'
    endingText =
      '国际舆论彻底崩坏，波兰的火药桶被点燃，"波兰战争"演变为第三次世界大战。雅尔塔的谈判桌未能阻止人类滑向深渊——这是所有大国共同的失败。'
    specialEndings.push('国际舆论 ≥ 95 且波兰战争触发 → 第三次世界大战，全员失败。')
  } else if (perfect) {
    outcome = 'SHARED'
    endingTitle = '完美雅尔塔'
    endingText =
      '三巨头在烛影摇曳间达成了堪称完美的战后秩序：三国战略目标尽数实现，国际舆论温和可控。历史的指针在此刻偏向了和平与共识——这是一场共同的胜利。'
    specialEndings.push('三国均达成全部战略目标且国际舆论 < 40 → 完美雅尔塔，共同胜利。')
  } else {
    // 常规：胜利分最高者胜
    let winner: Nation = 'US'
    let top = -Infinity
    const tied: Nation[] = []
    for (const n of NATIONS) {
      const s = scores[n].victoryScore
      if (s > top) {
        top = s
        winner = n
        tied.length = 0
        tied.push(n)
      } else if (s === top) {
        tied.push(n)
      }
    }
    if (tied.length > 1) {
      outcome = 'DRAW'
      endingTitle = '均势对峙'
      endingText = `${tied.map(nationHan).join('、')}三方势均力敌，胜负难分。战后格局在微妙的平衡中落定。`
    } else {
      outcome = winner
      endingTitle = `${nationHan(winner)}占据上风`
      endingText = `${nationHan(winner)}以 ${top} 分的总评在雅尔塔拔得头筹，于战后世界新秩序的博弈中占据了最有利的位置。`
    }
  }

  return { scores, outcome, endingTitle, endingText, specialEndings }
}

function nationHan(n: Nation): string {
  return n === 'US' ? '美方' : n === 'UK' ? '英方' : '苏方'
}
