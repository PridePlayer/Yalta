// 网络协议：客户端 ↔ 服务器消息类型
// 前后端共用，避免类型漂移
// 混合制角色：3 队长（三巨头）+ N 幕僚（专项席位）+ 旁观者

import type { MilitaryOrder, WiretapOrder, Nation, SessionPhase, ProtocolDraft, Protocol, VictoryResult } from './domain/types'

// ========== 角色 ==========

/** 队长角色：三巨头 */
export type LeaderRole = 'LEADER_US' | 'LEADER_UK' | 'LEADER_SU'

/** 幕僚角色：绑定到具体席位 */
export interface SupportRole {
  type: 'SUPPORT'
  seatId: string
  nation: Nation
}

export type PlayerRole = LeaderRole | SupportRole | 'SPECTATOR'

export interface Player {
  id: string
  name: string
  role: PlayerRole
  online: boolean
}

// ========== 房间 ==========

export interface RoomInfo {
  code: string
  players: Player[]
  phase: SessionPhase
  session: number
  started: boolean
}

// ========== 客户端 → 服务器 ==========

export type ClientMessage =
  | { type: 'JOIN'; roomCode: string; playerName: string; preferredRole?: PlayerRole }
  | { type: 'ASSIGN_ROLE'; role: PlayerRole }
  | { type: 'START_GAME'; seed?: number }
  | { type: 'ACTION'; action: GameAction }
  | { type: 'ADVANCE_PHASE' }
  | { type: 'RESET'; seed?: number }

/** 游戏动作（由客户端发起，服务器裁决） */
export type GameAction =
  | { kind: 'MILITARY_ORDER'; order: MilitaryOrder }
  | { kind: 'WIRETAP'; order: WiretapOrder }
  | { kind: 'DEPLOY_JAMMER' }
  | { kind: 'INVOKE_STALIN_ARCHIVE' }
  | { kind: 'POLAND_RESPONSE'; response: 'SUPPRESS' | 'ALLOW' | 'SUPPORT' }
  | { kind: 'POLAND_RESOLVE' }
  | { kind: 'PETITION_HANDLE'; petitionId: string; handling: 'RESPOND' | 'ARCHIVE' | 'REJECT' }
  | { kind: 'PROPOSE_PROTOCOL'; draft: ProtocolDraft; proposedBy: Nation }
  | { kind: 'SIGN_PROTOCOL'; protocolId: string; nation: Nation }

// ========== 服务器 → 客户端 ==========

export type ServerMessage =
  | { type: 'ROOM_INFO'; room: RoomInfo }
  | { type: 'STATE'; state: SerializableGameState }
  | { type: 'LOG'; entries: LogEntryDTO[] }
  | { type: 'PRIVATE'; intel: PrivateIntel }
  | { type: 'ERROR'; message: string }
  | { type: 'ACTION_RESULT'; success: boolean; message: string }

/** 私密情报（仅发送给窃听方及相关队长） */
export interface PrivateIntel {
  /** 情报唯一 ID */
  id: string
  /** 来源会期 */
  session: number
  /** 窃听方国家 */
  nation: Nation
  /** 窃听目标会场名 */
  venueName: string
  /** 窃得内容 */
  content: string
  /** 情报等级 */
  tier: 'PARTIAL' | 'FULL'
}

/** 可序列化的游戏状态（去除内部字段，仅含客户端可见信息） */
export interface SerializableGameState {
  session: number
  phase: SessionPhase
  metrics: Record<Nation, { publicSupport: number; intelPoints: number; oppositionPressure: number; colonyUnrest: number }>
  intlOpinion: number
  rooseveltHealth: number
  roosevelt: { status: string; vigorPoints: number; trumanSucceeded: boolean; bulletinDelivered: boolean }
  medicalBulletins: { session: number; assessment: string; urgent: boolean; health: number }[]
  sovietJammerActive: boolean
  stalinArchive: { status: string; triggered: boolean; invoked: boolean; sovietCredibility: number; backlashTurns: number }
  polandUprising: { status: string; phase: string; polandDiscussedSessions: number; outbreakResponse?: string; westernIntervened: boolean; sovietConceded: boolean; resolution?: string }
  ukElection: { status: string; countdown: number; laborPolling: number; hawkishActions: number; softActions: number; churchillRetired: boolean; churchillAway: boolean }
  petitions: { pending: any[]; historyCount: number; consecutiveColonyIgnored: number; colonyUprisingTriggered: boolean }
  /** 协议系统（rules.md §4） */
  protocols: Protocol[]
  /** 已达成战略目标（协议派生） */
  achievedGoals: Record<Nation, string[]>
  /** 结算结果（非空即游戏结束） */
  settlement: VictoryResult | null
  logs: LogEntryDTO[]
  gameEnded: boolean
}

export interface LogEntryDTO {
  id: string
  session: number
  phase: SessionPhase
  text: string
  kind: 'info' | 'action' | 'result' | 'crisis'
}

// ========== 角色权限辅助（前后端共用） ==========

const LEADER_NATION: Record<LeaderRole, Nation> = {
  LEADER_US: 'US',
  LEADER_UK: 'UK',
  LEADER_SU: 'SU',
}

/** 获取角色所属国家 */
export function roleNation(role: PlayerRole): Nation | null {
  if (role === 'SPECTATOR') return null
  if (typeof role === 'string' && role.startsWith('LEADER_')) {
    return LEADER_NATION[role as LeaderRole]
  }
  return (role as SupportRole).nation
}

/** 判断角色是否为队长 */
export function isLeader(role: PlayerRole): role is LeaderRole {
  return typeof role === 'string' && role.startsWith('LEADER_')
}

/** 判断角色是否为幕僚 */
export function isSupport(role: PlayerRole): role is SupportRole {
  return typeof role === 'object' && role.type === 'SUPPORT'
}

/** 角色中文标签（UI 用） */
export function roleLabel(role: PlayerRole): string {
  if (role === 'SPECTATOR') return '旁观者'
  if (isLeader(role)) {
    const map: Record<LeaderRole, string> = {
      LEADER_US: '罗斯福总统',
      LEADER_UK: '丘吉尔首相',
      LEADER_SU: '斯大林元帅',
    }
    return map[role]
  }
  return `幕僚·${(role as SupportRole).seatId}`
}
