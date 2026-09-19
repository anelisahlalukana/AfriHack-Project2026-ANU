export const money = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 2 }).format(Number(value) || 0)
export function totals(items = []) {
  const sum = category => items.filter(item => item.category === category).reduce((total, item) => total + (Number(item.amount) || 0), 0)
  const assets = sum('asset'), liabilities = sum('liability')
  return { assets, liabilities, netWorth: assets - liabilities }
}
export function goalProgress(goal) {
  const target = Number(goal.target_amount), current = Number(goal.current_progress) || 0
  return target > 0 ? Math.min(100, Math.max(0, current / target * 100)) : 0
}
