export type Purchase = {
  id: string
  item_name: string | null
  normalized_name: string | null
  quantity: number | string | null
  price: number | string | null
  store: string | null
  purchased_at: string | null
}

export type StoreComparison = {
  name: string
  avgUnitPrice: number
  avgBasketPrice: number
  purchaseCount: number
}

export type InsightItem = {
  key: string
  label: string
  totalPurchases: number
  totalSpent: number
  totalQuantity: number
  avgGap: number | null
  frequency: string
  frequencyBucket: 'daily' | 'weekly' | 'monthly' | 'occasional' | 'unknown'
  monthlyCount: number
  lastPurchasedAt: string | null
  nextExpectedPurchaseAt: string | null
  dueSoon: boolean
  overdue: boolean
  cheapestStore: StoreComparison | null
  storeComparisons: StoreComparison[]
}

export type ShoppingInsightsResult = {
  items: InsightItem[]
  smartWeekly: InsightItem[]
  bulkCandidates: InsightItem[]
  cheapestStoreItems: InsightItem[]
  dailyItems: InsightItem[]
  weeklyItems: InsightItem[]
  monthlyItems: InsightItem[]
  buySoon: InsightItem[]
  overdueItems: InsightItem[]
  frequentItems: InsightItem[]
  nextShoppingList: InsightItem[]
}

function toNumber(value: number | string | null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }

  return 0
}

