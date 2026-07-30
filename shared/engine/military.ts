import type { MilitaryOrder, MilitaryResult, MetricDelta, Nation } from '../domain/types'
import { clamp, randInt, rollCheck, createRng } from './random'

// 军事推演引擎，规则见 rules.md 第 2.1 节
// 所有随机性基于 (seed, salt) 可复现。

const NATION_NAME: Record<Nation, string> = { US: '美军', UK: '英军', SU: '苏军' }

/** 执行军事推演。commanderSkill 由调用方从席位数据查得。 */
export function resolveMilitaryOrder(
  order: MilitaryOrder,
  commanderSkill: number,
  seed: number,
  salt: number,
): MilitaryResult {
  const rng = createRng(seed)

  // 敌方抵抗力度 seeded 10~30
  const enemyResistance = randInt(rng, salt, 10, 30)
  // 后勤惩罚：force > 6 时每超 1 点 -4
  const logisticsPenalty = order.force > 6 ? (order.force - 6) * 4 : 0

  const baseSuccess =
    50 + order.force * 3 + commanderSkill * 2 - enemyResistance - logisticsPenalty

  const successRate = clamp(baseSuccess, 5, 95)
  const { roll, success } = rollCheck(rng, salt + 1, successRate)

  const deltas: MetricDelta[] = []
  let narrative = ''

  switch (order.type) {
    case 'OFFENSIVE':
      if (success) {
        deltas.push({ nation: order.nation, key: 'publicSupport', delta: 4, reason: '进攻得手，士气振奋' })
        deltas.push({ nation: order.nation, key: 'intlOpinion', delta: 3, reason: '进攻行动引发国际关注' })
        narrative = `前线战报：${NATION_NAME[order.nation]}向 ${order.target} 发起攻势，旗开得胜，部队已推进至预定防线。`
      } else {
        const loss = order.force * 10
        deltas.push({ nation: order.nation, key: 'publicSupport', delta: -6, reason: '进攻受阻，兵力损失' })
        narrative = `前线战报：${NATION_NAME[order.nation]}对 ${order.target} 的进攻受挫，敌军负隅顽抗，我军折损约 ${loss}%。`
      }
      break
    case 'DEFENSIVE':
      if (success) {
        deltas.push({ nation: order.nation, key: 'oppositionPressure', delta: -3, reason: '防线稳固，国内安心' })
        narrative = `前线战报：${NATION_NAME[order.nation]}于 ${order.target} 一线据守，敌军数次冲击皆被击退，防线固若磐石。`
      } else {
        deltas.push({ nation: order.nation, key: 'colonyUnrest', delta: 4, reason: '防线动摇引发不安' })
        narrative = `前线战报：${NATION_NAME[order.nation]}在 ${order.target} 的防线遭敌军突破，局势岌岌可危。`
      }
      break
    case 'WITHDRAW':
      if (success) {
        deltas.push({ nation: order.nation, key: 'intlOpinion', delta: -2, reason: '有序撤退' })
        narrative = `前线战报：${NATION_NAME[order.nation]}自 ${order.target} 井然撤退，主力得以保全，重整旗鼓。`
      } else {
        deltas.push({ nation: order.nation, key: 'publicSupport', delta: -8, reason: '混乱撤退，士气受挫' })
        narrative = `前线战报：${NATION_NAME[order.nation]}自 ${order.target} 的撤退演变为溃退，辎重尽失，士气大挫。`
      }
      break
    case 'REDEPLOY':
      if (success) {
        narrative = `前线战报：${NATION_NAME[order.nation]}完成向 ${order.target} 的兵力调动，下一阶段作战态势将获增援。`
        // 注：下会期 +10% 成功率需在 store 层记录状态，此处仅叙事
      } else {
        narrative = `前线战报：${NATION_NAME[order.nation]}调往 ${order.target} 的部队遭敌空中遮断，调度延误。`
      }
      break
  }

  return {
    order,
    success,
    successRate,
    roll,
    deltas,
    narrative: `${narrative}〔推演胜算 ${successRate}%，掷骰 ${roll}〕`,
  }
}
