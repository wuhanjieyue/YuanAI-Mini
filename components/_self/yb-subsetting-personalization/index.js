import { rpx2px } from '../../../static_utils/otherUtils'
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { messages, t } = require('../../../static_utils/i18n/index')

const BASIC_TONE_OPTIONS = [
  { label: '默认', value: '默认', desc: '预设风格和语调' },
  { label: '专业可靠', value: '专业可靠', desc: '精雕细琢' },
  { label: '亲和友善', value: '亲和友善', desc: '温和健谈' },
  { label: '直言不讳', value: '直言不讳', desc: '直率乐观' },
  { label: '天马行空', value: '天马行空', desc: '趣味幻想' },
  { label: '高效务实', value: '高效务实', desc: '简练直白' },
  { label: '吐槽达人', value: '吐槽达人', desc: '犀利毒舌型' }
]

const TRAIT_OPTIONS = {
  gentle: [
    { label: '增强', value: '增强', desc: '更友好、更亲近' },
    { label: '默认', value: '默认' },
    { label: '减弱', value: '减弱', desc: '更专业，事实性更强' }
  ],
  warm: [
    { label: '增强', value: '增强', desc: '更热情、更主动' },
    { label: '默认', value: '默认' },
    { label: '减弱', value: '减弱', desc: '更冷静、更克制' }
  ],
  headings: [
    { label: '增强', value: '增强', desc: '更多使用标题和列表' },
    { label: '默认', value: '默认' },
    { label: '减弱', value: '减弱', desc: '更少使用标题和列表' }
  ],
  emoji: [
    { label: '增强', value: '增强', desc: '更多使用表情符号' },
    { label: '默认', value: '默认' },
    { label: '减弱', value: '减弱', desc: '更少使用表情符号' }
  ]
}

Component({
  behaviors: [i18nBehavior],
  properties: {
    themeStyle: { type: String, value: '' },
    aiName: {
      type: String,
      value: 'ChatGPT'
    },
    draft: {
      type: Object,
      value: {}
    },
    traits: {
      type: Array,
      value: []
    },
    mode: {
      type: String,
      value: 'personalization'
    }
  },

  observers: {
    'draft,language,aiName': function (draft, language, aiName) {
      this.syncCopy(language, aiName)
    }
  },

  data: {
    basicToneOptions: BASIC_TONE_OPTIONS,
    traitOptions: TRAIT_OPTIONS,
    basicTonePopupHeightPx: 0,
    traitPopupHeightPx: 0
  },

  lifetimes: {
    attached() {
      const screenWidth = wx.getWindowInfo().windowWidth
      const listPaddingPx = rpx2px(24, screenWidth)
      this.setData({
        basicTonePopupHeightPx: rpx2px(124, screenWidth) * BASIC_TONE_OPTIONS.length + listPaddingPx,
        traitPopupHeightPx: rpx2px(124, screenWidth) * TRAIT_OPTIONS.gentle.length + listPaddingPx
      })
      this.syncCopy(this.properties.language, this.properties.aiName)
    }
  },

  methods: {
    syncCopy(language, aiName) {
      const i18n = messages(language)
      const styleKeys = ['default', 'professional', 'friendly', 'candid', 'quirky', 'efficient', 'cynical']
      const levelKeys = ['more', 'default', 'less']
      const basicToneOptions = BASIC_TONE_OPTIONS.map((option, index) => ({
        ...option,
        label: i18n.personalization.styles[styleKeys[index]],
        desc: i18n.personalization.styles[`${styleKeys[index]}Desc`]
      }))
      const traitOptions = Object.fromEntries(Object.entries(TRAIT_OPTIONS).map(([key, options]) => [key, options.map((option, index) => ({
        ...option,
        label: i18n.personalization.levels[levelKeys[index]],
        desc: index === 1 ? '' : i18n.personalization.levels[`${key}${index === 0 ? 'More' : 'Less'}`]
      }))]))
      const draft = this.properties.draft || {}
      const draftTraits = draft.traits || {}
      this.setData({
        i18n,
        personalizationCopy: {
          baseStyleDesc: t(language, 'personalization.baseStyleDesc', { app: aiName }),
          customInstructionsPlaceholder: t(language, 'personalization.customInstructionsPlaceholder', { app: aiName }),
          memoryDesc: t(language, 'personalization.memoryDesc', { app: aiName }),
          longTermMemoryDesc: t(language, 'personalization.longTermMemoryDesc', { app: aiName }),
          chatHistoryDesc: t(language, 'personalization.chatHistoryDesc', { app: aiName })
        },
        basicToneOptions,
        traitOptions,
        selectedBasicToneLabel: basicToneOptions.find((option) => option.value === draft.basicTone)?.label || draft.basicTone || '',
        selectedTraitLabels: Object.fromEntries(Object.entries(traitOptions).map(([key, options]) => [
          key,
          options.find((option) => option.value === draftTraits[key])?.label || draftTraits[key] || ''
        ]))
      })
    },
    handleOptionChange(e) {
      const { field, value } = e.currentTarget.dataset
      if (!field || !value) return
      this.triggerEvent('optionchange', { field, value })
      this.selectComponent(field === 'basicTone' ? '#basicTonePop' : `#traitPop-${field}`)?.close()
    },

    handleInput(e) {
      const { field } = e.currentTarget.dataset
      if (!field) return
      this.triggerEvent('input', {
        field,
        value: e.detail.value
      })
    },

    handleSwitch(e) {
      const { field } = e.currentTarget.dataset
      if (!field) return
      this.triggerEvent('switch', {
        field,
        value: !!e.detail.value
      })
    },

    handleLongTermMemoryTap() {
      this.triggerEvent('longtermmemory')
    }
  }
})
