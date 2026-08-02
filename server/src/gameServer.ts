// 状态权威服务器：持有权威 GameState，裁决动作，生成私密情报
// 从前端 gameStore 迁移而来，去除 React 依赖，增加权限检查与私密情报

import type { GameState, MilitaryOrder, MilitaryResult, MetricDelta, WiretapOrder, WiretapResult, WiretapTier, VenueId, Nation, LogEntry, Petition, Protocol, ProtocolDraft, ProtocolTopic } from '../../shared/domain/types'
import { createInitialState, applyDeltas } from '../../shared/engine/metrics'
import { resolveMilitaryOrder } from '../../shared/engine/military'
import { resolveWiretap } from '../../shared/engine/wiretap'
import { computeSessionEndHealth, createBulletin, handleTrumanSuccession } from '../../shared/engine/roosevelt'
import { invokeStalinArchive, settleStalinArchiveAtSessionEnd, checkTrigger as checkStalinTrigger } from '../../shared/engine/stalinArchive'
import { checkOutbreakTrigger, triggerOutbreak, respondToOutbreak, resolvePolandUprising } from '../../shared/engine/polandUprising'
import { settleUKElectionAtSessionEnd } from '../../shared/engine/ukElection'
import { generatePetitions, handlePetition } from '../../shared/engine/petitions'
import { createProtocol, checkSignConditions, applyProtocol, isFullyAgreed } from '../../shared/engine/protocol'
import { computeSettlement } from '../../shared/engine/settlement'
import { SEATS } from '../../shared/data/seats'
import { VENUES } from '../../shared/data/venues'
import type { GameAction, PrivateIntel, SerializableGameState, LogEntryDTO } from '../../shared/protocol'

const TOTAL_SESSIONS = 7
// 存储日志上限（默认 500 条），超出后丢弃最旧，避免内存与每次 STATE 广播体积无限增长
const MAX_LOGS = Number(process.env.MAX_LOGS) || 500
const PHASE_ORDER = ['TOPIC', 'VENUE', 'MILITARY', 'CRISIS', 'PRESS'] as const
const SESSION_DATE = ['1945年2月4日', '1945年2月5日', '1945年2月6日', '1945年2月7日', '1945年2月8日', '1945年2月9日', '1945年2月10日']
const PHASE_NARRATIVE: Record<string, string> = {
  TOPIC: '（议槌声）三巨头入座，本日议程待定。',
  VENUE: '代表团移步各会场，密议开始。情报官各显神通。',
  MILITARY: '前线战报送达，军事将领齐聚作战室。',
  CRISIS: '急电抵达，会议被迫转入危机应对。',
  PRESS: '记者涌入大厅，闪光灯此起彼伏。',
}

const NATION_HAN: Record<Nation, string> = { US: '美方', UK: '英方', SU: '苏方' }
const TOPIC_HAN: Record<ProtocolTopic, string> = {
  GERMANY: '德国问题',
  POLAND: '波兰问题',
  FAR_EAST: '远东问题',
  UN: '联合国',
  OTHER: '其他',
}
function nationHan(n: Nation): string {
  return NATION_HAN[n]
}
function topicHan(t: ProtocolTopic): string {
  return TOPIC_HAN[t]
}
const KEY_HAN: Record<string, string> = {
  publicSupport: '国内民望', intelPoints: '情报储备', oppositionPressure: '反对派压力',
  colonyUnrest: '殖民地动荡', intlOpinion: '国际舆论', rooseveltHealth: '罗斯福健康',
}

/** 动作裁决结果 */
export interface ActionResult {
  success: boolean
  message: string
  /** 新增日志（需广播给全员） */
  newLogs: LogEntry[]
  /** 私密情报（仅发给特定玩家） */
  privateIntel?: PrivateIntel
  /** 权威玩家在此动作中可接收私密情报的国家 */
  privateNation?: Nation
}

export class GameServer {
  state: GameState
  private pendingIntel: PrivateIntel[] = []
  /** 日志自增序号，保证 id 唯一（即便日志被截断也不碰撞） */
  private logSeq = 0
  /** 当前阶段开始时间戳（epoch ms），用于客户端同步倒计时 */
  private phaseStartedAt = Date.now()

  constructor(seed: number = 20250204) {
    this.state = createInitialState(seed)
    this.state = this.generatePetitionsAtSessionStart()
    this.phaseStartedAt = Date.now()
  }

