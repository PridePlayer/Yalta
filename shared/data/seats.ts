import type { Seat } from '../domain/types'

// 42 席位数据，按 intro.md 第 64~110 行明细。
// 法新社/中央社记者 nationality 简化归属（原型阶段，后续可扩展 NEUTRAL）。
export const SEATS: Seat[] = [
  // ===== 美利坚合众国代表团 14 人 =====
  { id: 'US-01', name: '富兰克林·德拉诺·罗斯福', nation: 'US', role: 'LEADER', isLeader: true, personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 1.0 } },
  { id: 'US-02', name: '爱德华·R·斯退丁纽斯', nation: 'US', role: 'DIPLOMAT', personality: { hawkish: 0.3, pragmatic: 0.8, loyal: 0.9 } },
  { id: 'US-03', name: '威廉·D·莱希', nation: 'US', role: 'MILITARY', commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.8, loyal: 0.95 } },
  { id: 'US-04', name: '哈里·霍布金斯', nation: 'US', role: 'AIDE', personality: { hawkish: 0.2, pragmatic: 0.9, loyal: 0.95 } },
  { id: 'US-05', name: '詹姆士·F·贝尔纳斯', nation: 'US', role: 'AIDE', personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.8 } },
  { id: 'US-06', name: '乔治·C·马歇尔', nation: 'US', role: 'MILITARY', commanderSkill: 10, personality: { hawkish: 0.6, pragmatic: 0.8, loyal: 0.9 } },
  { id: 'US-07', name: '欧内斯特·J·金', nation: 'US', role: 'MILITARY', commanderSkill: 9, personality: { hawkish: 0.7, pragmatic: 0.6, loyal: 0.85 } },
  { id: 'US-08', name: '布里恩·B·索默韦尔', nation: 'US', role: 'MILITARY', commanderSkill: 7, personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'US-09', name: '埃默里·S·兰德', nation: 'US', role: 'MILITARY', commanderSkill: 6, personality: { hawkish: 0.4, pragmatic: 0.6, loyal: 0.8 } },
  { id: 'US-10', name: 'L·S·卡特', nation: 'US', role: 'MILITARY', commanderSkill: 7, personality: { hawkish: 0.6, pragmatic: 0.6, loyal: 0.85 } },
  { id: 'US-11', name: 'W·阿弗里尔·哈里曼', nation: 'US', role: 'DIPLOMAT', personality: { hawkish: 0.4, pragmatic: 0.8, loyal: 0.9 } },
  { id: 'US-12', name: 'H·弗里曼·马修斯', nation: 'US', role: 'DIPLOMAT', personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'US-13', name: '阿耳杰尔·希斯', nation: 'US', role: 'INTEL', intelSkill: 7, personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.4 } },
  { id: 'US-14', name: '查尔斯·E·波伦', nation: 'US', role: 'DIPLOMAT', personality: { hawkish: 0.3, pragmatic: 0.8, loyal: 0.9 } },

  // ===== 大不列颠及北爱尔兰联合王国代表团 13 人 =====
  { id: 'UK-01', name: '温斯顿·丘吉尔', nation: 'UK', role: 'LEADER', isLeader: true, personality: { hawkish: 0.8, pragmatic: 0.6, loyal: 1.0 } },
  { id: 'UK-02', name: '安东尼·艾登', nation: 'UK', role: 'DIPLOMAT', personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.9 } },
  { id: 'UK-03', name: '莱瑟斯勋爵', nation: 'UK', role: 'AIDE', personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'UK-04', name: '克拉克·卡尔爵士', nation: 'UK', role: 'INTEL', intelSkill: 7, personality: { hawkish: 0.4, pragmatic: 0.8, loyal: 0.9 } },
  { id: 'UK-05', name: '亚历山大·贾德干爵士', nation: 'UK', role: 'DIPLOMAT', personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.9 } },
  { id: 'UK-06', name: '爱德华·布里奇爵士', nation: 'UK', role: 'AIDE', personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'UK-07', name: '艾伦·布鲁克爵士', nation: 'UK', role: 'MILITARY', commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.8, loyal: 0.9 } },
  { id: 'UK-08', name: '查尔斯·波特耳爵士', nation: 'UK', role: 'MILITARY', commanderSkill: 8, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'UK-09', name: '安德鲁·肯宁安爵士', nation: 'UK', role: 'MILITARY', commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'UK-10', name: '黑斯廷斯·伊斯梅爵士', nation: 'UK', role: 'AIDE', personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.9 } },
  { id: 'UK-11', name: '亚历山大陆军元帅', nation: 'UK', role: 'MILITARY', commanderSkill: 8, personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'UK-12', name: '威尔逊陆军元帅', nation: 'UK', role: 'MILITARY', commanderSkill: 7, personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'UK-13', name: '萨姆微耳海军上将', nation: 'UK', role: 'MILITARY', commanderSkill: 7, personality: { hawkish: 0.5, pragmatic: 0.6, loyal: 0.8 } },

  // ===== 苏维埃社会主义共和国联盟代表团 9 人 =====
  { id: 'SU-01', name: '约瑟夫·维萨里奥诺维奇·斯大林', nation: 'SU', role: 'LEADER', isLeader: true, personality: { hawkish: 0.7, pragmatic: 0.8, loyal: 1.0 } },
  { id: 'SU-02', name: '莫洛托夫', nation: 'SU', role: 'DIPLOMAT', personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.9 } },
  { id: 'SU-03', name: '库兹涅佐夫', nation: 'SU', role: 'MILITARY', commanderSkill: 8, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'SU-04', name: '安东诺夫', nation: 'SU', role: 'MILITARY', commanderSkill: 9, personality: { hawkish: 0.6, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'SU-05', name: '维辛斯基', nation: 'SU', role: 'INTEL', intelSkill: 8, personality: { hawkish: 0.7, pragmatic: 0.6, loyal: 0.9 } },
  { id: 'SU-06', name: '迈斯甚', nation: 'SU', role: 'DIPLOMAT', personality: { hawkish: 0.5, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'SU-07', name: '科迪亚库夫', nation: 'SU', role: 'MILITARY', commanderSkill: 7, personality: { hawkish: 0.5, pragmatic: 0.6, loyal: 0.8 } },
  { id: 'SU-08', name: '翟塞夫', nation: 'SU', role: 'DIPLOMAT', personality: { hawkish: 0.4, pragmatic: 0.7, loyal: 0.85 } },
  { id: 'SU-09', name: '葛罗米柯', nation: 'SU', role: 'DIPLOMAT', personality: { hawkish: 0.4, pragmatic: 0.8, loyal: 0.9 } },

  // ===== 新闻媒体记者团 6 人 =====
  { id: 'PR-01', name: '美联社记者', nation: 'US', role: 'JOURNALIST', personality: { hawkish: 0.3, pragmatic: 0.6, loyal: 0.7 } },
  { id: 'PR-02', name: '路透社记者', nation: 'UK', role: 'JOURNALIST', personality: { hawkish: 0.3, pragmatic: 0.6, loyal: 0.7 } },
  { id: 'PR-03', name: '塔斯社记者', nation: 'SU', role: 'JOURNALIST', personality: { hawkish: 0.2, pragmatic: 0.5, loyal: 0.95 } },
  { id: 'PR-04', name: '《真理报》记者', nation: 'SU', role: 'JOURNALIST', personality: { hawkish: 0.2, pragmatic: 0.5, loyal: 0.95 } },
  { id: 'PR-05', name: '法新社记者', nation: 'UK', role: 'JOURNALIST', personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.6 } },
  { id: 'PR-06', name: '中央社记者', nation: 'US', role: 'JOURNALIST', personality: { hawkish: 0.3, pragmatic: 0.7, loyal: 0.6 } },
]
