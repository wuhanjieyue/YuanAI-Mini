const PLAN_ORDER = ['guest', 'user', 'pro']
const MODE_IDS = ['chat', 'temporary', 'work']

const EMPTY_MODEL_CATALOG = {
  accessPlan: 'guest',
  defaults: { chat: '', temporary: '', work: '' },
  models: []
}

function planRank(plan) {
  return PLAN_ORDER.indexOf(plan)
}

function canAccessPlan(accessPlan, minPlan) {
  const accessRank = planRank(accessPlan)
  const requiredRank = planRank(minPlan)
  return accessRank >= 0 && requiredRank >= 0 && accessRank >= requiredRank
}

function normalizeModelCatalog(value = {}) {
  const accessPlan = PLAN_ORDER.includes(value.accessPlan) ? value.accessPlan : 'guest'
  const defaults = MODE_IDS.reduce((result, modeId) => {
    result[modeId] = typeof value.defaults?.[modeId] === 'string' ? value.defaults[modeId] : ''
    return result
  }, {})
  const models = Array.isArray(value.models) ? value.models.reduce((result, model) => {
    if (!model || typeof model.id !== 'string' || typeof model.name !== 'string') return result
    const modes = Array.isArray(model.modes) ? model.modes.filter((modeId) => MODE_IDS.includes(modeId)) : []
    const efforts = Array.isArray(model.efforts) ? model.efforts.reduce((items, effort) => {
      if (!effort || typeof effort.id !== 'string' || typeof effort.label !== 'string') return items
      items.push({
        id: effort.id,
        label: effort.label,
        minPlan: PLAN_ORDER.includes(effort.minPlan) ? effort.minPlan : 'pro'
      })
      return items
    }, []) : []
    if (!modes.length || !efforts.length) return result
    result.push({
      id: model.id,
      name: model.name,
      modes,
      minPlan: PLAN_ORDER.includes(model.minPlan) ? model.minPlan : 'pro',
      defaultEffortId: typeof model.defaultEffortId === 'string' ? model.defaultEffortId : efforts[0].id,
      efforts
    })
    return result
  }, []) : []
  return { accessPlan, defaults, models }
}

function getModel(catalog, modelId) {
  return (catalog.models || []).find((model) => model.id === modelId)
}

function getDefaultModel(catalog, modeId) {
  const defaultModel = getModel(catalog, catalog.defaults?.[modeId])
  if (defaultModel && defaultModel.modes.includes(modeId)) return defaultModel
  return (catalog.models || []).find((model) => model.modes.includes(modeId)) || null
}

function firstAccessibleEffort(model, accessPlan) {
  return model?.efforts.find((effort) => canAccessPlan(accessPlan, effort.minPlan)) || null
}

function normalizeEffort(model, effortId, accessPlan) {
  const selected = model?.efforts.find((effort) => effort.id === effortId)
  if (selected && (canAccessPlan(accessPlan, selected.minPlan) || (accessPlan === 'guest' && model.id === 'yuan-go'))) return selected
  const fallback = model?.efforts.find((effort) => effort.id === model.defaultEffortId)
  if (fallback && canAccessPlan(accessPlan, fallback.minPlan)) return fallback
  return firstAccessibleEffort(model, accessPlan)
}

function normalizeModeSelection(catalogValue, modeId, selection = {}) {
  const catalog = normalizeModelCatalog(catalogValue)
  const accessPlan = catalog.accessPlan
  let model = getModel(catalog, selection.modelId)
  if (!model || !model.modes.includes(modeId) || !canAccessPlan(accessPlan, model.minPlan)) {
    const fallback = getDefaultModel(catalog, modeId)
    model = fallback && canAccessPlan(accessPlan, fallback.minPlan)
      ? fallback
      : catalog.models.find((item) => item.modes.includes(modeId) && canAccessPlan(accessPlan, item.minPlan))
  }
  if (!model) return { modelId: '', effortId: '' }
  const effort = normalizeEffort(model, selection.effortId, accessPlan)
  return { modelId: model.id, effortId: effort?.id || '' }
}

function getSelectionView(catalogValue, selection = {}) {
  const catalog = normalizeModelCatalog(catalogValue)
  const model = getModel(catalog, selection.modelId)
  const effort = model?.efforts.find((item) => item.id === selection.effortId)
  return {
    model,
    effort,
    modelName: model?.name || '',
    effortLabel: effort?.label || '',
    efforts: model?.efforts || [],
    progress: model && model.efforts.length > 1 && effort
      ? model.efforts.findIndex((item) => item.id === effort.id) / (model.efforts.length - 1)
      : 0
  }
}

function getReasoningChoices(models = [], modelId = 'yuan-go', accessPlan) {
  const model = models.find((item) => item.id === modelId)
  const options = (model?.efforts || []).map((effort) => ({
    ...effort,
    id:`${model.id}:${effort.id}`,
    modelId:model.id,
    modelName:model.name,
    effortId:effort.id,
    locked:model.locked === true || (effort.locked === true && !(accessPlan === 'guest' && model.id === 'yuan-go'))
  }))
  return { options }
}

function getReasoningIndex(options, modelId, effortId) {
  const index = options.findIndex((option) => option.modelId === modelId && option.effortId === effortId)
  if (index >= 0) return index
  return Math.max(0, options.findIndex((option) => option.modelId === modelId && option.effortId === 'high'))
}

module.exports = {
  PLAN_ORDER,
  MODE_IDS,
  EMPTY_MODEL_CATALOG,
  canAccessPlan,
  normalizeModelCatalog,
  normalizeModeSelection,
  getSelectionView,
  getReasoningChoices,
  getReasoningIndex
}
