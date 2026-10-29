const { showErrorNotice } = require('../../../static_utils/errorNotice')
const i18nBehavior = require('../../../static_utils/i18n/behavior')
const { messages, t } = require('../../../static_utils/i18n/index')
import { store } from '../../../store/index'
import { renewAssetUrls } from '../../../request/assetCache'
import { downloadStorageFile, deleteCloudFile, renameCreatedImage, renameStorageFile, setStorageFileFavorite } from '../../../request/request'
const { resolvePreviewFile, previewStorageFile } = require('../../../static_utils/filePreview')
const { isSupportedChatAttachment } = require('../../../static_utils/chatAttachment')
const { getKnowledgeMembership, importKnowledge, renameKnowledge, removeKnowledge } = require('../../../request/knowledge')
import { triggerHaptic } from '../../../static_utils/haptic'

Component({
  behaviors: [i18nBehavior],
  properties: { themeStyle: { type: String, value: '' }, viewMode: { type: String, value: 'grid' } },
  data: { item: null, source: '', actions: [], sharePreparing: false, assetDialogOpen: false, assetDialogAction: '', assetDialogName: '',
    assetDialogMessage: '', assetIsImage: true, originTop: 0, originLeft: 0, knowledgeAdded: null },
  observers: { language() { if (this.data.item) this.syncActions() } },
  lifetimes: {
    attached() { this._actionVersion = 0 },
    detached() {
      this._detached = true
      this._opening = false
      this.triggerEvent('statechange', { open: false })
    }
  },
  pageLifetimes: {
    hide() {
      this._actionVersion += 1
      this.selectComponent('#assetDialog')?.close()
      this.clearAssetResult()
    }
  },
  methods: {
    assetActionCurrent(action) {
      return !this._detached && action.epoch === store.assetCacheEpoch && action.version === this._actionVersion
    },
    async loadKnowledgeMembership(item) {
      const pending = { epoch: this._epoch, version: this._actionVersion }
      try {
        const { added } = await getKnowledgeMembership(item.id)
        if (!this._opening || !this.assetActionCurrent(pending)) return
        this.setData({ knowledgeAdded: added })
        this.syncActions()
      } catch (error) {
        if (this._opening && this.assetActionCurrent(pending)) this.showAssetResult(error.message || messages(this.properties.language).knowledge.statusFailed)
      }
    },
    async resolveActionFile(pending) {
      const { item, source } = pending
      if (source === 'knowledge' || !item.isImage) return resolvePreviewFile(item)
      const [image] = await renewAssetUrls([item], !!item.loadFailed)
      if (!this.assetActionCurrent(pending)) return
      return downloadStorageFile(image.url)
    },
    async prepareShare(item, source) {
      const pending = { action: 'share', item, source, epoch: this._epoch, version: this._actionVersion }
      this._shareFile = pending
      this.setData({ sharePreparing: true })
      try { pending.path = await this.resolveActionFile(pending) }
      catch (error) { pending.failed = true }
      if (this._shareFile === pending && this.assetActionCurrent(pending)) this.setData({ sharePreparing: false })
    },
    shareAsset() {
      const pending = this._shareFile
      if (!pending || !this.assetActionCurrent(pending) || this._operationBusy) return
      if (!pending.path) {
        if (!pending.failed) return
        this.showAssetResult(messages(this.properties.language).assets.downloadFailed)
        this.prepareShare(pending.item, pending.source)
        return
      }
      this._pendingAction = pending
      this._operationBusy = true
      const platform = wx.getDeviceInfo().platform
      const desktop = platform === 'windows' || platform === 'mac'
      const finish = error => {
        this._operationBusy = false
        if (error && this.assetActionCurrent(pending) && !/cancel/i.test(error.errMsg || error.message || '')) {
          const copy = messages(this.properties.language)
          this.showAssetResult(desktop ? copy.assets.downloadFailed : copy.create.shareFailed)
        }
      }
      // Invoke from the tap itself; afterclose and downloads lose WeChat's tap permission.
      try {
        const options = { filePath: pending.path, fileName: this.assetFileName(pending.item), success: () => finish(), fail: finish }
        if (desktop) wx.saveFileToDisk(options)
        else if (pending.item.isImage) wx.showShareImageMenu({ path: pending.path, needShowEntrance: false, success: options.success, fail: finish })
        else wx.shareFileMessage(options)
      } catch (error) { finish(error) }
      this.close()
    },
    async handleAssetAction(e) {
      if (this._operationBusy || this.data.assetDialogOpen) return
      const { action, item, source, epoch } = e.detail
      if (action === 'share') return
      const pending = { action, item, source, epoch, version: this._actionVersion }
      if (!this.assetActionCurrent(pending) || action === 'save' && !item.isImage) return
      if (action === 'chat' && !isSupportedChatAttachment(item)) {
        showErrorNotice({ title: messages(this.properties.language).attachments.unsupportedFormat })
        return
      }
      this._operationBusy = true
      await this.measureOperationOrigin()
      this._operationBusy = false
      if (!this.assetActionCurrent(pending)) return
      if (action === 'original' && source === 'knowledge') {
        this._operationBusy = true
        try { await previewStorageFile(item, { language: this.properties.language }) }
        finally { this._operationBusy = false }
        return
      }
      if (action === 'rename' || action === 'delete') {
        this._assetDialog = pending
        this.setData({ assetDialogOpen: true, assetDialogAction: action, assetDialogName: item.displayName, assetIsImage: !!item.isImage,
          assetDialogMessage: action === 'delete' ? t(this.properties.language, source === 'knowledge' ? 'knowledge.deletePrompt' : 'assets.deletePrompt', { name: item.displayName }) : '' }, () => {
          this.triggerEvent('statechange', { open: true, lifted: false, id: item.id })
          this.selectComponent('#assetDialog').show()
        })
        return
      }
      if (action === 'favorite' && source === 'library') {
        this._operationBusy = true
        const favorite = !item.favorite
        try {
          await setStorageFileFavorite(item.id, favorite)
          if (this.assetActionCurrent(pending)) this.showAssetResult(messages(this.properties.language).assets[favorite ? 'favoriteAdded' : 'favoriteRemoved'])
        } catch (error) {
          if (this.assetActionCurrent(pending)) this.showAssetResult(messages(this.properties.language).assets[favorite ? 'favoriteAddFailed' : 'favoriteRemoveFailed'])
        } finally { this._operationBusy = false }
        return
      }
      if (action === 'knowledge' && source === 'library') {
        if (this.data.knowledgeAdded !== false) return
        this._operationBusy = true
        try {
          await importKnowledge([item.id])
          if (this.assetActionCurrent(pending)) {
            this.setData({ knowledgeAdded: true })
            this.syncActions()
            this.showAssetResult(messages(this.properties.language).knowledge.added)
          }
        } catch (error) {
          if (this.assetActionCurrent(pending)) this.showAssetResult(error.message || messages(this.properties.language).knowledge.addFailed)
        } finally { this._operationBusy = false }
        return
      }
      if (!['save', 'chat'].includes(action)) return
      this._operationBusy = true
      try {
        const path = await this.resolveActionFile(pending)
        if (!this.assetActionCurrent(pending)) return
        if (action === 'save') {
          await wx.saveImageToPhotosAlbum({ filePath: path })
          if (this.assetActionCurrent(pending)) this.showAssetResult(messages(this.properties.language).assets.photoSaved)
        } else {
          this.triggerEvent('chatAsset', { epoch: pending.epoch, files: [{ tempFilePath: path, fileType: item.isImage ? 'image' : 'file',
            name: item.name || item.displayName, extension: item.extension, mimeType: item.mimeType, size: item.size }] })
        }
      } catch (error) {
        if (this.assetActionCurrent(pending) && !/cancel/i.test(error.errMsg || error.message || '')) {
          const copy = messages(this.properties.language)
          const denied = /auth deny|auth denied|authorize|permission/i.test(error.errMsg || '')
          const message = action === 'save' ? (denied ? copy.assets.photoPermission : copy.assets.photoSaveFailed)
            : copy.assets.downloadFailed
          this.showAssetResult(message)
        }
      } finally { this._operationBusy = false }
    },
    closeAssetDialog() {
      this._assetDialog = null
      this.setData({ assetDialogOpen: false })
      this.triggerEvent('statechange', { open: false })
    },
    async confirmAssetAction(e) {
      const pending = this._assetDialog
      if (!pending || this._operationBusy || !this.assetActionCurrent(pending)) { this.closeAssetDialog(); return }
      this._operationBusy = true
      try {
        if (pending.source === 'knowledge') {
          if (pending.action === 'rename') await renameKnowledge(pending.item.id, e.detail.value)
          else await removeKnowledge(pending.item.id)
          if (this.assetActionCurrent(pending)) this.triggerEvent('localchange', { action:pending.action, item:pending.item })
        } else if (pending.action === 'rename') {
          const rename = pending.source === 'creation' ? renameCreatedImage : renameStorageFile
          await rename(pending.item.id, e.detail.value)
        }
        else await deleteCloudFile(pending.item.fileID)
        if (pending.action === 'delete' && this.assetActionCurrent(pending)) this.showAssetResult(messages(this.properties.language).assets.deleted)
      } catch (error) {
        if (this.assetActionCurrent(pending)) this.showAssetResult(messages(this.properties.language).assets[pending.action === 'rename' ? 'renameFailed' : 'deleteFailed'])
      } finally {
        this._operationBusy = false
        if (!this._detached) this.closeAssetDialog()
      }
    },
    showAssetResult(message) { this.selectComponent('#assetNotice')?.show(message) },
    clearAssetResult() { this.selectComponent('#assetNotice')?.hide() },
    assetFileName(item) {
      const name = item.name || item.displayName
      const suffix = item.extension ? `.${item.extension}` : ''
      return suffix && !name.toLowerCase().endsWith(suffix.toLowerCase()) ? name + suffix : name
    },
    measureOperationOrigin() {
      return new Promise(resolve => this.createSelectorQuery().select('.asset-operation-origin').boundingClientRect(rect => {
        this.setData({ originTop: rect?.top || 0, originLeft: rect?.left || 0 })
        resolve()
      }).exec())
    },
    syncActions() {
      const { chat, assets, knowledge } = messages(this.properties.language)
      const actions = [
        { id: 'share', text: chat.share, glyph: '\ue760' },
        ...(this.data.source === 'knowledge' ? [{ id: 'original', text: knowledge.viewOriginal, icon: 'icon-document' }] : []),
        ...(this.data.source === 'library' ? [{ id: 'favorite', text: this.data.item.favorite ? assets.removeFavorite : assets.addFavorite, glyph: '\ue7db' }] : []),
        ...(this.data.source === 'library' ? [{ id: 'knowledge', text: this.data.knowledgeAdded ? knowledge.added : knowledge.add,
          glyph: '\ue7dc', disabled: this.data.knowledgeAdded !== false }] : []),
        ...(this.data.item.isImage ? [{ id: 'save', text: assets.savePhoto, glyph: '\ue7d2' }] : [])
      ]
      if (this.data.source !== 'sample') actions.push(
        { id: 'chat', text: assets.chat, glyph: '\ue764' },
        { id: 'rename', text: assets.rename, glyph: '\ue79d' },
        { id: 'delete', text: this.data.source === 'knowledge' ? knowledge.remove : this.data.source === 'library' ? assets.deleteLibrary : assets.deleteCreation, glyph: '\ue79b', danger: true }
      )
      this.setData({ actions })
    },
    async open(item, rect, source) {
      if (this._opening || this._detached || this._operationBusy || this.data.assetDialogOpen) return false
      this._opening = true
      this._epoch = store.assetCacheEpoch
      this._actionVersion = (this._actionVersion || 0) + 1
      this._pendingAction = null
      await new Promise(resolve => this.setData({ item, source, sharePreparing: false, knowledgeAdded: null }, resolve))
      if (this._detached || !this._opening) return false
      this.syncActions()
      if (source === 'library') this.loadKnowledgeMembership(item)
      if (['creation', 'library', 'knowledge'].includes(source)) this.prepareShare(item, source)
      await new Promise(resolve => wx.nextTick(resolve))
      if (this._detached || !this._opening) return false
      this.triggerEvent('statechange', { open: true, lifted: false, id: item.id })
      try {
        const opened = await this.selectComponent('#flyout').open(rect)
        if (!opened && !this._detached) this.afterClose()
        return opened
      } catch (error) {
        if (!this._detached) this.afterClose()
        return false
      }
    },
    afterOpen() {
      this.triggerEvent('statechange', { open: true, lifted: true, id: this.data.item.id })
      triggerHaptic(store.applicationSettings?.hapticFeedback, 'heavy')
    },
    chooseAction(e) {
      if (!this._opening || this._pendingAction) return
      const action = e.currentTarget.dataset.action
      if (!this.data.actions.some(item => item.id === action && !item.disabled)) return
      if (action === 'share' && ['creation', 'library', 'knowledge'].includes(this.data.source)) {
        this.shareAsset()
        return
      }
      this._pendingAction = { action, item: this.data.item, source: this.data.source, epoch: this._epoch }
      this.close()
    },
    close() {
      const closed = this.selectComponent('#flyout')?.close()
      if (!closed && this._opening) this.afterClose()
      return closed
    },
    afterClose() {
      if (this._detached) return
      this._opening = false
      this.triggerEvent('statechange', { open: false })
      const action = this._pendingAction
      this._pendingAction = null
      this._shareFile = null
      if (action?.action === 'share') return
      if (action && ['creation', 'library', 'knowledge'].includes(action.source)) this.handleAssetAction({ detail: action })
      else if (action) showErrorNotice({ title: messages(this.properties.language).assets.unavailable })
    }
  }
})
