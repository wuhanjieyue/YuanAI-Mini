const { reaction } = require('mobx-miniprogram')
const { store } = require('../store/index')
const { getAccentStyle, getAccentTheme } = require('./accentColor')
const { getThemeStyle } = require('./theme')
// Mini Program require cannot load JSON; the two native backgrounds are checked against theme.json.
const nativeThemes = { light: { navigationText: 'black', pageBackground: '#F8F7F5' }, dark: { navigationText: 'white', pageBackground: '#171717' } }

function syncThemeNavigation(page) {
  const pages = getCurrentPages()
  if (pages[pages.length - 1] !== page) return
  const theme = nativeThemes[store.effectiveTheme]
  wx.setNavigationBarColor({
    frontColor: theme.navigationText === 'white' ? '#ffffff' : '#000000',
    backgroundColor: theme.pageBackground
  })
}
function bindPageTheme(page) {
  unbindPageTheme(page)
  page._disposeTheme = reaction(() => [store.effectiveTheme, store.applicationSettings.pointColor], ([effectiveTheme, pointColor]) => {
    const background = nativeThemes[effectiveTheme].pageBackground
    page.setData({ effectiveTheme, themeStyle: getThemeStyle(effectiveTheme), themeBackground: background, accentStyle: getAccentStyle(pointColor, effectiveTheme), accentLoadingColor: getAccentTheme(pointColor, effectiveTheme).loadingColor })
    syncThemeNavigation(page)
  }, { fireImmediately: true })
}
function unbindPageTheme(page) {
  if (page._disposeTheme) page._disposeTheme()
  page._disposeTheme = null
}
module.exports = { bindPageTheme, unbindPageTheme, syncThemeNavigation }