function normalize(value: string | null) {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function daysBetween(a: Date, b: Date) {
  const ms = b.getTime() - a.getTime()
  return ms / (1000 * 60 * 60 * 24)
}

function average(nums: number[]) {
  if (!nums.length) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function frequencyLabel(days: number | null) {
  if (days == null) return 'Not enough data'
  if (days <= 3) return 'Every few days'
  if (days <= 9) return 'Weekly'
  if (days <= 16) return 'Every 2 weeks'
  if (days <= 35) return 'Monthly'
  return `Every ${Math.round(days)} days`
}

function frequencyBucket(days: number | null): InsightItem['frequencyBucket'] {
  if (days == null) return 'unknown'
  if (days <= 3) return 'daily'
  if (days <= 9) return 'weekly'
  if (days <= 35) return 'monthly'
  return 'occasional'
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function sortByUrgencyAndFrequency(a: InsightItem, b: InsightItem) {
  const aPriority = a.overdue ? 3 : a.dueSoon ? 2 : 1
  const bPriority = b.overdue ? 3 : b.dueSoon ? 2 : 1

  if (aPriority !== bPriority) return bPriority - aPriority

  const aGap = a.avgGap ?? Number.POSITIVE_INFINITY
  const bGap = b.avgGap ?? Number.POSITIVE_INFINITY

  if (aGap !== bGap) return aGap - bGap

  return b.totalPurchases - a.totalPurchases
}

export function buildShoppingInsights(purchases: Purchase[]): ShoppingInsightsResult {
  const now = new Date()
  const last30DaysCutoff = addDays(now, -30)

  const groups: Record<string, Purchase[]> = {}

  purchases.forEach((purchase) => {
    const key =
      normalize(purchase.normalized_name) ||
      normalize(purchase.item_name) ||
      'unknown'

    if (!groups[key]) groups[key] = []
    groups[key].push(purchase)
  })

  const items: InsightItem[] = Object.entries(groups).map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => {
      const aTime = a.purchased_at ? new Date(a.purchased_at).getTime() : 0
      const bTime = b.purchased_at ? new Date(b.purchased_at).getTime() : 0
      return aTime - bTime
    })

    const dates = sorted
      .map((row) => (row.purchased_at ? new Date(row.purchased_at) : null))
      .filter((value): value is Date => Boolean(value))

    const gaps: number[] = []

    for (let i = 1; i < dates.length; i += 1) {
      const gap = daysBetween(dates[i - 1], dates[i])
      if (gap > 0) gaps.push(gap)
    }

    const avgGap = gaps.length ? average(gaps) : null
    const bucket = frequencyBucket(avgGap)

    const totalSpent = sorted.reduce((sum, row) => sum + toNumber(row.price), 0)
    const totalQuantity = sorted.reduce((sum, row) => sum + toNumber(row.quantity), 0)

    const monthlyCount = sorted.filter((row) => {
      if (!row.purchased_at) return false
      return new Date(row.purchased_at) >= last30DaysCutoff
    }).length

    const storeMap: Record<
      string,
      {
        unitTotal: number
        priceTotal: number
        count: number
      }
    > = {}

    sorted.forEach((row) => {
      const store = (row.store || 'Unknown store').trim() || 'Unknown store'
      const price = toNumber(row.price)
      const qty = Math.max(toNumber(row.quantity), 1)
      const unitPrice = price / qty

      if (!storeMap[store]) {
        storeMap[store] = {
          unitTotal: 0,
          priceTotal: 0,
          count: 0,
        }
      }

      storeMap[store].unitTotal += unitPrice
      storeMap[store].priceTotal += price
      storeMap[store].count += 1
    })

    const storeComparisons: StoreComparison[] = Object.entries(storeMap)
      .map(([name, value]) => ({
        name,
        avgUnitPrice: value.unitTotal / value.count,
        avgBasketPrice: value.priceTotal / value.count,
        purchaseCount: value.count,
      }))
      .sort((a, b) => a.avgUnitPrice - b.avgUnitPrice)

    const cheapestStore = storeComparisons[0] || null

    const lastPurchasedAt = sorted[sorted.length - 1]?.purchased_at || null

    const nextExpectedPurchaseAt =
      lastPurchasedAt && avgGap != null
        ? addDays(new Date(lastPurchasedAt), Math.round(avgGap)).toISOString()
        : null

    const nextExpectedDate = nextExpectedPurchaseAt ? new Date(nextExpectedPurchaseAt) : null
    const dueSoon = nextExpectedDate ? nextExpectedDate <= addDays(now, 7) : false
    const overdue = nextExpectedDate ? nextExpectedDate < now : false

    const label =
      sorted[sorted.length - 1]?.item_name ||
      sorted[sorted.length - 1]?.normalized_name ||
      key

    return {
      key,
      label,
      totalPurchases: sorted.length,
      totalSpent,
      totalQuantity,
      avgGap,
      frequency: frequencyLabel(avgGap),
      frequencyBucket: bucket,
      monthlyCount,
      lastPurchasedAt,
      nextExpectedPurchaseAt,
      dueSoon,
      overdue,
      cheapestStore,
      storeComparisons,
    }
  })

  const sortedItems = [...items].sort(sortByUrgencyAndFrequency)

  const dailyItems = sortedItems
    .filter((item) => item.frequencyBucket === 'daily')
    .slice(0, 10)

  const weeklyItems = sortedItems
    .filter((item) => item.frequencyBucket === 'weekly')
    .slice(0, 10)

  const monthlyItems = sortedItems
    .filter((item) => item.frequencyBucket === 'monthly')
    .slice(0, 10)

  const overdueItems = sortedItems
    .filter((item) => item.overdue)
    .slice(0, 10)

  const buySoon = sortedItems
    .filter((item) => item.dueSoon)
    .slice(0, 10)

  const frequentItems = [...items]
    .filter((item) => item.avgGap != null && item.avgGap <= 7)
    .sort((a, b) => {
      const aGap = a.avgGap ?? Number.POSITIVE_INFINITY
      const bGap = b.avgGap ?? Number.POSITIVE_INFINITY
      if (aGap !== bGap) return aGap - bGap
      return b.totalPurchases - a.totalPurchases
    })
    .slice(0, 10)

  const smartWeekly = [...items]
    .filter((item) => item.avgGap != null && item.avgGap <= 7)
    .sort(sortByUrgencyAndFrequency)
    .slice(0, 10)

  const bulkCandidates = [...items]
    .filter((item) => item.monthlyCount >= 5)
    .sort((a, b) => {
      if (b.monthlyCount !== a.monthlyCount) return b.monthlyCount - a.monthlyCount
      return b.totalPurchases - a.totalPurchases
    })
    .slice(0, 10)

  const cheapestStoreItems = [...items]
    .filter((item) => item.storeComparisons.length >= 2)
    .sort((a, b) => {
      const aPrice = a.cheapestStore?.avgUnitPrice ?? Number.POSITIVE_INFINITY
      const bPrice = b.cheapestStore?.avgUnitPrice ?? Number.POSITIVE_INFINITY
      return aPrice - bPrice
    })
    .slice(0, 10)

  const nextShoppingList = sortedItems
    .filter((item) => item.overdue || item.dueSoon)
    .slice(0, 12)

  return {
    items,
    smartWeekly,
    bulkCandidates,
    cheapestStoreItems,
    dailyItems,
    weeklyItems,
    monthlyItems,
    buySoon,
    overdueItems,
    frequentItems,
    nextShoppingList,
  }
}