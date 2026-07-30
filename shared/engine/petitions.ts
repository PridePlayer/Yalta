import type { PetitionState, Petition, PetitionSource, MetricDelta } from '../domain/types'
import { randInt, createRng } from './random'

// 抗议信/请愿书系统，规则见 rules.md 第 3.5 节
// 每会期 seeded 生成 1~2 封，来源：小国/殖民地/流亡政府
// 处理：回应（舆论-3）/ 存档（舆论+5）/ 驳回（舆论+8）
// 连锁：殖民地信连续忽略 ≥2 → 殖民地起义危机

const PETITION_TEMPLATES: { source: PetitionSource; name: string; topic: string }[] = [
  { source: 'SMALL_STATE', name: '波兰流亡政府', topic: '请求承认伦敦波兰政府合法性' },
  { source: 'SMALL_STATE', name: '捷克斯洛伐克代表', topic: '请求保障战后领土完整' },
  { source: 'SMALL_STATE', name: '南斯拉夫代表', topic: '请求协调王国与游击队之争' },
  { source: 'SMALL_STATE', name: '希腊代表', topic: '请求干预希腊内政危机' },
  { source: 'COLONY', name: '印度国民大会党', topic: '吁请战后赋予印度独立' },
  { source: 'COLONY', name: '缅甸民族委员会', topic: '请求战后撤除殖民统治' },
  { source: 'COLONY', name: '马来亚 union', topic: '抗议殖民资源掠夺' },
  { source: 'EXILE_GOV', name: '法国戴高乐派', topic: '请求恢复法国大国地位与殖民地' },
  { source: 'EXILE_GOV', name: '荷兰流亡政府', topic: '请求战后归还东印度群岛' },
  { source: 'EXILE_GOV', name: '比利时流亡政府', topic: '请求保障刚果资源权益' },
]

/** 会期开始时生成抗议信 */
export function generatePetitions(
  state: PetitionState,
  seed: number,
  session: number,
): { newState: PetitionState; petitions: Petition[]; narrative: string } {
  const rng = createRng(seed + session * 4783)
  // 1~2 封
  const count = randInt(rng, session * 17, 1, 2)
  const petitions: Petition[] = []

  // 随机挑选不重复模板
  const pool = [...PETITION_TEMPLATES]
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = randInt(rng, session * 19 + i * 7, 0, pool.length - 1)
    const tmpl = pool.splice(idx, 1)[0]
    petitions.push({
      id: `petition-${session}-${i}`,
      session,
      source: tmpl.source,
      sourceName: tmpl.name,
      topic: tmpl.topic,
      handled: 'PENDING',
    })
  }

  const newState: PetitionState = {
    ...state,
    pending: petitions,
  }

  const names = petitions.map((p) => p.sourceName).join('、')
  return {
    newState,
    petitions,
    narrative: `本会期收到 ${petitions.length} 封抗议信与请愿书，来自：${names}。`,
  }
}

/** 处理一封抗议信 */
export function handlePetition(
  state: PetitionState,
  petitionId: string,
  handling: 'RESPOND' | 'ARCHIVE' | 'REJECT',
): { newState: PetitionState; deltas: MetricDelta[]; narrative: string; crisisTriggered: boolean } {
  const petition = state.pending.find((p) => p.id === petitionId)
  if (!petition) {
    return { newState: state, deltas: [], narrative: '未找到该请愿书。', crisisTriggered: false }
  }

  const deltas: MetricDelta[] = []
  let narrative: string
  let consecutiveColonyIgnored = state.consecutiveColonyIgnored
  let crisisTriggered = false

  switch (handling) {
    case 'RESPOND':
      deltas.push({ nation: 'US', key: 'intlOpinion', delta: -3, reason: '回应请愿，国际舆论缓和' })
      narrative = `${petition.sourceName}的请愿被纳入讨论，国际舆论略有缓和。`
      // 回应殖民地信件则重置连续忽略计数
      if (petition.source === 'COLONY') consecutiveColonyIgnored = 0
      break
    case 'ARCHIVE':
      deltas.push({ nation: 'US', key: 'intlOpinion', delta: 5, reason: '请愿被存档，舆论不满' })
      if (petition.source === 'COLONY') {
        deltas.push({ nation: 'UK', key: 'colonyUnrest', delta: 3, reason: '殖民地请愿被忽略' })
        consecutiveColonyIgnored += 1
      }
      narrative = `${petition.sourceName}的请愿被存档搁置，国际舆论不满。`
      break
    case 'REJECT':
      deltas.push({ nation: 'US', key: 'intlOpinion', delta: 8, reason: '公开驳回，舆论哗然' })
      if (petition.source === 'COLONY') {
        deltas.push({ nation: 'UK', key: 'colonyUnrest', delta: 5, reason: '殖民地请愿被驳回' })
        consecutiveColonyIgnored += 1
      }
      narrative = `${petition.sourceName}的请愿被公开驳回，来源方敌意骤升，国际舆论大哗。`
      break
  }

  // 连锁：殖民地连续忽略 ≥2 → 殖民地起义危机
  if (consecutiveColonyIgnored >= 2 && !state.colonyUprisingTriggered) {
    crisisTriggered = true
    deltas.push({ nation: 'UK', key: 'colonyUnrest', delta: 20, reason: '殖民地起义爆发' })
    narrative += ' 连续忽略殖民地请愿，"殖民地起义"危机爆发！英属殖民地反抗度激增，会议被迫中断处理。'
  }

  // 更新请愿状态：从 pending 移除，加入 history
  const updatedPetition: Petition = { ...petition, handled: handling }
  const newState: PetitionState = {
    ...state,
    pending: state.pending.filter((p) => p.id !== petitionId),
    history: [...state.history, updatedPetition],
    consecutiveColonyIgnored,
    colonyUprisingTriggered: crisisTriggered || state.colonyUprisingTriggered,
  }

  return { newState, deltas, narrative, crisisTriggered }
}
