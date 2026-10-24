export const DEFAULT_VOICE_ID = 'male-qn-jingying'

export const VOICE_OPTIONS = [
  { label: '知行', value: 'male-qn-jingying', desc: '理性可靠' },
  { label: '阿澈', value: 'male-qn-daxuesheng', desc: '清爽真诚' },
  { label: '知夏', value: 'female-yujie', desc: '从容知性' },
  { label: '甜柚', value: 'female-tianmei', desc: '亲切爱笑' },
  { label: '景川', value: 'junlang_nanyou', desc: '温柔会聊' },
  { label: '晚棠', value: 'wumei_yujie', desc: '成熟撩人' },
  { label: '承安', value: 'Chinese (Mandarin)_Reliable_Executive', desc: '稳重干练' },
  { label: '闻笙', value: 'Chinese (Mandarin)_News_Anchor', desc: '清晰专业' },
  { label: '言川', value: 'Chinese (Mandarin)_Gentleman', desc: '温和克制' },
  { label: '小暖', value: 'Chinese (Mandarin)_Warm_Bestie', desc: '贴心治愈' },
  { label: '予白', value: 'Chinese (Mandarin)_Gentle_Youth', desc: '安静耐心' },
  { label: '小棠', value: 'Chinese (Mandarin)_Warm_Girl', desc: '元气温暖' },
  { label: '墨声', value: 'Chinese (Mandarin)_Radio_Host', desc: '磁性陪伴' },
  { label: '若岚', value: 'Chinese (Mandarin)_Gentle_Senior', desc: '温柔细腻' },
  { label: '阿晴', value: 'Cantonese_GentleLady', desc: '柔和亲近' }
]

export const VOICE_META_MAP = VOICE_OPTIONS.reduce((map, item) => {
  map[item.value] = item
  return map
}, {})
