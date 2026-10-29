const { showErrorNotice } = require('../../../static_utils/errorNotice')
import { rpx2px } from '../../../static_utils/otherUtils'
const { prepareSearchClose } = require('../../../static_utils/searchAnimation')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { listInstalledSkills, listRecommendedSkills, enableSkill, removeSkill, trySkill } = require('../../../request/skills')
const mcpRequests = require('../../../request/mcps')
const { reaction } = require('mobx-miniprogram')
const { store } = require('../../../store/index')
const { getSkillTitle } = require('../../../static_utils/chatFeature')
const { shared, timing, Easing } = wx.worklet
const KEYBOARD_GAP = 12
const MCP_CATEGORIES = [['开发者工具', 'mcpDeveloper', 'icon-command-terminal'],
  ['搜索工具', 'mcpSearch', 'icon-search'], ['数据查询', 'mcpData', 'icon-web-search'],
  ['内容生成', 'mcpContent', 'icon-image-create'], ['企业服务', 'mcpBusiness', 'icon-mouse'],
  ['生活服务', 'mcpLife', 'icon-shopping']]
const SKILL_CATEGORIES = [['通用工具', 'skillGeneral', 'icon-gear'], ['开发运维', 'skillDevelopment', 'icon-command-terminal'],
  ['金融服务', 'skillFinance', 'icon-trending-up'], ['企业经营', 'skillBusiness', 'icon-mouse'],
  ['内容创作', 'skillContent', 'icon-edit-pen'], ['生活服务', 'skillLife', 'icon-shopping'],
  ['科研教育', 'skillEducation', 'icon-study'], ['办公效率', 'skillOffice', 'icon-document'],
  ['法律合规', 'skillLegal', 'icon-user_security_line'], ['健康医疗', 'skillHealth', 'icon-advice'],
  ['数据分析', 'skillData', 'icon-data']]

function accountKey() {
  return `${!!store.user?.login}:${store.user?.userId || ''}:${store.assetCacheEpoch}`
}

