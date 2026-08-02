// 卡牌化动作：当前阶段的可用动作以手牌形式横排展示
// 每张卡牌顶部显示：操作者头像 + 国徽 + 签名印章
// 点击卡牌展开操作表单

import { useState } from 'react'
import { SEATS } from '@shared/data/seats'
import { LeaderAvatar } from './LeaderAvatar'
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
  proposeProtocol,
  signProtocol,
} from '../state/gameStore'
import { useSelf, useLastActionResult } from '../net/client'
import { isLeader, roleNation, roleLabel } from '@shared/protocol'
import type { PlayerRole } from '@shared/protocol'
import type {
  MilitaryOrderType,
  Nation,
  MilitaryOrder,
  WiretapOrder,
  WiretapTier,
  PetitionSource,
  ProtocolTopic,
  ProtocolDraft,
  ProtocolBeneficiary,
} from '@shared/domain/types'
import { PROTOCOL_TOPIC_LABEL } from '@shared/domain/types'
import { defaultBeneficiary } from '@shared/engine/protocol'

const PROTOCOL_TOPICS: ProtocolTopic[] = ['GERMANY', 'POLAND', 'FAR_EAST', 'UN', 'OTHER']
const ALL_NATIONS: Nation[] = ['US', 'UK', 'SU']

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

/** 一张可操作卡牌的元数据 */
interface CardMeta {
  id: string
  title: string
  subtitle: string
  nation: Nation | null
  /** 卡牌类型：决定表单内容 */
  kind: 'military' | 'wiretap' | 'jammer' | 'stalin' | 'poland-outbreak' | 'poland-resolve' | 'petition' | 'protocol-propose' | 'protocol-sign' | 'empty' | 'ended'
  /** 是否可执行（权限/条件） */
  playable: boolean
  reason?: string
  /** 协议签署卡关联的协议 ID */
  protocolId?: string
}