  /** 序列化为客户端可见状态 */
  serialize(): SerializableGameState {
    const s = this.state
    return {
      session: s.session,
      phase: s.phase,
      phaseStartedAt: this.phaseStartedAt,
      metrics: s.metrics,
      intlOpinion: s.intlOpinion,
      rooseveltHealth: s.rooseveltHealth,
      roosevelt: s.roosevelt,
      medicalBulletins: s.medicalBulletins,
      sovietJammerActive: s.sovietJammerActive,
      stalinArchive: s.stalinArchive,
      polandUprising: s.polandUprising,
      ukElection: s.ukElection,
      petitions: {
        pending: s.petitions.pending,
        historyCount: s.petitions.history.length,
        consecutiveColonyIgnored: s.petitions.consecutiveColonyIgnored,
        colonyUprisingTriggered: s.petitions.colonyUprisingTriggered,
      },
      protocols: s.protocols,
      achievedGoals: s.achievedGoals,
      settlement: s.settlement,
      logs: s.logs,
      gameEnded: s.settlement !== null,
    }
  }

  /** 裁决游戏动作 */
  performAction(action: GameAction): ActionResult {
    switch (action.kind) {
      case 'MILITARY_ORDER': return this.doMilitaryOrder(action.order)
      case 'WIRETAP': return this.doWiretap(action.order)
      case 'DEPLOY_JAMMER': return this.doDeployJammer()
      case 'INVOKE_STALIN_ARCHIVE': return this.doInvokeStalinArchive()
      case 'POLAND_RESPONSE': return this.doPolandResponse(action.response)
      case 'POLAND_RESOLVE': return this.doPolandResolve()
      case 'PETITION_HANDLE': return this.doPetitionHandle(action.petitionId, action.handling)
      case 'PROPOSE_PROTOCOL': return this.doProposeProtocol(action.draft, action.proposedBy)
      case 'SIGN_PROTOCOL': return this.doSignProtocol(action.protocolId, action.nation)
    }
  }

  private appendLog(text: string, kind: LogEntry['kind']): LogEntry {
    const entry: LogEntry = {
      id: `log-${this.logSeq++}`,
      session: this.state.session,
      phase: this.state.phase,
      text, kind,
    }
    const logs = [...this.state.logs, entry]
    this.state = { ...this.state, logs: logs.length > MAX_LOGS ? logs.slice(logs.length - MAX_LOGS) : logs }
    return entry
  }

  private logDeltas(deltas: MetricDelta[]): LogEntry | null {
    if (deltas.length === 0) return null
    const detail = deltas
      .map((d) => `${NATION_HAN[d.nation]}${KEY_HAN[d.key]}${d.delta > 0 ? '上扬' : '下挫'}${d.delta > 0 ? '+' : ''}${d.delta}`)
      .join('，')
    return this.appendLog(`国情简报：${detail}。`, 'info')
  }

  private doMilitaryOrder(order: MilitaryOrder): ActionResult {
    const seat = SEATS.find((s) => s.id === order.seatId)
    if (!seat || seat.role !== 'MILITARY' || seat.nation !== order.nation) {
      return { success: false, message: `${order.seatId} 无军事指挥权`, newLogs: [] }
    }
    const commanderSkill = seat.commanderSkill ?? 5
    const salt = this.state.session * 1000 + this.state.actionCounter
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }

    const result: MilitaryResult = resolveMilitaryOrder(order, commanderSkill, this.state.seed, salt)
    const newLogs: LogEntry[] = []

    newLogs.push(this.appendLog(
      `利瓦季亚宫讯——${seat.name} 签署${order.type === 'OFFENSIVE' ? '进攻' : order.type === 'DEFENSIVE' ? '防御' : order.type === 'WITHDRAW' ? '撤退' : '重新部署'}令，目标 ${order.target}。`,
      'action',
    ))
    this.state = applyDeltas(this.state, result.deltas)
    newLogs.push(this.appendLog(result.narrative, 'result'))
    const deltaLog = this.logDeltas(result.deltas)
    if (deltaLog) newLogs.push(deltaLog)

