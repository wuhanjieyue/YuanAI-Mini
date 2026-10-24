const { t, toLocale } = require('./i18n/index')

function billingView(summary, language) {
  const base = { usageLimitsPercent: '0.0', usageLimitsEnabled: false, usageLimitsError: '',
    usageLimitsPackagePoints: 0, usageLimitsPurchasedPoints: 0, usageLimitsPending: 0,
    usageLimitsReserved: '0', usageLimitsLifetime: false, usageLimitsReset: t(language, 'usageLimits.notEnabled') }
  if (!summary?.package) return base
  const budget = Number(summary.package.budgetCny)
  const spent = Number(summary.package.spentCny)
  const date = new Date(summary.cycleEndAt)
  const lifetime = summary.allowancePeriod === 'lifetime'
  return { ...base, usageLimitsEnabled: summary.enabled === true,
    usageLimitsPercent: (budget > 0 ? Math.max(0, Math.min(100, spent / budget * 100)) : 0).toFixed(1),
    usageLimitsPackagePoints: summary.package.points, usageLimitsPurchasedPoints: summary.purchased.points,
    usageLimitsPending: summary.pendingCount,
    usageLimitsReserved: Number(summary.totalReservedCny ?? (Number(summary.package.reservedCny) + Number(summary.purchased.reservedCny))).toFixed(4),
    usageLimitsLifetime: lifetime,
    usageLimitsReset: lifetime ? t(language, 'usageLimits.freeLifetime') :
      summary.rolloutState !== 'legacy_pending' && summary.cycleEndAt != null && Number.isFinite(date.getTime()) ? t(language, 'usageLimits.nextGrant', {
      date: date.toLocaleString(toLocale(language)) }) : base.usageLimitsReset }
}

module.exports = { billingView }
