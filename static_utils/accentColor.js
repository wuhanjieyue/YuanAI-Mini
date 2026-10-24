const DEFAULT_POINT_COLOR = '默认'

const POINT_COLOR_OPTIONS = [
  {
    label: '默认', value: '默认', color: '#EEEDEC',
    dotStyle: 'background-color: #EEEDEC;border: 1rpx solid rgba(0, 0, 0, 0.12);',
    actionColor: 'rgba(0, 0, 0, 0.9)', actionText: '#FFFFFF', loadingColor: '#000000',
    softColor: '#BBDAFD99', softText: '#0A59F7', chatColor: '#FFFFFF', chatText: '#111111',
    shadowColor: 'rgba(0, 0, 0, 0.1)'
  },
  {
    label: '蓝色', value: '蓝色', color: '#3A83F7', dotStyle: 'background-color: #3A83F7;',
    actionColor: '#3A83F7', actionText: '#FFFFFF', loadingColor: '#3A83F7',
    softColor: '#E8F3FE', softText: '#0C274A', chatColor: '#173E76', chatText: '#F6FAFE',
    shadowColor: 'rgba(58, 131, 247, 0.28)'
  },
  {
    label: '绿色', value: '绿色', color: '#53B559', dotStyle: 'background-color: #53B559;',
    actionColor: '#53B559', actionText: '#FFFFFF', loadingColor: '#53B559',
    softColor: '#DEF3E5', softText: '#14361A', chatColor: '#2C6732', chatText: '#EFFAF3',
    shadowColor: 'rgba(83, 181, 89, 0.28)'
  },
  {
    label: '黄色', value: '黄色', color: '#F6C543', dotStyle: 'background-color: #F6C543;',
    actionColor: '#F6C543', actionText: '#FFFFFF', loadingColor: '#F6C543',
    softColor: '#FDF6DC', softText: '#51300C', chatColor: '#95611F', chatText: '#FEFBEE',
    shadowColor: 'rgba(246, 197, 67, 0.28)'
  },
  {
    label: '粉色', value: '粉色', color: '#F077AF', dotStyle: 'background-color: #F077AF;',
    actionColor: '#F077AF', actionText: '#FFFFFF', loadingColor: '#F077AF',
    softColor: '#FDEDF4', softText: '#462132', chatColor: '#873E60', chatText: '#FEF8FB',
    shadowColor: 'rgba(240, 119, 175, 0.28)'
  },
  {
    label: '橙色', value: '橙色', color: '#EE7C37', dotStyle: 'background-color: #EE7C37;',
    actionColor: '#EE7C37', actionText: '#FFFFFF', loadingColor: '#EE7C37',
    softColor: '#FBE8DB', softText: '#45240D', chatColor: '#87401D', chatText: '#FDF5F1',
    shadowColor: 'rgba(238, 124, 55, 0.28)'
  },
  {
    label: '紫色', value: '紫色', color: '#8952EE', dotStyle: 'background-color: #8952EE;',
    actionColor: '#8952EE', actionText: '#FFFFFF', loadingColor: '#8952EE',
    softColor: '#EDE5FC', softText: '#291947', chatColor: '#4E2F88', chatText: '#F8F5FD',
    shadowColor: 'rgba(137, 82, 238, 0.28)'
  },
  {
    label: '黑色', value: '黑色', color: '#000000', dotStyle: 'background-color: #000000;',
    actionColor: '#000000', actionText: '#FFFFFF', loadingColor: '#000000',
    softColor: '#000000', softText: '#FFFFFF', chatColor: '#ECECEC', chatText: '#000000',
    shadowColor: 'rgba(0, 0, 0, 0.28)'
  }
]

const POINT_COLOR_META_MAP = POINT_COLOR_OPTIONS.reduce((result, item) => {
  result[item.value] = item
  return result
}, {})

function getAccentTheme(value, mode = 'light') {
  const theme = POINT_COLOR_META_MAP[value] || POINT_COLOR_META_MAP[DEFAULT_POINT_COLOR]
  if (mode !== 'dark') return theme
  if (theme.value === DEFAULT_POINT_COLOR || theme.value === '黑色') {
    return Object.assign({}, theme, {
      actionColor: '#E6E6E6', actionText: '#171717', loadingColor: '#E6E6E6',
      softColor: theme.value === '黑色' ? '#303030' : '#233E63',
      softText: theme.value === '黑色' ? '#F5F5F5' : '#BBD8FF',
      chatColor: '#303030', chatText: '#F5F5F5', shadowColor: 'rgba(0, 0, 0, 0.28)'
    })
  }
  return Object.assign({}, theme, {
    softColor: theme.chatColor, softText: theme.chatText,
    shadowColor: 'rgba(0, 0, 0, 0.28)'
  })
}

function getAccentStyle(value, mode = 'light') {
  const theme = getAccentTheme(value, mode)
  return [
    `--accent-action-bg:${theme.actionColor}`,
    `--accent-action-text:${theme.actionText}`,
    `--accent-loading:${theme.loadingColor}`,
    `--accent-soft-bg:${theme.softColor}`,
    `--accent-soft-text:${theme.softText}`,
    `--accent-chat-bg:${theme.chatColor}`,
    `--accent-chat-text:${theme.chatText || theme.actionText}`,
    `--accent-shadow:${theme.shadowColor}`
  ].join(';')
}

module.exports = {
  DEFAULT_POINT_COLOR,
  POINT_COLOR_OPTIONS,
  POINT_COLOR_META_MAP,
  getAccentTheme,
  getAccentStyle
}