export function ActionCard() {
  const state = useGameState()
  const self = useSelf()
  const lastResult = useLastActionResult()
  const [expanded, setExpanded] = useState<string | null>(null)

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

  // 协议草案表单状态（rules.md §4）
  const [protoTopic, setProtoTopic] = useState<ProtocolTopic>('GERMANY')
  const [protoRadicalness, setProtoRadicalness] = useState(50)
  const [protoBenefit, setProtoBenefit] = useState<ProtocolBeneficiary>(defaultBeneficiary('GERMANY', 'US'))
  const [protoSignatories, setProtoSignatories] = useState<Nation[]>([...ALL_NATIONS])
  const [protoSecret, setProtoSecret] = useState(false)
  // 切换议题时，按本方利益重置默认受益分配
  function changeProtoTopic(t: ProtocolTopic) {
    setProtoTopic(t)
    setProtoBenefit(defaultBeneficiary(t, myNation ?? 'US'))
  }

  if (!state) return null

  const seat = SEATS.find((s) => s.id === seatId)!
  const intelSeat = SEATS.find((s) => s.id === intelSeatId)!
  const wiretapTarget = wiretapTargets[wiretapVenueIdx]
  const canPartial = intelSeat.nation === 'SU'
  const effectiveTier = canPartial ? wiretapTier : 'FULL'

  // 角色权限
  const role: PlayerRole | null = self?.role ?? null
  const myNation = role ? roleNation(role) : null
  const amLeader = role ? isLeader(role) : false
  const isObserver = !role || role === 'SPECTATOR'

  const gameEnded = state.gameEnded

  // 根据阶段生成可用卡牌
  const cards: CardMeta[] = []

  if (gameEnded) {
    cards.push({ id: 'ended', title: '会议闭幕', subtitle: '历史已成定局', nation: null, kind: 'ended', playable: false })
  } else if (isObserver) {
    cards.push({ id: 'observe', title: '旁观中', subtitle: '无可签发之电文', nation: null, kind: 'empty', playable: false })
  } else if (state.phase === 'MILITARY') {
    // 军事推演卡：每个本国军事席位一张
    const myMilitary = myNation ? militarySeats.filter((s) => s.nation === myNation) : militarySeats
    for (const s of myMilitary) {
      cards.push({
        id: `military-${s.id}`,
        title: `${s.name}·军令`,
        subtitle: '签发前线作战指令',
        nation: s.nation,
        kind: 'military',
        playable: true,
      })
    }
  } else if (state.phase === 'VENUE') {
    // 窃听卡：每个本国情报席位一张
    const myIntel = myNation ? intelSeats.filter((s) => s.nation === myNation) : intelSeats
    for (const s of myIntel) {
      cards.push({
        id: `wiretap-${s.id}`,
        title: `${s.name}·潜入`,
        subtitle: '渗透他国会场窃听',
        nation: s.nation,
        kind: 'wiretap',
        playable: true,
      })
    }
    // 苏联干扰器卡
    if (myNation === 'SU') {
      cards.push({
        id: 'jammer',
        title: '启用干扰器',
        subtitle: '降低他国监听胜算 15%',
        nation: 'SU',
        kind: 'jammer',
        playable: !state.sovietJammerActive,
        reason: state.sovietJammerActive ? '本会期已启用' : undefined,
      })
    }
  }

  // 事件链触发的卡牌（任何阶段都可能出现）
  const canInvokeStalin =
    state.polandUprising.polandDiscussedSessions >= 2 &&
    !state.stalinArchive.invoked &&
    amLeader &&
    myNation === 'SU'
  if (canInvokeStalin) {
    cards.push({
      id: 'stalin',
      title: '亮出情报库底牌',
      subtitle: '苏方特权 · 100% 成功 · 30% 反噬',
      nation: 'SU',
      kind: 'stalin',
      playable: true,
    })
  }

  if (state.polandUprising.phase === 'OUTBREAK') {
    if (amLeader && myNation === 'SU') {
      cards.push({ id: 'poland-suppress', title: '苏军镇压', subtitle: '华沙反苏示威', nation: 'SU', kind: 'poland-outbreak', playable: true })
      cards.push({ id: 'poland-allow', title: '斯大林默许', subtitle: '让步以促成妥协', nation: 'SU', kind: 'poland-outbreak', playable: true })
    }
    if (amLeader && (myNation === 'US' || myNation === 'UK')) {
      cards.push({ id: 'poland-support', title: '西方支持起义', subtitle: '公开支持华沙示威', nation: myNation!, kind: 'poland-outbreak', playable: true })
    }
  }

  if (state.polandUprising.phase === 'ESCALATION' && amLeader) {
    cards.push({
      id: 'poland-resolve',
      title: '揭示波兰终局',
      subtitle: '局势即将定鼎',
      nation: myNation,
      kind: 'poland-resolve',
      playable: true,
    })
  }

  // 抗议信卡牌
  if (amLeader && state.petitions.pending.length > 0) {
    for (const p of state.petitions.pending) {
      cards.push({
        id: `petition-${p.id}`,
        title: `${PETITION_SOURCE_LABEL[p.source as PetitionSource]}·请愿`,
        subtitle: `「${p.topic}」`,
        nation: myNation,
        kind: 'petition',
        playable: true,
      })
    }
  }

  // 协议：提案卡（分会场 / 危机阶段，队长可提议）
  if (amLeader && !gameEnded && (state.phase === 'VENUE' || state.phase === 'CRISIS')) {
    cards.push({
      id: 'protocol-propose',
      title: '拟定协议草案',
      subtitle: '提出议题 · 划定受益 · 邀约签署',
      nation: myNation,
      kind: 'protocol-propose',
      playable: true,
    })
  }

  // 协议：签署卡（待签且本方为签署方、尚未同意）
  if (amLeader && !gameEnded && myNation) {
    for (const p of state.protocols) {
      if (p.status === 'PROPOSED' && p.signatories.includes(myNation) && !p.agreed.includes(myNation)) {
        cards.push({
          id: `protocol-sign-${p.id}`,
          title: `签署《${p.title}》`,
          subtitle: `${PROTOCOL_TOPIC_LABEL[p.topic]} · 激进度 ${p.radicalness}`,
          nation: myNation,
          kind: 'protocol-sign',
          playable: true,
          protocolId: p.id,
        })
      }
    }
  }

  // 空状态
  if (cards.length === 0 && !gameEnded) {
    cards.push({
      id: 'wait',
      title: '静候战机',
      subtitle: '此时无可签发之电文',
      nation: myNation,
      kind: 'empty',
      playable: false,
    })
  }

  // 本阶段「你」可执行的动作数量（用于提示是否轮到你行动）
  const playableCount = cards.filter((c) => c.playable && c.kind !== 'ended').length

  function toggleCard(id: string) {
    setExpanded(expanded === id ? null : id)
  }

  return (
    <div className="action-card-root">
      {/* 角色横幅 + 反馈 */}
      <div className="role-banner">
        <span className="role-name">{self ? roleLabel(self.role) : '未登录'}</span>
        {lastResult && (
          <span className={`role-feedback ${lastResult.success ? 'ok' : 'err'}`}>
            {lastResult.success ? '✓' : '✗'} {lastResult.message}
          </span>
        )}
      </div>

      {/* 行动提示：明确告诉玩家本阶段是否轮到自己行动 */}
      <div className={`action-cue ${playableCount > 0 ? 'active' : 'idle'}`}>
        {isObserver
          ? '你正以旁观者身份静观会议'
          : playableCount > 0
            ? `⚡ 现在轮到你行动：本阶段你有 ${playableCount} 项可签发`
            : '本阶段你暂无动作，静候其他代表或队长推进议程'}
      </div>

      {/* 卡牌手牌区 */}
      <div className="card-hand">
        {cards.map((c) => {
          const isExpanded = expanded === c.id
          return (
          <div
            key={c.id}
            className={`action-card-item ${isExpanded ? 'expanded' : ''} ${!c.playable ? 'disabled' : ''}`}
          >
            {/* 卡牌头部：头像 + 标题 —— 仅头部可点击展开/收起，
                避免卡片内部的表单、按钮点击冒泡到容器导致自动收起 */}
            <div className="card-header" onClick={() => c.playable && toggleCard(c.id)}>
              {c.nation && <LeaderAvatar nation={c.nation} size={36} />}
              <div className="card-title-block">
                <div className="card-title">{c.title}</div>
                <div className="card-subtitle">{c.subtitle}</div>
              </div>
              {c.playable && <span className="card-chevron">{isExpanded ? '▾' : '▸'}</span>}
            </div>

              {/* 卡牌展开内容 */}
              {isExpanded && c.playable && (
                <div className="card-body">
                  {c.kind === 'military' && (
                    <MilitaryForm
                      seatId={c.id.replace('military-', '')}
                      seatIdState={seatId}
                      setSeatId={setSeatId}
                      orderType={orderType}
                      setOrderType={setOrderType}
                      force={force}
                      setForce={setForce}
                      target={target}
                      setTarget={setTarget}
                      intent={intent}
                      setIntent={setIntent}
                      onSubmit={() => {
                        const order: MilitaryOrder = {
                          seatId,
                          nation: seat.nation,
                          type: orderType,
                          force,
                          target,
                          intent,
                        }
                        issueMilitaryOrder(order)
                        setExpanded(null)
                      }}
                    />
                  )}

                  {c.kind === 'wiretap' && (
                    <WiretapForm
                      seatIdState={intelSeatId}
                      setSeatId={setIntelSeatId}
                      wiretapVenueIdx={wiretapVenueIdx}
                      setWiretapVenueIdx={setWiretapVenueIdx}
                      setWiretapTier={setWiretapTier}
                      canPartial={canPartial}
                      effectiveTier={effectiveTier}
                      onSubmit={() => {
                        const order: WiretapOrder = {
                          seatId: intelSeatId,
                          nation: intelSeat.nation,
                          targetVenue: wiretapTarget.venueId,
                          targetNation: wiretapTarget.targetNation,
                          tier: effectiveTier,
                        }
                        issueWiretap(order)
                        setExpanded(null)
                      }}
                    />
                  )}

                  {c.kind === 'jammer' && (
                    <button
                      className="btn-seal btn-seal-stalin"
                      onClick={() => { deployJammer(); setExpanded(null) }}
                    >
                      密令 · 启用干扰器
                    </button>
                  )}

                  {c.kind === 'stalin' && (
                    <button
                      className="btn-seal btn-seal-stalin"
                      onClick={() => { invokeStalinArchiveAction(); setExpanded(null) }}
                    >
                      亮出底牌
                    </button>
                  )}

                  {c.kind === 'poland-outbreak' && c.id === 'poland-suppress' && (
                    <button className="btn-crisis btn-crisis-suppress" onClick={() => { respondToPolandOutbreak('SUPPRESS'); setExpanded(null) }}>
                      签发镇压令
                    </button>
                  )}
                  {c.kind === 'poland-outbreak' && c.id === 'poland-allow' && (
                    <button className="btn-crisis btn-crisis-allow" onClick={() => { respondToPolandOutbreak('ALLOW'); setExpanded(null) }}>
                      签发默许令
                    </button>
                  )}
                  {c.kind === 'poland-outbreak' && c.id === 'poland-support' && (
                    <button className="btn-crisis btn-crisis-support" onClick={() => { respondToPolandOutbreak('SUPPORT'); setExpanded(null) }}>
                      发布支持声明
                    </button>
                  )}

                  {c.kind === 'poland-resolve' && (
                    <button className="btn-seal btn-seal-crisis" onClick={() => { resolvePolandUprisingAction(); setExpanded(null) }}>
                      揭示终局
                    </button>
                  )}

                  {c.kind === 'petition' && (
                    <PetitionForm
                      petitionId={c.id.replace('petition-', '')}
                      onHandle={(handling) => {
                        handlePetitionAction(c.id.replace('petition-', ''), handling)
                        setExpanded(null)
                      }}
                    />
                  )}

                  {c.kind === 'protocol-propose' && (
                    <ProtocolForm
                      topic={protoTopic}
                      setTopic={changeProtoTopic}
                      radicalness={protoRadicalness}
                      setRadicalness={setProtoRadicalness}
                      benefit={protoBenefit}
                      setBenefit={setProtoBenefit}
                      signatories={protoSignatories}
                      setSignatories={setProtoSignatories}
                      secret={protoSecret}
                      setSecret={setProtoSecret}
                      onSubmit={() => {
                        const draft: ProtocolDraft = {
                          topic: protoTopic,
                          title: `${PROTOCOL_TOPIC_LABEL[protoTopic]}协定`,
                          radicalness: protoRadicalness,
                          beneficiary: protoBenefit,
                          signatories: protoSignatories.length ? protoSignatories : [myNation!],
                          secret: protoSecret,
                        }
                        proposeProtocol(draft, myNation!)
                        setExpanded(null)
                      }}
                    />
                  )}

                  {c.kind === 'protocol-sign' && c.protocolId && (
                    <ProtocolSignForm
                      protocol={state.protocols.find((p) => p.id === c.protocolId)!}
                      myNation={myNation!}
                      onSign={() => {
                        signProtocol(c.protocolId!, myNation!)
                        setExpanded(null)
                      }}
                    />
                  )}
                </div>
              )}

              {!c.playable && c.reason && <div className="card-disabled-reason">{c.reason}</div>}
            </div>
          )
        })}
      </div>

      {/* 阶段推进栏 */}
      <div className="phase-bar">
        <button className="btn-advance" onClick={advancePhase} disabled={gameEnded || !amLeader}>
          {gameEnded ? '终局' : amLeader ? '推动议程 ▸' : '等待队长推进'}
        </button>
        <button className="btn-reset" onClick={() => resetGame(20250204)} disabled={!amLeader}>
          重启会议
        </button>
      </div>
    </div>
  )
}

