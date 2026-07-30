import type { Venue } from '../domain/types'

// 6 个联动会场，规则见 intro.md 第 7~26 行
export const VENUES: Venue[] = [
  { id: 'V1', name: '领导人会议', allowWiretap: false, sovietHomeAdvantage: false },
  { id: 'V2', name: '美国代表团会议', allowWiretap: true, sovietHomeAdvantage: false },
  { id: 'V3', name: '英国代表团会议', allowWiretap: true, sovietHomeAdvantage: false },
  { id: 'V4', name: '苏联代表团会议', allowWiretap: true, sovietHomeAdvantage: true },
  { id: 'V5', name: '秘密谈判室', allowWiretap: true, sovietHomeAdvantage: true },
  { id: 'V6', name: '新闻媒体中心', allowWiretap: false, sovietHomeAdvantage: false },
]
