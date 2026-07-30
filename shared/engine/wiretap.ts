import type { WiretapOrder, WiretapResult, MetricDelta, Nation, VenueId } from '../domain/types'
import { clamp, rollCheck, createRng } from './random'

// 窃听引擎，规则见 rules.md 第 2.2 节

const NATION_NAME: Record<Nation, string> = { US: '美方', UK: '英方', SU: '苏方' }

/** 各国反情报能力 0~10（目标国被窃听时降低成功率） */
const COUNTER_INTEL: Record<Nation, number> = { US: 6, UK: 7, SU: 8 }

/** 各会场的窃听目标叙事模板（成功时按等级返回内容） */
const VENUE_INTEL: Record<VenueId, { partial: string; full: string }> = {
  V1: { partial: '', full: '' }, // 会场一禁听，不会走到这里
  V2: {
    partial: '隔墙隐约闻得美方代表团争执之声，似涉远东与联合国席位。',
    full: '美方代表团内部密议：马歇尔主张优先解决对日作战，斯退丁纽斯则坚持联合国框架先行。哈里曼提及苏联在远东的价码。',
  },
  V3: {
    partial: '英方会场传出低语，似有提及殖民地与帝国防务。',
    full: '英方代表团密议：丘吉尔力主维持帝国版图，艾登则担忧工党民调攀升。布鲁克提及印度驻军吃紧。',
  },
  V4: {
    partial: '苏方会场戒备森严，仅得只言片语，似涉波兰与赔偿。',
    full: '苏方代表团密议：斯大林指示莫洛托夫在波兰问题上寸步不让，安东诺夫汇报前线推进顺利，维辛斯基已备妥情报库待命。',
  },
  V5: {
    partial: '秘密谈判室中交锋激烈，仅闻数国名词碎片。',
    full: '秘密谈判实录：三国就德国分区占领细节拉锯。美方让步于赔偿额度，苏方在波兰边界线上寸土必争，英方试图斡旋未果。',
  },
  V6: { partial: '', full: '' }, // 新闻中心禁听
}

/** 执行窃听。intelSkill 由调用方从席位数据查得。 */
export function resolveWiretap(
  order: WiretapOrder,
  intelSkill: number,
  seed: number,
  salt: number,
  sovietJammerActive: boolean,
): WiretapResult {
  const rng = createRng(seed)

  // 会场一与新闻中心禁听
  if (order.targetVenue === 'V1' || order.targetVenue === 'V6') {
    return {
      order,
      success: false,
      successRate: 0,
      roll: 0,
      exposed: false,
      content: '',
      deltas: [],
      narrative: `窃听被拒：${order.targetVenue} 为禁听会场，特工无从下手。`,
    }
  }

  // 苏联主场特权：PARTIAL 等级免费（仅苏联可用）
  const isSovietFreePartial = order.nation === 'SU' && order.tier === 'PARTIAL'

  // 成功率公式
  const targetCounterIntel = COUNTER_INTEL[order.targetNation]
  const sovietJammerPenalty = sovietJammerActive && order.nation !== 'SU' ? 15 : 0
  const homeAdvantage = order.nation === 'SU' ? 20 : 0

  const baseRate =
    50 + intelSkill * 3 - targetCounterIntel * 2 - sovietJammerPenalty + homeAdvantage

  const successRate = clamp(baseRate, 10, 90)
  const { roll, success } = rollCheck(rng, salt + 1, successRate)

  const deltas: MetricDelta[] = []

  // 情报点数消耗（成功时扣，失败时仍扣但少）
  const pointCost = isSovietFreePartial ? 0 : order.tier === 'FULL' ? 2 : 0
  if (pointCost > 0) {
    deltas.push({ nation: order.nation, key: 'intelPoints', delta: -pointCost, reason: '窃听行动消耗' })
  }

  if (success) {
    // 苏联主场免费 PARTIAL 仍需点数支持？rules.md：免费获得部分内容
    const intel = VENUE_INTEL[order.targetVenue]
    const content = order.tier === 'FULL' ? intel.full : intel.partial
    deltas.push({ nation: order.nation, key: 'intelPoints', delta: 1, reason: '窃听得手，情报反哺' })

    return {
      order,
      success: true,
      successRate,
      roll,
      exposed: false,
      content,
      deltas,
      narrative: `${NATION_NAME[order.nation]}情报官成功渗透${order.targetVenue}，获取${order.tier === 'FULL' ? '完整' : '部分'}情报。〔胜算 ${successRate}%，掷骰 ${roll}〕`,
    }
  }

  // 失败：媒体曝光
  deltas.push({ nation: order.nation, key: 'intelPoints', delta: -1, reason: '窃听失败，信誉损失' })
  deltas.push({ nation: order.nation, key: 'intlOpinion', delta: 8, reason: '窃听失败曝光，国际舆论哗然' })

  return {
    order,
    success: false,
    successRate,
    roll,
    exposed: true,
    content: '',
    deltas,
    narrative: `${NATION_NAME[order.nation]}情报官行动败露，${NATION_NAME[order.targetNation]}反情报部门当场截获。媒体闻风而至，国际舆论大哗。〔胜算 ${successRate}%，掷骰 ${roll}〕`,
  }
}
