// 雅尔塔游戏领域模型类型定义

/** 三国 */
export type Nation = 'US' | 'UK' | 'SU'

/** 会场编号（联动会场一~六） */
export type VenueId = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6'

/** 角色职务类别（决定可用动作） */
export type RoleKind =
  | 'LEADER'        // 领导人（罗斯福/丘吉尔/斯大林）
  | 'DIPLOMAT'      // 外交官（国务卿/外交大臣/外交人民委员等）
  | 'MILITARY'      // 军事官（可下达军事命令）
  | 'INTEL'         // 情报官（可窃听）
  | 'AIDE'          // 幕僚/助理
  | 'JOURNALIST'    // 记者

/** 会场准入与窃听规则 */
export interface Venue {
  id: VenueId
  name: string
  /** 是否允许窃听（会场一禁听） */
  allowWiretap: boolean
  /** 苏联主场特权：免费获取部分内容 */
  sovietHomeAdvantage: boolean
}

/** 角色性格（3 维，0~1） */
export interface Personality {
  /** 鹰派倾向 */
  hawkish: number
  /** 务实/妥协倾向 */
  pragmatic: number
  /** 忠诚度（影响架空/泄密倾向） */
  loyal: number
}

/** 席位（42 人，intro.md 明细合计 42，文档第64行"41人"系笔误） */
export interface Seat {
  id: string
  name: string
  nation: Nation
  role: RoleKind
  /** 军事官能力 0~10（仅 MILITARY 有值） */
  commanderSkill?: number
  /** 情报官能力 0~10（仅 INTEL 有值） */
  intelSkill?: number
  personality: Personality
  /** 是否为本国领导人 */
  isLeader?: boolean
}

/** 系统指标键 */
export type MetricKey =
  | 'publicSupport'
  | 'intelPoints'
  | 'oppositionPressure'
  | 'colonyUnrest'
  | 'intlOpinion'
  | 'rooseveltHealth'

/** 单国指标（仅每国独立的部分） */
export interface NationMetrics {
  publicSupport: number
  intelPoints: number
  oppositionPressure: number
  colonyUnrest: number
}

/** 指标变化项（用于事件溯源） */
export interface MetricDelta {
  nation: Nation
  key: MetricKey
  delta: number
  reason: string
}

/** 会期阶段 */
export type SessionPhase =
  | 'TOPIC'       // 主题确定
  | 'VENUE'       // 分会场会议
  | 'MILITARY'    // 军事推演窗
  | 'CRISIS'      // 危机处理窗
  | 'PRESS'       // 新闻发布会

/** 军事命令类型 */
export type MilitaryOrderType = 'OFFENSIVE' | 'DEFENSIVE' | 'WITHDRAW' | 'REDEPLOY'

/** 军事命令输入 */
export interface MilitaryOrder {
  seatId: string
  nation: Nation
  type: MilitaryOrderType
  /** 投入兵力 1~10 */
  force: number
  /** 目标区域 */
  target: string
  /** 战略意图文本 */
  intent: string
}

/** 军事推演结果 */
export interface MilitaryResult {
  order: MilitaryOrder
  success: boolean
  successRate: number
  roll: number
  /** 产生的指标变化 */
  deltas: MetricDelta[]
  /** 公开叙事 */
  narrative: string
}

/** 窃听情报等级（影响消耗点数与信息量） */
export type WiretapTier = 'PARTIAL' | 'FULL'

/** 窃听动作输入 */
export interface WiretapOrder {
  seatId: string
  nation: Nation
  /** 目标会场 */
  targetVenue: VenueId
  /** 被窃听国（会场归属） */
  targetNation: Nation
  /** 情报等级：PARTIAL 仅部分内容（苏联主场可免费），FULL 完整内容（消耗点数） */
  tier: WiretapTier
}

/** 窃听结果 */
export interface WiretapResult {
  order: WiretapOrder
  success: boolean
  successRate: number
  roll: number
  /** 失败且被媒体曝光 */
  exposed: boolean
  /** 窃听到的内容叙事（成功时） */
  content: string
  /** 产生的指标变化 */
  deltas: MetricDelta[]
  /** 公开叙事 */
  narrative: string
}

/** 事件链通用状态 */
export type EventChainStatus = 'DORMANT' | 'ACTIVE' | 'RESOLVED' | 'FAILED'

