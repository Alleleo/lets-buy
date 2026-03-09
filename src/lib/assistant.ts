import { buildShoppingInsights, type Purchase } from '@/lib/shoppingSuggestions'

export type AssistantIntent =
  | 'cheapest_store'
  | 'store_list'
  | 'latest_price'
  | 'average_price'
  | 'frequency'
  | 'shopping_suggestion'
  | 'spend_summary'
  | 'unknown'

export type AssistantRequest = {
  message: string
  purchases: Purchase[]
}

export type AssistantResponse = {
  intent: AssistantIntent
  itemName: string | null
  answer: string
  matchedCount: number
  suggestions?: string[]
}

type PurchaseWithNumbers = Purchase & {
  parsedPrice: number
  parsedQuantity: number
  parsedStore: string
  parsedItemName: string
  parsedNormalizedName: string
  parsedPurchasedAt: Date | null
}

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function normalize(value: string | null | undefined) {
  return (value || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function titleCase(value: string | null | undefined) {
  const text = (value || '').trim()
  if (!text) return 'Unknown item'

  return text
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatMoney(value: number) {
  return `MVR ${value.toFixed(2)}`
}

function average(values: number[]) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function sortNewestFirst<T extends { parsedPurchasedAt: Date | null }>(rows: T[]) {
  return [...rows].sort((a, b) => {
    const aTime = a.parsedPurchasedAt ? a.parsedPurchasedAt.getTime() : 0
    const bTime = b.parsedPurchasedAt ? b.parsedPurchasedAt.getTime() : 0
    return bTime - aTime
  })
}

function buildParsedPurchases(purchases: Purchase[]): PurchaseWithNumbers[] {
  return purchases.map((purchase) => ({
    ...purchase,
    parsedPrice: toNumber(purchase.price),
    parsedQuantity: Math.max(toNumber(purchase.quantity), 1),
    parsedStore: (purchase.store || 'Unknown store').trim() || 'Unknown store',
    parsedItemName: (purchase.item_name || purchase.normalized_name || 'Unknown item').trim(),
    parsedNormalizedName: normalize(purchase.normalized_name || purchase.item_name),
    parsedPurchasedAt: purchase.purchased_at ? new Date(purchase.purchased_at) : null,
  }))
}

function detectIntent(message: string): AssistantIntent {
  const text = normalize(message)

  if (
    text.includes('cheapest') ||
    text.includes('best price') ||
    text.includes('lowest price') ||
    text.includes('cheaper') ||
    text.includes('best store')
  ) {
    return 'cheapest_store'
  }

  if (
    text.includes('where can i buy') ||
    text.includes('where did we buy') ||
    text.includes('which stores') ||
    text.includes('what stores') ||
    text.includes('where do we buy') ||
    text.includes('where to buy')
  ) {
    return 'store_list'
  }

  if (
    text.includes('latest price') ||
    text.includes('last price') ||
    text.includes('current price') ||
    text.includes('what is the price') ||
    text.includes('what was the price') ||
    text.includes('price of') ||
    text.includes('price for') ||
    text.includes('how much is') ||
    text.includes('how much was') ||
    text.includes('cost of') ||
    text.includes('cost for')
  ) {
    return 'latest_price'
  }

  if (
    text.includes('average price') ||
    text.includes('usually pay') ||
    text.includes('normally pay') ||
    text.includes('average cost')
  ) {
    return 'average_price'
  }

  if (
    text.includes('how often') ||
    text.includes('weekly') ||
    text.includes('monthly') ||
    text.includes('daily') ||
    text.includes('frequency') ||
    text.includes('when do we usually buy')
  ) {
    return 'frequency'
  }

  if (
    text.includes('what should i buy') ||
    text.includes('what should we buy') ||
    text.includes('need this week') ||
    text.includes('buy this week') ||
    text.includes('shopping list soon') ||
    text.includes('what do i need soon')
  ) {
    return 'shopping_suggestion'
  }

  if (
    text.includes('how much did we spend') ||
    text.includes('what did we spend') ||
    text.includes('spent on') ||
    text.includes('spending on')
  ) {
    return 'spend_summary'
  }

  return 'unknown'
}

function getKnownItems(purchases: PurchaseWithNumbers[]) {
  const map = new Map<string, string>()

  for (const purchase of purchases) {
    const key = purchase.parsedNormalizedName
    if (!key) continue
    if (!map.has(key)) {
      map.set(key, purchase.parsedItemName || key)
    }
  }

  return Array.from(map.entries()).map(([normalized, label]) => ({
    normalized,
    label: titleCase(label),
  }))
}

function extractItemName(message: string, purchases: PurchaseWithNumbers[]): string | null {
  const text = normalize(message)
  const knownItems = getKnownItems(purchases)
  const sorted = [...knownItems].sort((a, b) => b.normalized.length - a.normalized.length)

  for (const item of sorted) {
    if (!item.normalized) continue
    if (text.includes(item.normalized)) {
      return item.normalized
    }
  }

  const fillers = new Set([
    'where',
    'can',
    'i',
    'buy',
    'is',
    'the',
    'cheapest',
    'what',
    'price',
    'of',
    'for',
    'how',
    'much',
    'did',
    'we',
    'spend',
    'on',
    'usually',
    'do',
    'to',
    'best',
    'store',
    'latest',
    'last',
    'current',
    'average',
    'need',
    'this',
    'week',
    'soon',
    'monthly',
    'weekly',
    'daily',
    'item',
    'items',
    'tell',
    'me',
    'show',
    'from',
    'which',
    'our',
    'cost',
    'was',
    'are',
    'at',
  ])

  const remaining = text
    .split(' ')
    .filter((word) => word && !fillers.has(word))
    .join(' ')
    .trim()

  return remaining || null
}

function matchPurchasesForItem(itemName: string | null, purchases: PurchaseWithNumbers[]) {
  if (!itemName) return []

  const normalizedItem = normalize(itemName)
  if (!normalizedItem) return []

  return purchases.filter((purchase) => {
    return (
      purchase.parsedNormalizedName === normalizedItem ||
      purchase.parsedNormalizedName.includes(normalizedItem) ||
      normalizedItem.includes(purchase.parsedNormalizedName)
    )
  })
}

function summarizeStores(rows: PurchaseWithNumbers[]) {
  const storeMap = new Map<
    string,
    {
      count: number
      totalPrice: number
      totalUnitPrice: number
    }
  >()

  for (const row of rows) {
    const unitPrice = row.parsedPrice / Math.max(row.parsedQuantity, 1)
    const existing = storeMap.get(row.parsedStore) || {
      count: 0,
      totalPrice: 0,
      totalUnitPrice: 0,
    }

    existing.count += 1
    existing.totalPrice += row.parsedPrice
    existing.totalUnitPrice += unitPrice

    storeMap.set(row.parsedStore, existing)
  }

  return Array.from(storeMap.entries())
    .map(([store, value]) => ({
      store,
      count: value.count,
      avgPrice: value.totalPrice / value.count,
      avgUnitPrice: value.totalUnitPrice / value.count,
    }))
    .sort((a, b) => a.avgUnitPrice - b.avgUnitPrice)
}

function buildSuggestions(knownItems: { normalized: string; label: string }[], limit = 5) {
  return knownItems.slice(0, limit).map((item) => item.label)
}

function answerCheapestStore(itemName: string, rows: PurchaseWithNumbers[]): AssistantResponse {
  const stores = summarizeStores(rows)
  const best = stores[0]
  const label = titleCase(itemName)

  if (!best) {
    return {
      intent: 'cheapest_store',
      itemName,
      answer: `I found ${label} in your records, but there is not enough store data yet to tell which place is cheapest.`,
      matchedCount: rows.length,
    }
  }

  const otherStores = stores
    .slice(1, 4)
    .map((store) => store.store)
    .filter(Boolean)

  const extra =
    otherStores.length > 0
      ? ` You also bought ${label} from ${otherStores.join(', ')}.`
      : ''

  return {
    intent: 'cheapest_store',
    itemName,
    answer: `The cheapest place to buy ${label} based on your purchase history is ${best.store}. Average price there is about ${formatMoney(best.avgUnitPrice)} per unit.${extra}`,
    matchedCount: rows.length,
  }
}

function answerStoreList(itemName: string, rows: PurchaseWithNumbers[]): AssistantResponse {
  const uniqueStores = Array.from(new Set(rows.map((row) => row.parsedStore)))
  const label = titleCase(itemName)

  if (!uniqueStores.length) {
    return {
      intent: 'store_list',
      itemName,
      answer: `I could not find any store history for ${label} yet.`,
      matchedCount: rows.length,
    }
  }

  const cheapest = summarizeStores(rows)[0]
  const cheapestLine = cheapest
    ? ` The cheapest based on your records looks like ${cheapest.store}.`
    : ''

  return {
    intent: 'store_list',
    itemName,
    answer: `You previously bought ${label} from these stores: ${uniqueStores.join(', ')}.${cheapestLine}`,
    matchedCount: rows.length,
  }
}

function answerLatestPrice(itemName: string, rows: PurchaseWithNumbers[]): AssistantResponse {
  const sorted = sortNewestFirst(rows)
  const latest = sorted[0]
  const label = titleCase(itemName)

  if (!latest) {
    return {
      intent: 'latest_price',
      itemName,
      answer: `I could not find a recorded price for ${label} yet.`,
      matchedCount: 0,
    }
  }

  const avgPrice = average(rows.map((row) => row.parsedPrice))
  const storeSummary = summarizeStores(rows)
  const cheapest = storeSummary[0]

  const latestDate = latest.parsedPurchasedAt
    ? new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(latest.parsedPurchasedAt)
    : null

  const latestLine = latestDate
    ? `The latest recorded price for ${label} is ${formatMoney(latest.parsedPrice)} from ${latest.parsedStore} on ${latestDate}.`
    : `The latest recorded price for ${label} is ${formatMoney(latest.parsedPrice)} from ${latest.parsedStore}.`

  const avgLine = ` Your average recorded price is ${formatMoney(avgPrice)}.`

  const cheapestLine = cheapest
    ? ` The cheapest place based on your records is ${cheapest.store}, at about ${formatMoney(cheapest.avgUnitPrice)} per unit.`
    : ''

  return {
    intent: 'latest_price',
    itemName,
    answer: `${latestLine}${avgLine}${cheapestLine}`,
    matchedCount: rows.length,
  }
}

function answerAveragePrice(itemName: string, rows: PurchaseWithNumbers[]): AssistantResponse {
  const label = titleCase(itemName)
  const avgPrice = average(rows.map((row) => row.parsedPrice))
  const stores = summarizeStores(rows)
  const cheapest = stores[0]

  const cheapestLine = cheapest
    ? ` The lowest average unit price is at ${cheapest.store}, around ${formatMoney(cheapest.avgUnitPrice)} per unit.`
    : ''

  return {
    intent: 'average_price',
    itemName,
    answer: `You usually pay about ${formatMoney(avgPrice)} for ${label}.${cheapestLine}`,
    matchedCount: rows.length,
  }
}

function answerFrequency(itemName: string, purchases: Purchase[]): AssistantResponse {
  const insights = buildShoppingInsights(purchases)
  const normalizedItem = normalize(itemName)
  const item = insights.items.find((entry) => normalize(entry.key) === normalizedItem)
  const label = titleCase(itemName)

  if (!item) {
    return {
      intent: 'frequency',
      itemName,
      answer: `I could not find enough history to estimate how often you buy ${label}.`,
      matchedCount: 0,
    }
  }

  const nextLine = item.nextExpectedPurchaseAt
    ? ` Next expected purchase is around ${new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(item.nextExpectedPurchaseAt))}.`
    : ''

  return {
    intent: 'frequency',
    itemName,
    answer: `You usually buy ${label} ${item.frequency.toLowerCase()}. It was bought ${item.monthlyCount} time(s) in the last 30 days.${nextLine}`,
    matchedCount: item.totalPurchases,
  }
}

function answerShoppingSuggestion(purchases: Purchase[]): AssistantResponse {
  const insights = buildShoppingInsights(purchases)
  const suggestedItems = insights.nextShoppingList.slice(0, 6).map((item) => titleCase(item.label))

  if (!suggestedItems.length) {
    return {
      intent: 'shopping_suggestion',
      itemName: null,
      answer: 'I do not have enough repeat purchase history yet to suggest what to buy this week.',
      matchedCount: 0,
    }
  }

  return {
    intent: 'shopping_suggestion',
    itemName: null,
    answer: `Based on your purchase history, these items may be needed soon: ${suggestedItems.join(', ')}.`,
    matchedCount: suggestedItems.length,
    suggestions: suggestedItems,
  }
}

function answerSpendSummary(itemName: string, rows: PurchaseWithNumbers[]): AssistantResponse {
  const label = titleCase(itemName)
  const totalSpent = rows.reduce((sum, row) => sum + row.parsedPrice, 0)

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const thisMonthSpent = rows
    .filter((row) => row.parsedPurchasedAt && row.parsedPurchasedAt >= monthStart)
    .reduce((sum, row) => sum + row.parsedPrice, 0)

  return {
    intent: 'spend_summary',
    itemName,
    answer: `You have spent ${formatMoney(totalSpent)} in total on ${label}. This month, you spent ${formatMoney(thisMonthSpent)} on it.`,
    matchedCount: rows.length,
  }
}

function answerUnknown(purchases: PurchaseWithNumbers[]): AssistantResponse {
  const suggestions = buildSuggestions(getKnownItems(purchases))

  return {
    intent: 'unknown',
    itemName: null,
    answer:
      'I can help with cheapest store, latest price, average price, where to buy an item, shopping frequency, and what you may need this week.',
    matchedCount: 0,
    suggestions,
  }
}

export function buildAssistantReply({
  message,
  purchases,
}: AssistantRequest): AssistantResponse {
  const parsedPurchases = buildParsedPurchases(purchases)
  const intent = detectIntent(message)

  // ────────────────────────────────────────────────
  // Handle intent that doesn't need an item name first
  // ────────────────────────────────────────────────
  if (intent === 'shopping_suggestion') {
    return answerShoppingSuggestion(purchases)
  }

  // ────────────────────────────────────────────────
  // For all other intents we expect an item
  // ────────────────────────────────────────────────
  const itemName = extractItemName(message, parsedPurchases)
  const matchedRows = matchPurchasesForItem(itemName, parsedPurchases)

  if (intent !== 'unknown' && (!itemName || matchedRows.length === 0)) {
    const suggestions = buildSuggestions(getKnownItems(parsedPurchases))

    return {
      intent,
      itemName,
      answer: itemName
        ? `I could not find "${titleCase(itemName)}" in your purchase history yet.`
        : 'Please tell me which item you want to check.',
      matchedCount: 0,
      suggestions,
    }
  }

  // At this point:
  // - intent is NOT shopping_suggestion (early return above)
  // - if intent !== unknown → itemName is guaranteed to be string and matchedRows.length > 0
  switch (intent) {
    case 'cheapest_store':
      return answerCheapestStore(itemName!, matchedRows)

    case 'store_list':
      return answerStoreList(itemName!, matchedRows)

    case 'latest_price':
      return answerLatestPrice(itemName!, matchedRows)

    case 'average_price':
      return answerAveragePrice(itemName!, matchedRows)

    case 'frequency':
      return answerFrequency(itemName!, purchases)

    case 'spend_summary':
      return answerSpendSummary(itemName!, matchedRows)

    case 'unknown':
    default:
      return answerUnknown(parsedPurchases)
  }
}