// ========== 子表单 ==========

function MilitaryForm(props: {
  seatId: string
  seatIdState: string
  setSeatId: (v: string) => void
  orderType: MilitaryOrderType
  setOrderType: (v: MilitaryOrderType) => void
  force: number
  setForce: (v: number) => void
  target: string
  setTarget: (v: string) => void
  intent: string
  setIntent: (v: string) => void
  onSubmit: () => void
}) {
  const { seatIdState, setSeatId, orderType, setOrderType, force, setForce, target, setTarget, intent, setIntent, onSubmit } = props
  return (
    <div className="card-form">
      <label className="field">
        <span className="field-label">签发将领</span>
        <select value={seatIdState} onChange={(e) => setSeatId(e.target.value)}>
          {militarySeats.map((s) => (
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
      <button className="btn-seal" onClick={onSubmit}>用印 · 发出军令</button>
    </div>
  )
}

function WiretapForm(props: {
  seatIdState: string
  setSeatId: (v: string) => void
  wiretapVenueIdx: number
  setWiretapVenueIdx: (v: number) => void
  setWiretapTier: (v: WiretapTier) => void
  canPartial: boolean
  effectiveTier: WiretapTier
  onSubmit: () => void
}) {
  const { seatIdState, setSeatId, wiretapVenueIdx, setWiretapVenueIdx, setWiretapTier, canPartial, effectiveTier, onSubmit } = props
  return (
    <div className="card-form">
      <label className="field">
        <span className="field-label">情报主官</span>
        <select value={seatIdState} onChange={(e) => setSeatId(e.target.value)}>
          {intelSeats.map((s) => (
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
      <button className="btn-seal btn-seal-intel" onClick={onSubmit}>密令 · 潜入</button>
    </div>
  )
}

function PetitionForm(props: { petitionId: string; onHandle: (h: 'RESPOND' | 'ARCHIVE' | 'REJECT') => void }) {
  return (
    <div className="card-form">
      <div className="petition-actions">
        <button className="btn-petition btn-petition-respond" onClick={() => props.onHandle('RESPOND')}>
          回应
        </button>
        <button className="btn-petition btn-petition-archive" onClick={() => props.onHandle('ARCHIVE')}>
          存档
        </button>
        <button className="btn-petition btn-petition-reject" onClick={() => props.onHandle('REJECT')}>
          驳回
        </button>
      </div>
    </div>
  )
}

function ProtocolForm(props: {
  topic: ProtocolTopic
  setTopic: (t: ProtocolTopic) => void
  radicalness: number
  setRadicalness: (v: number) => void
  benefit: ProtocolBeneficiary
  setBenefit: (b: ProtocolBeneficiary) => void
  signatories: Nation[]
  setSignatories: (n: Nation[]) => void
  secret: boolean
  setSecret: (v: boolean) => void
  onSubmit: () => void
}) {
  const { topic, setTopic, radicalness, setRadicalness, benefit, setBenefit, signatories, setSignatories, secret, setSecret, onSubmit } = props
  const toggleSignatory = (n: Nation) => {
    if (signatories.includes(n)) {
      if (signatories.length === 1) return // 至少保留提案方
      setSignatories(signatories.filter((x) => x !== n))
    } else {
      setSignatories([...signatories, n])
    }
  }
  const setBen = (n: Nation, v: number) => setBenefit({ ...benefit, [n]: v })
  return (
    <div className="card-form">
      <label className="field">
        <span className="field-label">议题</span>
        <select value={topic} onChange={(e) => setTopic(e.target.value as ProtocolTopic)}>
          {PROTOCOL_TOPICS.map((t) => (
            <option key={t} value={t}>{PROTOCOL_TOPIC_LABEL[t]}</option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="field-label">激进度 <span className="field-value">{radicalness}</span></span>
        <input type="range" min={0} max={100} value={radicalness} onChange={(e) => setRadicalness(Number(e.target.value))} />
      </label>
      <div className="benefit-block">
        <span className="field-label">受益分配（正为受益，负为受损）</span>
        {ALL_NATIONS.map((n) => (
          <label key={n} className="field benefit-row">
            <span className="benefit-nation">{NATION_LABEL[n]}方</span>
            <input type="range" min={-100} max={100} value={benefit[n]} onChange={(e) => setBen(n, Number(e.target.value))} />
            <span className="field-value">{benefit[n] > 0 ? '+' : ''}{benefit[n]}</span>
          </label>
        ))}
      </div>
      <div className="field">
        <span className="field-label">签署方</span>
        <div className="signatory-options">
          {ALL_NATIONS.map((n) => (
            <label key={n} className="signatory-chip">
              <input type="checkbox" checked={signatories.includes(n)} onChange={() => toggleSignatory(n)} />
              {NATION_LABEL[n]}方
            </label>
          ))}
        </div>
      </div>
      <label className="field secret-row">
        <input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} />
        <span>会场一保密（签署后无指标变化）</span>
      </label>
      <button className="btn-seal btn-seal-stalin" onClick={onSubmit}>用印 · 提交草案</button>
    </div>
  )
}

function ProtocolSignForm(props: { protocol: import('@shared/domain/types').Protocol; myNation: Nation; onSign: () => void }) {
  const { protocol, myNation, onSign } = props
  const benefitTone = (v: number) => (v > 0 ? 'ben-pos' : v < 0 ? 'ben-neg' : 'ben-zero')
  return (
    <div className="card-form protocol-sign">
      <div className="proto-meta">
        <div>议题：{PROTOCOL_TOPIC_LABEL[protocol.topic]} · 激进度 {protocol.radicalness}{protocol.secret ? ' · 密约' : ''}</div>
      </div>
      <div className="proto-benefit">
        {ALL_NATIONS.map((n) => (
          <span key={n} className={`ben-pill ${benefitTone(protocol.beneficiary[n])}`}>
            {NATION_LABEL[n]} {protocol.beneficiary[n] > 0 ? '+' : ''}{protocol.beneficiary[n]}
          </span>
        ))}
      </div>
      <div className="proto-signatories">
        {protocol.signatories.map((n) => (
          <span key={n} className={`sig-pill ${protocol.agreed.includes(n) ? 'agreed' : ''}`}>
            {NATION_LABEL[n]}方{protocol.agreed.includes(n) ? '✓' : '…'}
          </span>
        ))}
      </div>
      <button className="btn-seal btn-seal-crisis" onClick={onSign}>
        {myNation ? `${NATION_LABEL[myNation]}方签署` : '签署'}
      </button>
    </div>
  )
}
