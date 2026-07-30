// 前端 gameStore：服务器权威 + 本地只读镜像
// 所有动作改为发 WebSocket 消息，状态由服务器推送
// 旧的本地状态聚合逻辑已迁移至 server/src/gameServer.ts

import type {
  MilitaryOrder,
  WiretapOrder,
  WiretapTier,
  VenueId,
  Nation,
  SessionPhase,
} from '@shared/domain/types'
import { VENUES } from '@shared/data/venues'
import type { SerializableGameState, GameAction } from '@shared/protocol'
import {
  useServerState,
  send,
} from '../net/client'

// ========== 阶段名 ==========

const PHASE_NAME: Record<SessionPhase, string> = {
  TOPIC: '议程',
  VENUE: '分会场',
  MILITARY: '军议',
  CRISIS: '危机',
  PRESS: '记者会',
}

// ========== React Hook ==========

/**
 * 订阅服务器状态。
 * 注意：未连接或游戏未开始时返回 null。
 * 调用方应在 App.tsx 层面 gate 渲染，确保下游组件拿到非空状态。
 */
export function useGameState(): SerializableGameState | null {
  return useServerState()
}

/** 取阶段中文名（纯函数，调用方传 state.phase） */
export function getPhaseName(phase: SessionPhase): string {
  return PHASE_NAME[phase]
}

// ========== 动作（发 WebSocket） ==========

/** 下达军事命令 */
export function issueMilitaryOrder(order: MilitaryOrder): void {
  send({ type: 'ACTION', action: { kind: 'MILITARY_ORDER', order } })
}

/** 发起窃听 */
export function issueWiretap(order: WiretapOrder): void {
  send({ type: 'ACTION', action: { kind: 'WIRETAP', order } })
}

/** 苏联部署干扰器 */
export function deployJammer(): void {
  send({ type: 'ACTION', action: { kind: 'DEPLOY_JAMMER' } })
}

/** 调用斯大林情报库 */
export function invokeStalinArchiveAction(): void {
  send({ type: 'ACTION', action: { kind: 'INVOKE_STALIN_ARCHIVE' } })
}

/** 波兰起义 OUTBREAK 阶段应对 */
export function respondToPolandOutbreak(response: 'SUPPRESS' | 'ALLOW' | 'SUPPORT'): void {
  send({ type: 'ACTION', action: { kind: 'POLAND_RESPONSE', response } })
}

/** 波兰起义 ESCALATION → RESOLUTION */
export function resolvePolandUprisingAction(): void {
  send({ type: 'ACTION', action: { kind: 'POLAND_RESOLVE' } })
}

/** 处理一封抗议信 */
export function handlePetitionAction(petitionId: string, handling: 'RESPOND' | 'ARCHIVE' | 'REJECT'): void {
  send({ type: 'ACTION', action: { kind: 'PETITION_HANDLE', petitionId, handling } })
}

/** 推进到下一阶段 / 下一会期 */
export function advancePhase(): void {
  send({ type: 'ADVANCE_PHASE' })
}

/** 重置游戏 */
export function resetGame(seed: number): void {
  send({ type: 'RESET', seed })
}

// ========== UI 辅助 ==========

/** 可窃听会场列表（供 UI 使用） */
export function getWiretapTargets(): { venueId: VenueId; venueName: string; targetNation: Nation }[] {
  return VENUES
    .filter((v) => v.allowWiretap)
    .map((v) => {
      const nationMap: Record<string, Nation> = { V2: 'US', V3: 'UK', V4: 'SU', V5: 'SU' }
      return { venueId: v.id, venueName: v.name, targetNation: nationMap[v.id] }
    })
}

// 导出类型供组件使用
export type { MetricDelta, WiretapOrder, WiretapTier, VenueId, Nation, Petition } from '@shared/domain/types'
export type { GameAction, SerializableGameState }