Component({
  behaviors: [i18nBehavior],
  properties: { themeStyle: { type:String, value:'' } },
  data: {
    category: 'skills', categoryName: '', categoryOptions: [], categoryCopy: {}, menuOpen: false,
    mcpCategory: '', mcpCategoryIcon: 'icon-menus', mcpCategoryOptions: [],
    skillCategory: '', skillCategoryIcon: 'icon-menus', skillCategoryOptions: [], filterMenuOpen: false,
    query: '', inputFocus: false, searchRowVisible: true, navHeight: 120, viewportHeight: '100%',
    installedItems: [], recommendedItems: [], installedLoading: true, loading: true, loadingMore: false,
    installedFailed: false, recommendedFailed: false, nextCursor: '', hasMore: false, pendingIds: {}
  },
  observers: {
    language() {
      this.updateCategoryLabels()
      this.setData({ installedItems:this.presentSkills(this.data.installedItems),
        recommendedItems:this.presentSkills(this.data.recommendedItems) })
    }
  },
  lifetimes: {
    attached() {
      this.updateCategoryLabels()
      this._disposeAccount = reaction(accountKey, () => this.loadSkills(), { fireImmediately: true })
      const system = wx.getWindowInfo()
      this._keyboardHeightTmp = wx.getStorageSync('keyHeight') || system.screenHeight * 0.5
      this._keyboardOffset = shared(0)
      this._pluginsViewportHeight = shared(system.windowHeight)
      this._searchActionProgress = shared(0)
      this._filterProgress = shared(1)
      this._searchCloseKeyboardHeight = shared(0)
      this._searchCloseProgress = shared(0)
      this._searchActionActive = false
      this.setData({ viewportHeight: `${system.windowHeight}px` })
      wx.nextTick(() => {
        const clearSize = rpx2px(96, system.screenWidth)
        const clearSlot = rpx2px(112, system.screenWidth)
        this.applyAnimatedStyle('.plugins-search-row', () => {
          'worklet'
          return { transform: `translateY(${-this._keyboardOffset.value}px)` }
        })
        this.applyAnimatedStyle('.plugins-scroll', () => {
          'worklet'
          return { height: `${Math.max(0, this._pluginsViewportHeight.value - this._keyboardOffset.value)}px` }
        })
        this.applyAnimatedStyle('.plugins-search', () => {
          'worklet'
          return { right: `${clearSlot * this._searchActionProgress.value}px` }
        })
        this.applyAnimatedStyle('.plugins-search-area', () => {
          'worklet'
          return { right: `${clearSlot * this._filterProgress.value}px` }
        })
        this.applyAnimatedStyle('.plugins-filter', () => {
          'worklet'
          const progress = this._filterProgress.value
          return { opacity: `${progress}`, transform: `scale(${progress * (0.86 + progress * 0.14)})` }
        })
        this.applyAnimatedStyle('.plugins-clear', () => {
          'worklet'
          const progress = this._searchActionProgress.value
          return {
            width: `${clearSize * progress}px`, height: `${clearSize * progress}px`,
            opacity: `${progress}`, transform: `translateY(-50%) scale(${0.86 + progress * 0.14})`
          }
        })
      })
    },
    detached() { clearTimeout(this._filterAnimationTimer); this._filterOpening = false; this._unloaded = true; this.selectComponent('#mcpFilter')?.close(); this.triggerEvent('actionschange', { open: false }); this._disposeAccount?.(); this._listVersion++; this._installedVersion++ }
  },
  pageLifetimes: { hide() { this.closeMcpFilter() } },
  methods: {
    updateCategoryLabels() {
      const copy = this.data.i18n.plugins
      const categoryOptions = ['skills', 'tools', 'plugins'].map(id => ({ id, name:copy[id],
        icon: id === 'skills' ? 'icon-file' : id === 'tools' ? 'icon-skill-tool' : 'icon-plugin' }))
      const category = this.data.category || 'skills'
      this.setData({ categoryOptions, mcpCategoryOptions:MCP_CATEGORIES.map(([id, key, icon]) => ({ id, name:copy[key], icon })),
        skillCategoryOptions:SKILL_CATEGORIES.map(([id, key, icon]) => ({ id, name:copy[key], icon })), categoryName:copy[category], categoryCopy: {
        search:copy[`${category}Search`], empty:copy[`${category}Empty`]
      } })
    },
    requests() {
      return this.data.category === 'tools' ? {
        listInstalledSkills:mcpRequests.listInstalledMcps, listRecommendedSkills:mcpRequests.listRecommendedMcps,
        enableSkill:mcpRequests.enableMcp, removeSkill:mcpRequests.removeMcp, trySkill:mcpRequests.tryMcp
      } : { listInstalledSkills, listRecommendedSkills, enableSkill, removeSkill, trySkill }
    },
    async showCategories(e) {
      this.setData({ inputFocus:false, menuOpen:true })
      wx.hideKeyboard()
      this.triggerEvent('actionschange', { open:true })
      const opened = await this.selectComponent('#categoryPopup')?.show('mode', e.detail?.rect)
      if (!opened && !this._unloaded) { this.closeCategories(); this.afterCategoriesClose() }
    },
    closeCategories() {
      this.selectComponent('#titleNav')?.closeFeatures()
    },
    afterCategoriesClose() {
      this.setData({ menuOpen:false })
      this.triggerEvent('actionschange', { open:false })
    },
    async openMcpFilter() {
      if (this._unloaded || this.data.category === 'plugins' || this.data.filterMenuOpen || this.data.menuOpen) return
      this._filterOpening = true
      const keyboardVisible = this._keyboardOffset.value > 0
      this.setData({ filterMenuOpen:true, inputFocus:false })
      this.triggerEvent('actionschange', { open:true })
      wx.hideKeyboard()
      this.animateKeyboardOffset(0)
      if (keyboardVisible) await new Promise(resolve => setTimeout(resolve, 160))
      if (this._unloaded || !this._filterOpening) return
      let opened = false
      try { opened = await this.selectComponent('#mcpFilter')?.open() }
      catch (_) { return }
      finally { if (!opened && this._filterOpening) this.mcpFilterClosed() }
    },
    closeMcpFilter() {
      this._filterOpening = false
      if (!this.selectComponent('#mcpFilter')?.close() && this.data.filterMenuOpen) this.mcpFilterClosed()
    },
    mcpFilterClosed() {
      this._filterOpening = false
      if (this._unloaded) return
      this.setData({ filterMenuOpen:false })
      if (!this.data.menuOpen) this.triggerEvent('actionschange', { open:false })
    },
    selectMcpCategory(e) {
      const category = e.currentTarget.dataset.id
      const isTool = this.data.category === 'tools'
      const selected = (isTool ? MCP_CATEGORIES : SKILL_CATEGORIES).find(([id]) => id === category)
      if (!selected) return
      const active = category !== (isTool ? this.data.mcpCategory : this.data.skillCategory)
      const prefix = isTool ? 'mcp' : 'skill'
      this.setData({ [`${prefix}Category`]:active ? category : '', [`${prefix}CategoryIcon`]:active ? selected[2] : 'icon-menus' }, () => this.loadRecommendedSkills())
      this.closeMcpFilter()
    },
    selectCategory(e) {
      const category = e.detail?.id
      if (!['skills', 'tools', 'plugins'].includes(category)) return
      this.selectComponent('#categoryPopup')?.close()
      if (category === this.data.category) return
      const animateOut = this.data.category !== 'plugins' && category === 'plugins'
      this.closeMcpFilter()
      clearTimeout(this._filterAnimationTimer)
      this.animateKeyboardOffset(0)
      this.animateSearchAction(false)
      this.setData({ category, mcpCategory:'', mcpCategoryIcon:'icon-menus', skillCategory:'', skillCategoryIcon:'icon-menus', query:'', inputFocus:false, searchRowVisible:category !== 'plugins' || animateOut }, () => {
        this.updateCategoryLabels()
        this.loadSkills()
        wx.nextTick(() => {
          if (this._unloaded || this.data.category !== category) return
          this._filterProgress.value = timing(category !== 'plugins' ? 1 : 0, { duration:220, easing:Easing.ease })
          if (animateOut) this._filterAnimationTimer = setTimeout(() => {
            if (!this._unloaded && this.data.category === 'plugins') this.setData({ searchRowVisible:false })
          }, 220)
        })
      })
    },
    presentSkills(items = []) {
      return items.map(item => {
        const displayTitle = getSkillTitle(item, this.properties.language)
        const english = this.properties.language === 'English' || this.properties.language === 'en-US'
        return { ...item, ...this._skillStates?.[item.id], displayTitle,
          quotaLabel:item.kind === 'mcp' && typeof item.quotaPerCall === 'string'
            ? `${item.quotaPerCall} ${english ? 'credits/call' : '额度/次'}` : '',
          iconInitial:Array.from(displayTitle.trim())[0] || '',
          displayDescription:this.properties.language === 'English' || this.properties.language === 'en-US' ? item.descriptionEn || item.description : item.description }
      })
    },
    loadSkills() {
      if (this._unloaded) return
      this._actionVersion = (this._actionVersion || 0) + 1
      this._skillStates = {}
      this._listVersion = (this._listVersion || 0) + 1
      this._installedVersion = (this._installedVersion || 0) + 1
      this.setData({ installedItems: [], recommendedItems: [], pendingIds: {}, nextCursor:'', hasMore:false,
        installedFailed:false, recommendedFailed:false, loadingMore:false })
      if (this.data.category === 'plugins') {
        this.setData({ installedLoading:false, loading:false })
        return
      }
      return Promise.allSettled([this.loadInstalledSkills(), this.loadRecommendedSkills()])
    },
    async loadInstalledSkills({ silent = false } = {}) {
      if (this._unloaded) return
      const version = this._installedVersion = (this._installedVersion || 0) + 1
      const account = accountKey()
      this.setData({ installedLoading: !silent, installedFailed: false })
      try {
        const page = await this.requests().listInstalledSkills()
        if (this._unloaded || version !== this._installedVersion || account !== accountKey()) return
        this.setData({ installedLoading: false, installedItems: this.presentSkills(page.items).filter(item => item.installed) })
      } catch (error) {
        if (!this._unloaded && version === this._installedVersion && account === accountKey()) this.setData({ installedLoading: false, installedFailed: true })
      }
    },
    async loadRecommendedSkills() {
      if (this._unloaded) return
      const version = this._listVersion = (this._listVersion || 0) + 1
      const account = accountKey()
      const query = this.data.query
      this.setData({ loading: true, loadingMore: false, recommendedFailed: false,
        recommendedItems: [], nextCursor: '', hasMore: false })
      try {
        const page = await this.requests().listRecommendedSkills({ query, cursor: '', limit: 25,
          ...(this.data.category === 'tools' ? { category:this.data.mcpCategory } : this.data.skillCategory ? { category:this.data.skillCategory } : {}) })
        if (this._unloaded || version !== this._listVersion || account !== accountKey()) return
        this.setData({ loading: false, recommendedItems: this.presentSkills(page.items),
          nextCursor: page.nextCursor, hasMore: page.hasMore })
      } catch (error) {
        if (!this._unloaded && version === this._listVersion && account === accountKey()) this.setData({ loading: false, recommendedFailed: true })
      }
    },
    async loadMoreSkills() {
      if (this._unloaded || this.data.category === 'plugins' || this.data.loading || this.data.loadingMore || !this.data.hasMore) return
      const version = this._listVersion
      const account = accountKey()
      this.setData({ loadingMore: true, recommendedFailed: false })
      try {
        const page = await this.requests().listRecommendedSkills({ query: this.data.query,
          cursor: this.data.nextCursor, limit: 25,
          ...(this.data.category === 'tools' ? { category:this.data.mcpCategory } : this.data.skillCategory ? { category:this.data.skillCategory } : {}) })
        if (this._unloaded || version !== this._listVersion || account !== accountKey()) return
        this.setData({ recommendedItems: this.data.recommendedItems.concat(this.presentSkills(page.items)),
          nextCursor: page.nextCursor, hasMore: page.hasMore, loadingMore: false })
      } catch (error) {
        if (!this._unloaded && version === this._listVersion && account === accountKey()) this.setData({ loadingMore: false, recommendedFailed: true })
      }
    },
    retrySkills() {
      if (this.data.recommendedItems.length && this.data.hasMore) this.loadMoreSkills()
      else this.loadRecommendedSkills()
    },
    openSkill(e) {
      const id = e.currentTarget.dataset.id
      if (this._unloaded || ![...this.data.installedItems, ...this.data.recommendedItems].some(item => item.id === id)) return
      this.animateKeyboardOffset(0)
      this.setData({ inputFocus: false })
      wx.hideKeyboard()
      this.triggerEvent('openSkill', { id, ...(this.data.category === 'tools' ? { kind:'mcp' } : {}) })
    },
    ignoreAction() {
    },
    updateSkill(item) {
      if (this._unloaded) return
      this._skillStates[item.id] = { installed:item.installed, enabled:item.enabled }
      const installed = this.data.installedItems.filter(row => row.id !== item.id)
      if (item.installed) installed.push(item)
      this.setData({ installedItems:this.presentSkills(installed),
        recommendedItems:this.presentSkills(this.data.recommendedItems) })
    },
    async handleSkillAction(e) {
      const { id, action } = e.currentTarget.dataset
      const skill = [...this.data.installedItems, ...this.data.recommendedItems].find(item => item.id === id)
      if (this._unloaded || !skill || this.data.pendingIds[id]) return
      this.selectComponent?.(`#skill-menu-${id}`)?.close()
      if (action === 'preview') return this.openSkill(e)
      if (!['enable', 'remove', 'chat'].includes(action) || action !== 'enable' && !skill.installed) return
      if (action === 'remove' && skill.globalDefault) return
      const account = accountKey(), version = this._actionVersion
      const valid = () => !this._unloaded && version === this._actionVersion && account === accountKey()
      this.setData({ pendingIds: { ...this.data.pendingIds, [id]: true } })
      try {
        const item = await ({ enable:this.requests().enableSkill, remove:this.requests().removeSkill, chat:this.requests().trySkill })[action]({ id })
        if (!valid()) return
        this.updateSkill(item)
        if (action === 'chat') this.triggerEvent('trySkill', { item, ...(this.data.category === 'tools' ? { kind:'mcp' } : {}) })
        else this.loadInstalledSkills({ silent:true })
      } catch (error) {
        if (valid()) showErrorNotice({ title:error.message || this.data.i18n.common.operationFailed })
      } finally {
        if (valid()) {
          const pendingIds = { ...this.data.pendingIds }
          delete pendingIds[id]
          this.setData({ pendingIds })
        }
      }
    },
    handleNavHeightChange(e) {
      const height = e.detail.height
      if (Number.isFinite(height) && height > 0 && height !== this.data.navHeight) this.setData({ navHeight: height })
    },
    handleSearch(e) {
      const query = e.detail?.value || ''
      this.animateSearchAction(query.length > 0)
      this.setData({ query }, () => this.loadRecommendedSkills())
    },
    animateSearchAction(active) {
      if (!active && this._searchCloseKeyboardHeight.value > 0) return
      if (active) this._searchCloseKeyboardHeight.value = 0
      if (!this._searchActionProgress || this._searchActionActive === active) return
      this._searchActionActive = active
      this._searchActionProgress.value = timing(active ? 1 : 0, { duration: 220, easing: Easing.ease })
    },
    animateKeyboardOffset(value) {
      if (this._searchCloseKeyboardHeight.value > 0 || this._keyboardOffset?.value === Math.max(0, value)) return
      if (!this._keyboardOffset) return
      this._keyboardOffset.value = timing(Math.max(0, value), { duration: 160, easing: Easing.ease })
    },
    handleSearchFocus() {
      this._searchCloseKeyboardHeight.value = 0
      this.animateKeyboardOffset(this._keyboardHeightTmp + KEYBOARD_GAP)
    },
    handleSearchBlur() {
      this.setData({ inputFocus: false })
      this.animateKeyboardOffset(0)
    },
    handleSearchKeyboardUpdate(e) {
      'worklet'
      const startHeight = this._searchCloseKeyboardHeight.value
      if (startHeight <= 0) return
      const height = Math.max(0, e.detail.height)
      const progress = Math.min(1, height / startHeight)
      this._keyboardOffset.value = height + 12 * progress
      if (height === 0) this._searchCloseKeyboardHeight.value = 0
    },
    handleSearchKeyboardHeightChange(e) {
      const height = Math.max(0, Number(e.detail?.height) || 0)
      if (height > 0) {
        this._keyboardHeightTmp = height
        wx.setStorage({ key: 'keyHeight', data: height })
        this.animateKeyboardOffset(height + KEYBOARD_GAP)
      } else this.animateKeyboardOffset(0)
    },
    clearSearch() {
      prepareSearchClose(this, true)
      this.setData({ query: '', inputFocus: false }, () => this.loadRecommendedSkills())
      wx.hideKeyboard()
    },
    openLeft() {
      this.triggerEvent('openLeft')
    }
  }
})
