import { useState } from 'react'
import { SEATS } from '@shared/data/seats'
import {
  issueMilitaryOrder,
  issueWiretap,
  deployJammer,
  advancePhase,
  resetGame,
  useGameState,
  getWiretapTargets,
  invokeStalinArchiveAction,
  respondToPolandOutbreak,
  resolvePolandUprisingAction,
  handlePetitionAction,
} from '../state/gameStore'
import { useSelf, useLastActionResult } from '../net/client'
import { isLeader, roleNation, roleLabel } from '@shared/protocol'
import type { PlayerRole } from '@shared/protocol'
import type { MilitaryOrderType, Nation, MilitaryOrder, WiretapOrder, WiretapTier, PetitionSource } from '@shared/domain/types'

// 注：本组件依赖 useGameState() 返回非空状态，由 App.tsx 在游戏开始后挂载

const NATION_LABEL: Record<Nation, string> = { US: '美', UK: '英', SU: '苏' }
const ORDER_TYPES: { value: MilitaryOrderType; label: string }[] = [
  { value: 'OFFENSIVE', label: '进攻' },
  { value: 'DEFENSIVE', label: '防御' },
  { value: 'WITHDRAW', label: '撤退' },
  { value: 'REDEPLOY', label: '重新部署' },
]

const PETITION_SOURCE_LABEL: Record<PetitionSource, string> = {
  SMALL_STATE: '小国',
  COLONY: '殖民地',
  EXILE_GOV: '流亡政府',
}

const militarySeats = SEATS.filter((s) => s.role === 'MILITARY')
const intelSeats = SEATS.filter((s) => s.role === 'INTEL')
const wiretapTargets = getWiretapTargets()

