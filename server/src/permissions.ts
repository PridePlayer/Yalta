// 角色权限：混合制
// 队长（三巨头）：可执行本国所有动作 + 推进议程 + 终决权
// 幕僚：仅可执行所绑席位的专项动作，队长有否决权（v1 简化：幕僚动作直接生效，队长可随时接管）

import type { GameAction, PlayerRole } from '../../shared/protocol'
import { roleNation, isLeader, isSupport } from '../../shared/protocol'
import type { Seat } from '../../shared/domain/types'
import { SEATS } from '../../shared/data/seats'

// roleNation / isLeader / isSupport 已移至 @shared/protocol，前后端共用

/** 检查玩家是否有权执行某动作 */
export function canPerformAction(role: PlayerRole, action: GameAction, currentPhase: string): { allowed: boolean; reason?: string } {
  const nation = roleNation(role)
  if (!nation) {
    return { allowed: false, reason: '旁观者无法执行动作' }
  }

  // 推进议程：仅队长可推进
  // （ADVANCE_PHASE 是独立消息类型，不走此函数，此处不处理）

  switch (action.kind) {
    case 'MILITARY_ORDER': {
      // 军事命令：动作方国家须与角色国家一致
      if (action.order.nation !== nation) {
        return { allowed: false, reason: '无权指挥他国军队' }
      }
      // 幕僚：必须是该席位的军事官
      if (isSupport(role)) {
        const seat = SEATS.find((s) => s.id === role.seatId)
        if (!seat || seat.role !== 'MILITARY') {
          return { allowed: false, reason: '幕僚仅可执行本职动作' }
        }
        if (action.order.seatId !== role.seatId) {
          return { allowed: false, reason: '幕僚仅可代表本人席位行动' }
        }
      }
      // 队长：可代表本国任何军事席位下令
      return { allowed: true }
    }

    case 'WIRETAP': {
      if (action.order.nation !== nation) {
        return { allowed: false, reason: '无权调度他国情报官' }
      }
      if (isSupport(role)) {
        const seat = SEATS.find((s) => s.id === role.seatId)
        if (!seat || seat.role !== 'INTEL') {
          return { allowed: false, reason: '幕僚仅可执行本职动作' }
        }
        if (action.order.seatId !== role.seatId) {
          return { allowed: false, reason: '幕僚仅可代表本人席位行动' }
        }
      }
      return { allowed: true }
    }

    case 'DEPLOY_JAMMER': {
      // 干扰器：仅苏联队长或苏联情报幕僚
      if (nation !== 'SU') {
        return { allowed: false, reason: '仅苏方可部署干扰器' }
      }
      if (isSupport(role)) {
        const seat = SEATS.find((s) => s.id === role.seatId)
        if (!seat || seat.role !== 'INTEL') {
          return { allowed: false, reason: '仅情报幕僚可部署干扰器' }
        }
      }
      return { allowed: true }
    }

    case 'INVOKE_STALIN_ARCHIVE': {
      // 斯大林情报库：仅苏联队长
      if (nation !== 'SU' || !isLeader(role)) {
        return { allowed: false, reason: '仅苏联队长可调用情报库' }
      }
      return { allowed: true }
    }

    case 'POLAND_RESPONSE': {
      // 波兰危机应对：根据应对选项限制国家
      // SUPPRESS/ALLOW：苏联队长；SUPPORT：美国或英国队长
      if (action.response === 'SUPPRESS' || action.response === 'ALLOW') {
        if (nation !== 'SU' || !isLeader(role)) {
          return { allowed: false, reason: '仅苏联队长可决定镇压/默许' }
        }
      } else if (action.response === 'SUPPORT') {
        if (!isLeader(role) || nation === 'SU') {
          return { allowed: false, reason: '仅西方队长可支持起义' }
        }
      }
      return { allowed: true }
    }

    case 'POLAND_RESOLVE': {
      // 波兰终局：任意队长
      if (!isLeader(role)) {
        return { allowed: false, reason: '仅队长可揭示终局' }
      }
      return { allowed: true }
    }

    case 'PETITION_HANDLE': {
      // 抗议信处理：任意队长
      if (!isLeader(role)) {
        return { allowed: false, reason: '仅队长可处置请愿' }
      }
      return { allowed: true }
    }

    default:
      return { allowed: false, reason: '未知动作' }
  }
}

/** 推进议程权限：仅队长 */
export function canAdvancePhase(role: PlayerRole): boolean {
  return isLeader(role)
}

/** 重置游戏权限：仅队长 */
export function canReset(role: PlayerRole): boolean {
  return isLeader(role)
}

/** 获取该角色可见的席位列表（用于 UI 显示可执行动作） */
export function getControllableSeats(role: PlayerRole): Seat[] {
  const nation = roleNation(role)
  if (!nation) return []

  if (isLeader(role)) {
    // 队长：本国全部席位
    return SEATS.filter((s) => s.nation === nation)
  }

  if (isSupport(role)) {
    // 幕僚：仅本人席位
    return SEATS.filter((s) => s.id === role.seatId)
  }

  return []
}
