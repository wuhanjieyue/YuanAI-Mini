// Values live in skycolor.wxss; JS selects palette slots rather than duplicating the palette.
const THEME_VARIABLES = [
  "--ink-8",
  "--ink-12",
  "--ink-6",
  "--ink-10",
  "--ink-5",
  "--ink-22",

  "--bg-gray",
  "--bg-l0",
  "--bg-l1",
  "--bg-l2",
  "--bg-l3",
  "--bg-content",
  "--bg-user-content",
  "--text",
  "--text-l0",
  "--text-l1",
  "--text-l2",
  "--text-l3",
  "--text-strong",
  "--text-muted",
  "--text-hint",
  "--text-placeholder",
  "--main-l0",
  "--main-l1",
  "--main-l2",
  "--main-l3",
  "--main-l4",
  "--main-l5",
  "--err-l0",
  "--err-l1",
  "--err-l2",
  "--err-l3",
  "--warn-l0",
  "--warn-l1",
  "--warn-l2",
  "--warn-l3",
  "--suc-l0",
  "--suc-l1",
  "--suc-l2",
  "--suc-l3",
  "--accent-action-bg",
  "--accent-action-text",
  "--accent-loading",
  "--accent-soft-bg",
  "--accent-soft-text",
  "--accent-chat-bg",
  "--accent-chat-text",
  "--accent-shadow",
  "--accent-link",
  "--accent-danger-text",
  "--border-glass",
  "--border-subtle",
  "--surface-subtle",
  "--control-strong",
  "--glass-80",
  "--glass-92",
  "--glass-15",
  "--glass-86",
  "--glass-82",
  "--glass-96",
  "--glass-88",
  "--glass-68",
  "--glass-76",
  "--glass-95",
  "--glass-42",
  "--glass-56",
  "--glass-90",
  "--glass-65",
  "--glass-20",
  "--glass-94",
  "--glass-100",
  "--glass-10",
  "--glass-72",
  "--glass-52"
]
function normalizeTheme(value) { return value === 'dark' ? 'dark' : 'light' }
function resolveTheme(appearance, systemTheme) {
  if (appearance === '深色') return 'dark'
  if (appearance === '浅色') return 'light'
  return normalizeTheme(systemTheme)
}
function getThemeStyle(theme) {
  const mode = normalizeTheme(theme)
  return 'color:var(--text-l0);' + THEME_VARIABLES.map(key => `${key}:var(--palette-${mode}-${key.slice(2)})`).join(';')
}
function readSystemTheme() {
  try {
    const info = typeof wx.getAppBaseInfo === 'function' ? wx.getAppBaseInfo() : wx.getSystemInfoSync()
    return normalizeTheme(info.theme)
  } catch (_) { return 'light' }
}
module.exports = { THEME_VARIABLES, normalizeTheme, resolveTheme, getThemeStyle, readSystemTheme }