export function ActionPanel() {
  const state = useGameState()
  const self = useSelf()
  const lastResult = useLastActionResult()

  // 军事推演表单状态
  const [seatId, setSeatId] = useState(militarySeats[0].id)
  const [orderType, setOrderType] = useState<MilitaryOrderType>('OFFENSIVE')
  const [force, setForce] = useState(5)
  const [target, setTarget] = useState('柏林')
  const [intent, setIntent] = useState('')

  // 窃听表单状态
  const [intelSeatId, setIntelSeatId] = useState(intelSeats[0].id)
  const [wiretapVenueIdx, setWiretapVenueIdx] = useState(0)
  const [wiretapTier, setWiretapTier] = useState<WiretapTier>('FULL')

  if (!state) return null

  const seat = SEATS.find((s) => s.id === seatId)!
  const intelSeat = SEATS.find((s) => s.id === intelSeatId)!
  const wiretapTarget = wiretapTargets[wiretapVenueIdx]
  const canPartial = intelSeat.nation === 'SU'
  const effectiveTier = canPartial ? wiretapTier : 'FULL'

  // 当前角色权限
  const role: PlayerRole | null = self?.role ?? null
  const myNation = role ? roleNation(role) : null
  const amLeader = role ? isLeader(role) : false
  // 旁观者无任何动作权
  const isObserver = !role || role === 'SPECTATOR'

  function handleMilitary() {
    const order: MilitaryOrder = {
      seatId,
      nation: seat.nation,
      type: orderType,
      force,
      target,
      intent,
    }
    issueMilitaryOrder(order)
  }

  function handleWiretap() {
    const order: WiretapOrder = {
      seatId: intelSeatId,
      nation: intelSeat.nation,
      targetVenue: wiretapTarget.venueId,
      targetNation: wiretapTarget.targetNation,
      tier: effectiveTier,
    }
    issueWiretap(order)
  }

  const gameEnded = state.gameEnded

  // 斯大林情报库可调用条件：波兰讨论 ≥ 2 且未调用 + 我是苏联队长
  const canInvokeStalin =
    state.polandUprising.polandDiscussedSessions >= 2 &&
    !state.stalinArchive.invoked &&
    amLeader &&
    myNation === 'SU'
  // 波兰危机应对
  const polandOutbreak = state.polandUprising.phase === 'OUTBREAK'
  const polandEscalation = state.polandUprising.phase === 'ESCALATION'
  // 波兰应对可见按钮的玩家组
  const canPolandSuppressOrAllow = amLeader && myNation === 'SU'
  const canPolandSupport = amLeader && (myNation === 'US' || myNation === 'UK')

  // 军事表单只显示本国席位
  const visibleMilitarySeats = myNation
    ? militarySeats.filter((s) => s.nation === myNation)
    : militarySeats
  const visibleIntelSeats = myNation
    ? intelSeats.filter((s) => s.nation === myNation)
    : intelSeats

  return (
    <div className="panel panel-action">
      <div className="panel-heading">
        <span className="heading-ornament">❦</span>
        <h2>决断之厅</h2>
        <span className="heading-ornament">❦</span>
      </div>

      {/* 角色与反馈条 */}
      <div className="role-banner">
        <span className="role-name">
          {self ? `身份：${roleLabel(self.role)}` : '未登录'}
        </span>
        {lastResult && (
          <span className={`role-feedback ${lastResult.success ? 'ok' : 'err'}`}>
            {lastResult.success ? '✓' : '✗'} {lastResult.message}
          </span>
        )}
      </div>

      {/* 旁观者提示 */}
      {isObserver && !gameEnded && (
        <div className="dispatch-empty">
          <span className="empty-ornament">⚜</span>
          <p>旁观者无决断之权。</p>
          <p className="empty-hint">可在大厅选择角色后再行决策。</p>
        </div>
      )}

      {/* 军事推演 */}
      {state.phase === 'MILITARY' && !gameEnded && !isObserver && (
        <div className="dispatch-form">
          <div className="dispatch-header">
            <span className="dispatch-stamp">军令·前线</span>
            <span className="dispatch-no">急电 · 限即刻发</span>
          </div>

          <label className="field">
            <span className="field-label">签发将领</span>
            <select value={seatId} onChange={(e) => setSeatId(e.target.value)}>
              {visibleMilitarySeats.map((s) => (
                <option key={s.id} value={s.id}>
                  {NATION_LABEL[s.nation]} · {s.name}（才略 {s.commanderSkill}）
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">指令类型</span>
            <select value={orderType} onChange={(e) => setOrderType(e.target.value as MilitaryOrderType)}>
              {ORDER_TYPES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">投入兵力 <span className="field-value">{force} 个师</span></span>
            <input type="range" min={1} max={10} value={force} onChange={(e) => setForce(Number(e.target.value))} />
          </label>

          <label className="field">
            <span className="field-label">目标地域</span>
            <input type="text" value={target} onChange={(e) => setTarget(e.target.value)} />
          </label>

          <label className="field">
            <span className="field-label">战略意图（可略）</span>
            <input type="text" value={intent} onChange={(e) => setIntent(e.target.value)} placeholder="此战所欲达之目的" />
          </label>

          <button className="btn-seal" onClick={handleMilitary}>用印 · 发出军令</button>
        </div>
      )}

      {/* 窃听 */}
      {state.phase === 'VENUE' && !gameEnded && !isObserver && (
        <div className="dispatch-form">
          <div className="dispatch-header dispatch-header-intel">
            <span className="dispatch-stamp dispatch-stamp-intel">暗谍·渗透</span>
            <span className="dispatch-no">机密 · 限阅即焚</span>
          </div>

          <label className="field">
            <span className="field-label">情报主官</span>
            <select value={intelSeatId} onChange={(e) => setIntelSeatId(e.target.value)}>
              {visibleIntelSeats.map((s) => (
                <option key={s.id} value={s.id}>
                  {NATION_LABEL[s.nation]} · {s.name}（谍术 {s.intelSkill}）
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">渗透目标</span>
            <select value={wiretapVenueIdx} onChange={(e) => setWiretapVenueIdx(Number(e.target.value))}>
              {wiretapTargets.map((t, i) => (
                <option key={t.venueId} value={i}>
                  {t.venueName}（{NATION_LABEL[t.targetNation]}方）
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">
              情报等级
              {!canPartial && <span className="field-hint">（他国仅可取完整）</span>}
            </span>
            <div className="tier-options">
              <button
                type="button"
                className={`tier-btn ${effectiveTier === 'PARTIAL' ? 'active' : ''}`}
                onClick={() => setWiretapTier('PARTIAL')}
                disabled={!canPartial}
              >
                部分{canPartial ? '·免费' : ''}
              </button>
              <button
                type="button"
                className={`tier-btn ${effectiveTier === 'FULL' ? 'active' : ''}`}
                onClick={() => setWiretapTier('FULL')}
              >
                完整·耗2点
              </button>
            </div>
          </label>

          <button className="btn-seal btn-seal-intel" onClick={handleWiretap}>密令 · 潜入</button>

          {/* 苏联干扰器：仅苏方可见 */}
          {myNation === 'SU' && (
            <div className="jammer-section">
              <button
                className="btn-jammer"
                onClick={deployJammer}
                disabled={state.sovietJammerActive}
              >
                {state.sovietJammerActive ? '干扰器运转中' : '苏方·启用干扰器'}
              </button>
              <p className="jammer-hint">每会期一次，降低他国监听胜算 15%</p>
            </div>
          )}
        </div>
      )}

      {/* 斯大林情报库调用 */}
      {canInvokeStalin && !gameEnded && (
        <div className="dispatch-form">
          <div className="dispatch-header dispatch-header-stalin">
            <span className="dispatch-stamp dispatch-stamp-stalin">底牌·情报库</span>
            <span className="dispatch-no">苏方特权 · 一次性</span>
          </div>
          <p className="action-hint">波兰问题陷入僵局，斯大林可亮出情报库底牌威胁西方。成功率 100%，但有 30% 反噬风险。</p>
          <button className="btn-seal btn-seal-stalin" onClick={invokeStalinArchiveAction}>亮出底牌</button>
        </div>
      )}

      {/* 波兰起义 OUTBREAK 应对 */}
      {polandOutbreak && !gameEnded && (
        <div className="dispatch-form">
          <div className="dispatch-header dispatch-header-crisis">
            <span className="dispatch-stamp dispatch-stamp-crisis">危机·波兰</span>
            <span className="dispatch-no">三巨头须立即表态</span>
          </div>
          <p className="action-hint">华沙爆发反苏示威，如何应对？</p>
          <div className="crisis-options">
            <button
              className="btn-crisis btn-crisis-suppress"
              onClick={() => respondToPolandOutbreak('SUPPRESS')}
              disabled={!canPolandSuppressOrAllow}
            >
              苏军镇压
            </button>
            <button
              className="btn-crisis btn-crisis-allow"
              onClick={() => respondToPolandOutbreak('ALLOW')}
              disabled={!canPolandSuppressOrAllow}
            >
              斯大林默许
            </button>
            <button
              className="btn-crisis btn-crisis-support"
              onClick={() => respondToPolandOutbreak('SUPPORT')}
              disabled={!canPolandSupport}
            >
              西方支持
            </button>
          </div>
        </div>
      )}

      {/* 波兰起义 ESCALATION → RESOLUTION */}
      {polandEscalation && !gameEnded && (
        <div className="dispatch-form">
          <div className="dispatch-header dispatch-header-crisis">
            <span className="dispatch-stamp dispatch-stamp-crisis">终局·波兰</span>
            <span className="dispatch-no">局势即将定鼎</span>
          </div>
          <p className="action-hint">波兰危机进入升级阶段，揭示最终后果。</p>
          <button
            className="btn-seal btn-seal-crisis"
            onClick={resolvePolandUprisingAction}
            disabled={!amLeader}
          >
            揭示终局
          </button>
        </div>
      )}

      {/* 抗议信处理 */}
      {state.petitions.pending.length > 0 && !gameEnded && (
        <div className="dispatch-form">
          <div className="dispatch-header dispatch-header-petition">
            <span className="dispatch-stamp dispatch-stamp-petition">请愿·待裁</span>
            <span className="dispatch-no">{state.petitions.pending.length} 封待处理</span>
          </div>

          {state.petitions.pending.map((p) => (
            <div key={p.id} className="petition-card">
              <div className="petition-header">
                <span className="petition-source">{PETITION_SOURCE_LABEL[p.source as PetitionSource]}</span>
                <span className="petition-name">{p.sourceName}</span>
              </div>
              <p className="petition-topic">「{p.topic}」</p>
              <div className="petition-actions">
                <button
                  className="btn-petition btn-petition-respond"
                  onClick={() => handlePetitionAction(p.id, 'RESPOND')}
                  disabled={!amLeader}
                >
                  回应
                </button>
                <button
                  className="btn-petition btn-petition-archive"
                  onClick={() => handlePetitionAction(p.id, 'ARCHIVE')}
                  disabled={!amLeader}
                >
                  存档
                </button>
                <button
                  className="btn-petition btn-petition-reject"
                  onClick={() => handlePetitionAction(p.id, 'REJECT')}
                  disabled={!amLeader}
                >
                  驳回
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(['TOPIC', 'CRISIS', 'PRESS'].includes(state.phase)) &&
        !gameEnded &&
        !canInvokeStalin &&
        !polandOutbreak &&
        !polandEscalation &&
        state.petitions.pending.length === 0 && (
        <div className="dispatch-empty">
          <span className="empty-ornament">⚜</span>
          <p>此时无可签发之电文。</p>
          <p className="empty-hint">请推动议程，以候战机。</p>
        </div>
      )}

      {gameEnded && (
        <div className="dispatch-empty">
          <span className="empty-ornament">⚜</span>
          <p>会议已闭幕。</p>
          <p className="empty-hint">历史已成定局。</p>
        </div>
      )}

      <div className="phase-bar">
        <button className="btn-advance" onClick={advancePhase} disabled={gameEnded || !amLeader}>
          {gameEnded ? '终局' : amLeader ? '推动议程 ▸' : '等待队长推进'}
        </button>
        <button
          className="btn-reset"
          onClick={() => resetGame(20250204)}
          disabled={!amLeader}
        >
          重启会议
        </button>
      </div>
    </div>
  )
}