    return { success: true, message: '军令已发', newLogs }
  }

  private doWiretap(order: WiretapOrder): ActionResult {
    const seat = SEATS.find((s) => s.id === order.seatId)
    if (!seat || seat.role !== 'INTEL' || seat.nation !== order.nation) {
      return { success: false, message: `${order.seatId} 无情报职权`, newLogs: [] }
    }
    const intelSkill = seat.intelSkill ?? 5
    const salt = this.state.session * 1000 + this.state.actionCounter
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }

    const result: WiretapResult = resolveWiretap(order, intelSkill, this.state.seed, salt, this.state.sovietJammerActive)
    const newLogs: LogEntry[] = []

    const venueName = VENUES.find((v) => v.id === order.targetVenue)?.name ?? order.targetVenue
    const tierLabel = order.tier === 'FULL' ? '完整情报' : '部分情报'
    newLogs.push(this.appendLog(`暗线消息——${seat.name} 受命潜入${venueName}，意欲获取${tierLabel}。`, 'action'))

    this.state = applyDeltas(this.state, result.deltas)
    newLogs.push(this.appendLog(result.narrative, result.success ? 'result' : 'crisis'))

    // 私密情报：窃听成功时，内容仅发给窃听方
    let privateIntel: PrivateIntel | undefined
    let privateNation: Nation | undefined
    if (result.success && result.content) {
      privateIntel = {
        id: `intel-${this.state.actionCounter}`,
        session: this.state.session,
        nation: order.nation,
        venueName,
        content: result.content,
        tier: order.tier,
      }
      privateNation = order.nation
      // 注意：窃得内容不进入公开日志
    }

    const deltaLog = this.logDeltas(result.deltas)
    if (deltaLog) newLogs.push(deltaLog)

    return { success: true, message: '密令已发', newLogs, privateIntel, privateNation }
  }

  private doDeployJammer(): ActionResult {
    if (this.state.sovietJammerActive) {
      return { success: false, message: '干扰器已部署', newLogs: [] }
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1, sovietJammerActive: true }
    const newLogs: LogEntry[] = [this.appendLog('苏方在利瓦季亚宫秘密启用无线电干扰器，他国监听胜算骤降。', 'action')]
    return { success: true, message: '干扰器已启用', newLogs }
  }

  private doInvokeStalinArchive(): ActionResult {
    if (!checkStalinTrigger(this.state.polandUprising.polandDiscussedSessions)) {
      return { success: false, message: '波兰问题尚未陷入僵局', newLogs: [] }
    }
    if (this.state.stalinArchive.invoked) {
      return { success: false, message: '情报库已调用', newLogs: [] }
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }

    const { newState, deltas, narrative } = invokeStalinArchive(this.state.stalinArchive, this.state.seed, this.state.session)
    this.state = { ...this.state, stalinArchive: newState }
    const newLogs: LogEntry[] = []
    newLogs.push(this.appendLog('暗谍消息——斯大林亮出情报库底牌。', 'action'))
    newLogs.push(this.appendLog(narrative, deltas.length > 0 ? 'crisis' : 'result'))
    this.state = applyDeltas(this.state, deltas)
    const deltaLog = this.logDeltas(deltas)
    if (deltaLog) newLogs.push(deltaLog)

    return { success: true, message: '底牌已亮', newLogs }
  }

  private doPolandResponse(response: 'SUPPRESS' | 'ALLOW' | 'SUPPORT'): ActionResult {
    if (this.state.polandUprising.phase !== 'OUTBREAK') {
      return { success: false, message: '无波兰危机待应对', newLogs: [] }
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }
    const { newState, deltas, narrative } = respondToOutbreak(this.state.polandUprising, response)
    this.state = { ...this.state, polandUprising: newState }
    const newLogs: LogEntry[] = []
    const label = response === 'SUPPRESS' ? '苏军铁腕镇压' : response === 'ALLOW' ? '斯大林默许' : '西方公开支持'
    newLogs.push(this.appendLog(`波兰危机应对——${label}。`, 'action'))
    newLogs.push(this.appendLog(narrative, 'crisis'))
    this.state = applyDeltas(this.state, deltas)
    const deltaLog = this.logDeltas(deltas)
    if (deltaLog) newLogs.push(deltaLog)
    return { success: true, message: '已表态', newLogs }
  }

  private doPolandResolve(): ActionResult {
    if (this.state.polandUprising.phase !== 'ESCALATION') {
      return { success: false, message: '波兰危机尚未到解决之时', newLogs: [] }
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }
    const { newState, deltas, narrative } = resolvePolandUprising(this.state.polandUprising)
    this.state = { ...this.state, polandUprising: newState }
    const newLogs: LogEntry[] = []
    newLogs.push(this.appendLog('波兰危机终局——', 'action'))
    newLogs.push(this.appendLog(narrative, 'result'))
    this.state = applyDeltas(this.state, deltas)
    const deltaLog = this.logDeltas(deltas)
    if (deltaLog) newLogs.push(deltaLog)
    return { success: true, message: '终局已定', newLogs }
  }

  private doPetitionHandle(petitionId: string, handling: 'RESPOND' | 'ARCHIVE' | 'REJECT'): ActionResult {
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }
    const { newState, deltas, narrative, crisisTriggered } = handlePetition(this.state.petitions, petitionId, handling)
    this.state = { ...this.state, petitions: newState }
    const newLogs: LogEntry[] = []
    const label = handling === 'RESPOND' ? '回应并纳入讨论' : handling === 'ARCHIVE' ? '存档不处理' : '公开驳回'
    newLogs.push(this.appendLog(`请愿处置——${label}。`, 'action'))
    newLogs.push(this.appendLog(narrative, crisisTriggered ? 'crisis' : 'result'))
    this.state = applyDeltas(this.state, deltas)
    const deltaLog = this.logDeltas(deltas)
    if (deltaLog) newLogs.push(deltaLog)
    return { success: true, message: '已处置', newLogs }
  }

  private doProposeProtocol(draft: ProtocolDraft, proposedBy: Nation): ActionResult {
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }
    const id = `p-${this.state.session}-${this.state.actionCounter}`
    const protocol = createProtocol(draft, proposedBy, id, this.state.session)
    // 提案国即签署方之一，已在 createProtocol 中自动同意
    this.state = { ...this.state, protocols: [...this.state.protocols, protocol] }
    const newLogs: LogEntry[] = [
      this.appendLog(
        `外交提案——${nationHan(protocol.proposedBy)}提出《${protocol.title}》（议题：${topicHan(protocol.topic)}，激进度 ${protocol.radicalness}）。待各方签署。`,
        'action',
      ),
    ]
    return { success: true, message: '提案已提交', newLogs }
  }

  private doSignProtocol(protocolId: string, nation: Nation): ActionResult {
    const protocol = this.state.protocols.find((p) => p.id === protocolId)
    if (!protocol) {
      return { success: false, message: '协议不存在', newLogs: [] }
    }
    if (protocol.status !== 'PROPOSED') {
      return { success: false, message: '该协议已非待签状态', newLogs: [] }
    }
    if (!protocol.signatories.includes(nation)) {
      return { success: false, message: '非本约签署方', newLogs: [] }
    }
    if (protocol.agreed.includes(nation)) {
      return { success: false, message: '贵方已签署', newLogs: [] }
    }
    const check = checkSignConditions(this.state, protocol, nation)
    if (!check.ok) {
      return { success: false, message: check.reason ?? '无法签署', newLogs: [] }
    }
    this.state = { ...this.state, actionCounter: this.state.actionCounter + 1 }
    const agreed = [...protocol.agreed, nation]
    const updated: Protocol = { ...protocol, agreed }
    const newLogs: LogEntry[] = [
      this.appendLog(`签约——${nationHan(nation)}签署《${protocol.title}》。`, 'action'),
    ]

    if (isFullyAgreed(updated)) {
      // 集齐签署 → 生效
      const { newState, deltas, narrative } = applyProtocol(this.state, updated)
      const signed: Protocol = { ...updated, status: 'SIGNED', signedSession: this.state.session }
      this.state = { ...newState, protocols: this.state.protocols.map((p) => (p.id === protocol.id ? signed : p)) }
      newLogs.push(this.appendLog(narrative, 'result'))
      const dl = this.logDeltas(deltas)
      if (dl) newLogs.push(dl)
    } else {
      this.state = {
        ...this.state,
        protocols: this.state.protocols.map((p) => (p.id === protocol.id ? updated : p)),
      }
    }
    return { success: true, message: '已签署', newLogs }
  }

  /** 推进阶段/会期 */
  advancePhase(): LogEntry[] {
    const idx = PHASE_ORDER.indexOf(this.state.phase)
    const newLogs: LogEntry[] = []

    if (idx < PHASE_ORDER.length - 1) {
      const to = PHASE_ORDER[idx + 1]
      this.state = { ...this.state, phase: to }
      this.phaseStartedAt = Date.now()
      newLogs.push(this.appendLog(PHASE_NARRATIVE[to], 'info'))
    } else {
      if (this.state.session >= TOTAL_SESSIONS) {
        // 第 7 会期闭幕 → 结算（rules.md §6）
        const settlement = computeSettlement(this.state)
        this.state = { ...this.state, settlement }
        newLogs.push(this.appendLog('1945年2月11日，雅尔塔会议闭幕。三巨头签署公报，历史就此定格。', 'info'))
        newLogs.push(this.appendLog(`〔结算〕${settlement.endingTitle}——${settlement.endingText}`, 'result'))
        for (const e of settlement.specialEndings) {
          newLogs.push(this.appendLog(`〔结局〕${e}`, 'crisis'))
        }
        return newLogs
      }
      // 会期末事件链结算
      this.settleEventChainsAtSessionEnd(newLogs)
      const nextSession = this.state.session + 1
      this.state = { ...this.state, session: nextSession, phase: 'TOPIC', sovietJammerActive: false }
      this.phaseStartedAt = Date.now()
      newLogs.push(this.appendLog(`—— ${SESSION_DATE[nextSession - 1]}，第 ${nextSession} 会期开始 ——`, 'info'))
      // 会期开始生成抗议信
      this.generatePetitionsAtSessionStart(newLogs)
    }
    return newLogs
  }

  private settleEventChainsAtSessionEnd(newLogs: LogEntry[]): void {
    // 1. 罗斯福健康
    this.settleRoosevelt(newLogs)
    // 2. 斯大林情报库反噬倒计时
    if (this.state.stalinArchive.backlashTurns > 0) {
      const { newState, narrative } = settleStalinArchiveAtSessionEnd(this.state.stalinArchive)
      this.state = { ...this.state, stalinArchive: newState }
      if (narrative) newLogs.push(this.appendLog(narrative, 'info'))
    }
    // 3. 波兰起义推进
    this.settlePoland(newLogs)
    // 4. 英国大选
    {
      const { newState, deltas, narratives } = settleUKElectionAtSessionEnd(this.state.ukElection, this.state.seed, this.state.session)
      this.state = { ...this.state, ukElection: newState }
      for (const n of narratives) newLogs.push(this.appendLog(n, 'info'))
      if (deltas.length > 0) {
        this.state = applyDeltas(this.state, deltas)
        const dl = this.logDeltas(deltas)
        if (dl) newLogs.push(dl)
      }
    }
  }

  private settleRoosevelt(newLogs: LogEntry[]): void {
    if (this.state.roosevelt.status === 'DECEASED') return
    const { newHealth, newStatus, decay } = computeSessionEndHealth(this.state.rooseveltHealth, this.state.roosevelt.status, this.state.session, this.state.seed)
    this.state = { ...this.state, rooseveltHealth: newHealth, roosevelt: { ...this.state.roosevelt, status: newStatus, bulletinDelivered: false } }
    if (decay > 0) newLogs.push(this.appendLog(`总统健康：本会期衰减 ${decay} 度，现余 ${newHealth} 度。`, 'info'))
    const bulletin = createBulletin(newHealth, this.state.session)
    this.state = { ...this.state, medicalBulletins: [...this.state.medicalBulletins, bulletin], roosevelt: { ...this.state.roosevelt, bulletinDelivered: true } }
    newLogs.push(this.appendLog(`医疗简报（第${this.state.session}会期）：${bulletin.assessment}${bulletin.urgent ? '【紧急】' : ''}`, bulletin.urgent ? 'crisis' : 'info'))
    if (newStatus === 'DECEASED' && !this.state.roosevelt.trumanSucceeded) {
      const { newRoosevelt, newHealth: trumanHealth, deltas } = handleTrumanSuccession(this.state.roosevelt)
      this.state = { ...this.state, roosevelt: newRoosevelt, rooseveltHealth: trumanHealth }
      newLogs.push(this.appendLog('噩耗传来——罗斯福总统于会期中段溘然长逝。副总统杜鲁门火速继任，飞抵雅尔塔。美方谈判筹码骤减。', 'crisis'))
      this.state = applyDeltas(this.state, deltas)
      const dl = this.logDeltas(deltas)
      if (dl) newLogs.push(dl)
    }
  }

  private settlePoland(newLogs: LogEntry[]): void {
    if (this.state.polandUprising.status === 'DORMANT' || this.state.polandUprising.status === 'ACTIVE') {
      this.state = { ...this.state, polandUprising: { ...this.state.polandUprising, polandDiscussedSessions: this.state.polandUprising.polandDiscussedSessions + 1 } }
    }
    if (checkOutbreakTrigger(this.state.polandUprising)) {
      const { newState, narrative } = triggerOutbreak(this.state.polandUprising)
      this.state = { ...this.state, polandUprising: newState }
      newLogs.push(this.appendLog(narrative, 'crisis'))
    }
  }

  private generatePetitionsAtSessionStart(newLogs?: LogEntry[]): GameState {
    const { newState, narrative } = generatePetitions(this.state.petitions, this.state.seed, this.state.session)
    this.state = { ...this.state, petitions: newState }
    if (newState.pending.length > 0 && newLogs) {
      newLogs.push(this.appendLog(narrative, 'info'))
    }
    return this.state
  }

  reset(seed: number): void {
    this.state = createInitialState(seed)
    this.state = this.generatePetitionsAtSessionStart()
    this.phaseStartedAt = Date.now()
  }
}
