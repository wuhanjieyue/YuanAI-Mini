const assert = require('node:assert/strict')
const {
  DEFAULT_POINT_COLOR,
  POINT_COLOR_OPTIONS,
  getAccentTheme,
  getAccentStyle
} = require('../static_utils/accentColor')

function luminance(hex) {
  const channels = [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255)
  return channels
    .map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
}

function contrast(first, second) {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

assert.equal(POINT_COLOR_OPTIONS.length, 8)
assert.equal(getAccentTheme('unknown').value, DEFAULT_POINT_COLOR)

POINT_COLOR_OPTIONS.forEach(({ value }) => {
  const style = getAccentStyle(value)
  assert.match(style, /--accent-action-bg:/)
  assert.match(style, /--accent-soft-bg:/)
  assert.match(style, /--accent-soft-text:/)
})

POINT_COLOR_OPTIONS.slice(1).forEach((theme) => {
  assert.ok(contrast(theme.softColor, theme.softText) >= 4.5, `${theme.value} soft contrast`)
  assert.ok(contrast(theme.chatColor, theme.chatText) >= 4.5, `${theme.value} chat contrast`)
})

const defaultStyle = getAccentStyle(DEFAULT_POINT_COLOR)
assert.match(defaultStyle, /--accent-loading:#000000/)
assert.match(defaultStyle, /--accent-chat-bg:#FFFFFF/)
assert.match(defaultStyle, /--accent-chat-text:#111111/)
assert.match(defaultStyle, /--accent-soft-text:#0A59F7/)
assert.deepEqual(POINT_COLOR_OPTIONS.map(({ value }) => value), ['默认', '蓝色', '绿色', '黄色', '粉色', '橙色', '紫色', '黑色'])

console.log('accentColor: ok')