/** 罗斯福健康事件链状态（rules.md 3.1） */
export type RooseveltStatus = 'STABLE' | 'DECLINING' | 'CRITICAL' | 'DECEASED'

/** 罗斯福健康事件链状态对象 */
export interface RooseveltState {
  status: RooseveltStatus
  /** 精力点（初始 10） */
  vigorPoints: number
  /** 是否已触发杜鲁门继任 */
  trumanSucceeded: boolean
  /** 本会期医疗简报是否已送达 */
  bulletinDelivered: boolean
}

/** 医疗简报（每会期美国代表团收到） */
export interface MedicalBulletin {
  session: number
  /** 健康度区间描述 */
  assessment: string
  /** 是否紧急 */
  urgent: boolean
  /** 当时的健康度数值 */
  health: number
}

// ========== 事件链 ==========

/** 斯大林情报库事件链状态（rules.md 3.2） */
export interface StalinArchiveState {
  status: EventChainStatus
  /** 是否已触发（波兰僵局条件曾满足） */
  triggered: boolean
  /** 是否已调用情报库 */
  invoked: boolean
  /** 苏联国际信誉 0~100，初始 80 */
  sovietCredibility: number
  /** 反噬剩余会期数（>0 时西方拒绝苏方提议） */
  backlashTurns: number
}

/** 波兰起义事件链状态（rules.md 3.3） */
export type PolandUprisingPhase = 'DORMANT' | 'OUTBREAK' | 'ESCALATION' | 'RESOLUTION'

export interface PolandUprisingState {
  status: EventChainStatus
  phase: PolandUprisingPhase
  /** 波兰问题讨论会期数（累积） */
  polandDiscussedSessions: number
  /** OUTBREAK 阶段苏联应对：SUPPRESS / ALLOW / SUPPORT（西方支持） */
  outbreakResponse?: 'SUPPRESS' | 'ALLOW' | 'SUPPORT'
  /** 是否西方干预 */
  westernIntervened: boolean
  /** 是否苏联让步 */
  sovietConceded: boolean
  /** 最终结果文案 */
  resolution?: string
  /** 是否经条约外交解决（绕过武装冲突） */
  polandResolvedByTreaty?: boolean
}

/** 英国大选倒计时状态（rules.md 3.4） */
export interface UKElectionState {
  status: EventChainStatus
  /** 倒计时会期数，初始 7 */
  countdown: number
  /** 工党民调 %，初始 35 */
  laborPolling: number
  /** 丘吉尔强硬动作累计 */
  hawkishActions: number
  /** 丘吉尔软化动作累计 */
  softActions: number
  /** 丘吉尔是否已退出（艾登接任） */
  churchillRetired: boolean
  /** 丘吉尔是否中断回国竞选 */
  churchillAway: boolean
}

/** 抗议信来源类型 */
export type PetitionSource = 'SMALL_STATE' | 'COLONY' | 'EXILE_GOV'

/** 单封抗议信 */
export interface Petition {
  id: string
  session: number
  source: PetitionSource
  /** 来源方名称 */
  sourceName: string
  /** 议题文案 */
  topic: string
  /** 处理状态 */
  handled: 'PENDING' | 'RESPOND' | 'ARCHIVE' | 'REJECT'
}

/** 抗议信系统状态（rules.md 3.5） */
export interface PetitionState {
  /** 当前会期待处理抗议信 */
  pending: Petition[]
  /** 历史已处理抗议信 */
  history: Petition[]
  /** 殖民地抗议信连续忽略计数 */
  consecutiveColonyIgnored: number
  /** 是否已触发殖民地起义危机 */
  colonyUprisingTriggered: boolean
}

// ========== 协议系统（rules.md §4） ==========

/** 协议议题 */
export type ProtocolTopic = 'GERMANY' | 'POLAND' | 'FAR_EAST' | 'UN' | 'OTHER'

/** 协议议题中文标签 */
export const PROTOCOL_TOPIC_LABEL: Record<ProtocolTopic, string> = {
  GERMANY: '德国问题',
  POLAND: '波兰问题',
  FAR_EAST: '远东问题',
  UN: '联合国',
  OTHER: '其他',
}

/** 协议受益分配（正为受益，-100~100） */
export interface ProtocolBeneficiary {
  US: number
  UK: number
  SU: number
}

/** 单条协议 */
export interface Protocol {
  id: string
  topic: ProtocolTopic
  title: string
  /** 激进度 0~100 */
  radicalness: number
  /** 受益分配 */
  beneficiary: ProtocolBeneficiary
  /** 签署方 */
  signatories: Nation[]
  /** 已同意签署方 */
  agreed: Nation[]
  /** 提案国 */
  proposedBy: Nation
  /** 会场一保密 → 无指标变化 */
  secret: boolean
  status: 'PROPOSED' | 'SIGNED' | 'REJECTED'
  /** 提案所在会期 */
  proposedSession: number
  /** 签署所在会期 */
  signedSession?: number
}

/** 协议草案（客户端提交内容） */
export interface ProtocolDraft {
  topic: ProtocolTopic
  title: string
  radicalness: number
  beneficiary: ProtocolBeneficiary
  signatories: Nation[]
  secret: boolean
}

// ========== 胜负结算（rules.md §6） ==========

/** 单国胜利分明细 */
export interface NationVictoryScore {
  nation: Nation
  victoryScore: number
  /** 已达成战略目标文案 */
  achievedGoals: string[]
  /** 有利条约数 */
  favorableTreaties: number
  breakdown: {
    publicSupport: number
    oppositionPressure: number
    colonyUnrest: number
    achievedGoals: number
    favorableTreaties: number
    penalties: number
  }
}

/** 结算结果 */
export interface VictoryResult {
  scores: Record<Nation, NationVictoryScore>
  /** 胜者：国家 | 'SHARED'(完美雅尔塔) | 'ALL_LOSE'(三战) | 'DRAW' */
  outcome: Nation | 'SHARED' | 'ALL_LOSE' | 'DRAW'
  endingTitle: string
  endingText: string
  /** 触发的特殊结局文案 */
  specialEndings: string[]
}

/** 引擎事件类型 */
export type GameEventType =
  | 'SESSION_START'
  | 'PHASE_CHANGE'
  | 'METRIC_DELTA'
  | 'MILITARY_ORDER'
  | 'WIRETAP'
  | 'JAMMER_DEPLOY'
  | 'ROOSEVELT_BULLETIN'
  | 'ROOSEVELT_DECEASED'
  | 'STALIN_ARCHIVE'
  | 'POLAND_UPRISING'
  | 'UK_ELECTION'
  | 'PETITION'
  | 'LOG'

/** 引擎事件（事件溯源基础） */
export interface GameEvent {
  id: string
  type: GameEventType
  session: number
  phase: SessionPhase
  timestamp: number
  payload:
    | MilitaryResult
    | WiretapResult
    | MetricDelta[]
    | { from: SessionPhase; to: SessionPhase }
    | { message: string }
    | MedicalBulletin
    | RooseveltState
    | StalinArchiveState
    | PolandUprisingState
    | UKElectionState
    | PetitionState
    | Petition
}

/** 日志条目 */
export interface LogEntry {
  id: string
  session: number
  phase: SessionPhase
  text: string
  kind: 'info' | 'action' | 'result' | 'crisis'
}

/** 完整游戏状态（aggregator 聚合根） */
export interface GameState {
  seed: number
  session: number
  phase: SessionPhase
  metrics: Record<Nation, NationMetrics>
  /** 全局国际舆论不利度 */
  intlOpinion: number
  /** 罗斯福健康度（仅美国专属，全局唯一） */
  rooseveltHealth: number
  /** 罗斯福健康事件链状态 */
  roosevelt: RooseveltState
  /** 历史医疗简报 */
  medicalBulletins: MedicalBulletin[]
  /** 苏联是否本会期部署干扰器 */
  sovietJammerActive: boolean
  /** 斯大林情报库事件链 */
  stalinArchive: StalinArchiveState
  /** 波兰起义事件链 */
  polandUprising: PolandUprisingState
  /** 英国大选倒计时事件链 */
  ukElection: UKElectionState
  /** 抗议信系统 */
  petitions: PetitionState
  /** 协议系统（rules.md §4） */
  protocols: Protocol[]
  /** 已达成战略目标（协议派生，终局再并入终局状态目标） */
  achievedGoals: Record<Nation, string[]>
  /** 结算结果（第 7 会期闭幕时计算，非空即游戏结束） */
  settlement: VictoryResult | null
  /** 累计事件（事件溯源） */
  events: GameEvent[]
  /** 可读日志 */
  logs: LogEntry[]
  /** 动作计数（用于 seeded random 种子） */
  actionCounter: number
}
