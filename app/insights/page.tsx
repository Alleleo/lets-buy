'use client'

import { useEffect, useMemo, useState } from 'react'
import AppPageShell from '@/components/AppPageShell'
import { supabase } from '@/lib/supabase'
import { buildShoppingInsights, type Purchase, type InsightItem } from '@/lib/shoppingSuggestions'

type HouseholdMemberRow = {
  household_id: string
}

type PurchaseRow = Purchase & {
  household_id?: string
  unit?: string | null
  note?: string | null
  purchased_by?: string | null
  created_at?: string | null
  shopping_item_id?: string | null
}

type SectionCardTone = 'neutral' | 'red' | 'amber' | 'emerald' | 'blue' | 'violet'

function toNumber(value: number | string | null | undefined) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  if (typeof value === 'string') {
    const parsed = parseFloat(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return 0
}

function formatMoney(value: number) {
  return `MVR ${value.toFixed(2)}`
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function endOfLastMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59, 999)
}

function startOfLastMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() - 1, 1)
}

function capitalizeLabel(value: string | null | undefined) {
  const text = (value || '').trim()
  if (!text) return 'Unknown item'
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function getBulkMessage(monthlyCount: number) {
  if (monthlyCount >= 8) return 'Very frequent item. Consider buying a larger bulk pack.'
  if (monthlyCount >= 5) return 'Bought many times this month. Bulk buying may save money.'
  return 'This item is being bought regularly.'
}

function formatDate(value: string | null) {
  if (!value) return '—'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'

  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

function getItemStatusTone(item: InsightItem): SectionCardTone {
  if (item.overdue) return 'red'
  if (item.dueSoon) return 'amber'
  if (item.cheapestStore) return 'emerald'
  return 'neutral'
}

function getFrequencyBadgeClasses(item: InsightItem) {
  if (item.overdue) return 'bg-red-100 text-red-700 ring-1 ring-red-200'
  if (item.dueSoon) return 'bg-amber-100 text-amber-700 ring-1 ring-amber-200'
  return 'bg-zinc-100 text-zinc-700 ring-1 ring-zinc-200'
}

function getFrequencyBadgeLabel(item: InsightItem) {
  if (item.overdue) return 'Overdue'
  if (item.dueSoon) return 'Buy soon'
  return 'Stable'
}

function getToneClasses(tone: SectionCardTone) {
  if (tone === 'red') {
    return {
      shell: 'border-red-200 bg-red-50/60',
      icon: 'bg-red-100 text-red-700',
      accent: 'bg-red-500',
    }
  }

  if (tone === 'amber') {
    return {
      shell: 'border-amber-200 bg-amber-50/60',
      icon: 'bg-amber-100 text-amber-700',
      accent: 'bg-amber-500',
    }
  }

  if (tone === 'emerald') {
    return {
      shell: 'border-emerald-200 bg-emerald-50/60',
      icon: 'bg-emerald-100 text-emerald-700',
      accent: 'bg-emerald-500',
    }
  }

  if (tone === 'blue') {
    return {
      shell: 'border-blue-200 bg-blue-50/60',
      icon: 'bg-blue-100 text-blue-700',
      accent: 'bg-blue-500',
    }
  }

  if (tone === 'violet') {
    return {
      shell: 'border-violet-200 bg-violet-50/60',
      icon: 'bg-violet-100 text-violet-700',
      accent: 'bg-violet-500',
    }
  }

  return {
    shell: 'border-zinc-200 bg-white',
    icon: 'bg-zinc-100 text-zinc-700',
    accent: 'bg-zinc-400',
  }
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string
  value: string
  hint?: string
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-zinc-900">{value}</p>
      {hint ? <p className="mt-1 text-sm text-zinc-500">{hint}</p> : null}
    </div>
  )
}

function EmptyState({
  message,
}: {
  message: string
}) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-500">
      {message}
    </div>
  )
}

function SectionCard({
  title,
  subtitle,
  count,
  tone = 'neutral',
  defaultOpen = true,
  children,
}: {
  title: string
  subtitle?: string
  count?: number
  tone?: SectionCardTone
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  const toneClasses = getToneClasses(tone)

  return (
    <section className={`overflow-hidden rounded-3xl border shadow-sm ${toneClasses.shell}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className={`h-3 w-3 rounded-full ${toneClasses.accent}`} />
            <h2 className="truncate text-base font-semibold text-zinc-900">{title}</h2>
            {typeof count === 'number' ? (
              <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200">
                {count}
              </span>
            ) : null}
          </div>
          {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
        </div>

        <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${toneClasses.icon}`}>
          {open ? 'Hide' : 'Show'}
        </div>
      </button>

      {open ? <div className="px-4 pb-4">{children}</div> : null}
    </section>
  )
}

function ItemSummaryCard({
  item,
  rightBadge,
  extra,
}: {
  item: InsightItem
  rightBadge?: React.ReactNode
  extra?: React.ReactNode
}) {
  const tone = getItemStatusTone(item)
  const toneClasses = getToneClasses(tone)

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses.shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{capitalizeLabel(item.label)}</p>
          <p className="mt-1 text-sm text-zinc-500">{item.frequency}</p>
        </div>

        {rightBadge}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-600">
        <p>Total purchases: {item.totalPurchases}</p>
        <p>Last 30 days: {item.monthlyCount}</p>
        <p>Total spent: {formatMoney(item.totalSpent)}</p>
        <p>Next expected: {formatDate(item.nextExpectedPurchaseAt)}</p>
      </div>

      {extra ? <div className="mt-3">{extra}</div> : null}
    </div>
  )
}

function SmallPatternCard({
  item,
  tone,
}: {
  item: InsightItem
  tone: SectionCardTone
}) {
  const toneClasses = getToneClasses(tone)

  return (
    <div className={`rounded-2xl border p-4 ${toneClasses.shell}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-zinc-900">{capitalizeLabel(item.label)}</p>
          <p className="mt-1 text-sm text-zinc-500">{item.frequency}</p>
        </div>

        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${toneClasses.icon}`}>
          {item.monthlyCount}x / 30d
        </span>
      </div>

      <p className="mt-3 text-sm text-zinc-600">
        Next expected: {formatDate(item.nextExpectedPurchaseAt)}
      </p>
    </div>
  )
}

export default function InsightsPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [purchases, setPurchases] = useState<PurchaseRow[]>([])

  useEffect(() => {
    let isMounted = true

    async function loadInsights() {
      try {
        setLoading(true)
        setError(null)

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser()

        if (authError) throw authError

        if (!user) {
          if (isMounted) {
            setPurchases([])
            setError('You must be logged in to view insights.')
          }
          return
        }

        const { data: memberRows, error: memberError } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)

        if (memberError) throw memberError

        const householdIds = ((memberRows || []) as HouseholdMemberRow[])
          .map((row) => row.household_id)
          .filter(Boolean)

        if (!householdIds.length) {
          if (isMounted) {
            setPurchases([])
          }
          return
        }

        const { data: purchaseRows, error: purchasesError } = await supabase
          .from('purchases')
          .select(
            `
            id,
            household_id,
            shopping_item_id,
            item_name,
            normalized_name,
            quantity,
            unit,
            price,
            store,
            note,
            purchased_by,
            purchased_at,
            created_at
          `
          )
          .in('household_id', householdIds)
          .order('purchased_at', { ascending: false })

        if (purchasesError) throw purchasesError

        if (isMounted) {
          setPurchases(((purchaseRows || []) as PurchaseRow[]).filter(Boolean))
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load insights.'
        if (isMounted) {
          setError(message)
          setPurchases([])
        }
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadInsights()

    return () => {
      isMounted = false
    }
  }, [])

  const insights = useMemo(() => buildShoppingInsights(purchases), [purchases])

  const overview = useMemo(() => {
    const now = new Date()
    const thisMonthStart = startOfMonth(now)
    const lastMonthStart = startOfLastMonth(now)
    const lastMonthEnd = endOfLastMonth(now)

    let thisMonthSpend = 0
    let lastMonthSpend = 0
    let totalSpent = 0

    for (const purchase of purchases) {
      const price = toNumber(purchase.price)
      totalSpent += price

      if (!purchase.purchased_at) continue

      const purchaseDate = new Date(purchase.purchased_at)

      if (purchaseDate >= thisMonthStart) {
        thisMonthSpend += price
      }

      if (purchaseDate >= lastMonthStart && purchaseDate <= lastMonthEnd) {
        lastMonthSpend += price
      }
    }

    return {
      thisMonthSpend,
      lastMonthSpend,
      totalPurchases: purchases.length,
      trackedItems: insights.items.length,
      totalSpent,
    }
  }, [purchases, insights.items.length])

  const topItems = useMemo(() => {
    return [...insights.items]
      .sort((a, b) => b.totalPurchases - a.totalPurchases)
      .slice(0, 8)
  }, [insights.items])

  return (
    <AppPageShell title="Insights">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 pb-24 pt-4">
        {loading ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="h-5 w-32 animate-pulse rounded bg-zinc-200" />
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
                <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
                <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
                <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" />
              </div>
            </div>
            <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
            <div className="h-48 animate-pulse rounded-2xl bg-zinc-100" />
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : purchases.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">No purchase data yet</h2>
            <p className="mt-2 text-sm text-zinc-500">
              Complete a few purchases with store and price details. Then LETS BUY will show
              smart shopping suggestions, item frequency, and best store analysis.
            </p>
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <div className="mb-1">
                <h2 className="text-base font-semibold text-zinc-900">Overview</h2>
                <p className="mt-1 text-sm text-zinc-500">
                  High-level summary from your completed purchases.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatCard label="This month" value={formatMoney(overview.thisMonthSpend)} />
                <StatCard label="Last month" value={formatMoney(overview.lastMonthSpend)} />
                <StatCard label="Purchases" value={String(overview.totalPurchases)} />
                <StatCard label="Tracked items" value={String(overview.trackedItems)} />
                <StatCard label="Total spent" value={formatMoney(overview.totalSpent)} />
              </div>
            </section>

            <SectionCard
              title="Next shopping list"
              subtitle="Items that look overdue or likely needed very soon."
              count={insights.nextShoppingList.length}
              tone="blue"
              defaultOpen
            >
              {insights.nextShoppingList.length === 0 ? (
                <EmptyState message="No urgent shopping suggestions yet." />
              ) : (
                <div className="space-y-3">
                  {insights.nextShoppingList.map((item) => (
                    <ItemSummaryCard
                      key={item.key}
                      item={item}
                      rightBadge={
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getFrequencyBadgeClasses(item)}`}
                        >
                          {getFrequencyBadgeLabel(item)}
                        </span>
                      }
                      extra={
                        item.cheapestStore ? (
                          <div className="rounded-2xl bg-white p-3 text-sm text-zinc-700 ring-1 ring-zinc-100">
                            Best store: <span className="font-semibold">{item.cheapestStore.name}</span>{' '}
                            at about {formatMoney(item.cheapestStore.avgUnitPrice)} per unit.
                          </div>
                        ) : null
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Smart suggestions panel"
              subtitle="Frequent items that usually need restocking within a week."
              count={insights.smartWeekly.length}
              tone="emerald"
              defaultOpen
            >
              {insights.smartWeekly.length === 0 ? (
                <EmptyState message="Not enough repeat purchase data yet to suggest this week’s items." />
              ) : (
                <div className="space-y-3">
                  {insights.smartWeekly.map((item) => (
                    <ItemSummaryCard
                      key={item.key}
                      item={item}
                      rightBadge={
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-medium ${getFrequencyBadgeClasses(item)}`}
                        >
                          {getFrequencyBadgeLabel(item)}
                        </span>
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <SectionCard
                title="Overdue items"
                subtitle="Based on past buying intervals, these may already be due."
                count={insights.overdueItems.length}
                tone="red"
                defaultOpen
              >
                {insights.overdueItems.length === 0 ? (
                  <EmptyState message="No overdue items right now." />
                ) : (
                  <div className="space-y-3">
                    {insights.overdueItems.map((item) => (
                      <ItemSummaryCard
                        key={item.key}
                        item={item}
                        rightBadge={
                          <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
                            Overdue
                          </span>
                        }
                      />
                    ))}
                  </div>
                )}
              </SectionCard>

              <SectionCard
                title="Buy soon"
                subtitle="Items likely needed in the next few days."
                count={insights.buySoon.length}
                tone="amber"
                defaultOpen
              >
                {insights.buySoon.length === 0 ? (
                  <EmptyState message="No near-term restock signals yet." />
                ) : (
                  <div className="space-y-3">
                    {insights.buySoon.map((item) => (
                      <ItemSummaryCard
                        key={item.key}
                        item={item}
                        rightBadge={
                          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                            Buy soon
                          </span>
                        }
                      />
                    ))}
                  </div>
                )}
              </SectionCard>
            </div>

            <SectionCard
              title="Purchase pattern groups"
              subtitle="Grouped by how often items tend to repeat."
              count={
                insights.dailyItems.length +
                insights.weeklyItems.length +
                insights.monthlyItems.length
              }
              tone="violet"
              defaultOpen={false}
            >
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-zinc-900">Daily items</h3>
                    <p className="mt-1 text-xs text-zinc-500">Items bought every few days.</p>
                  </div>

                  {insights.dailyItems.length === 0 ? (
                    <EmptyState message="No daily pattern items yet." />
                  ) : (
                    <div className="space-y-3">
                      {insights.dailyItems.map((item) => (
                        <SmallPatternCard key={item.key} item={item} tone="amber" />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-zinc-900">Weekly items</h3>
                    <p className="mt-1 text-xs text-zinc-500">Items that usually repeat each week.</p>
                  </div>

                  {insights.weeklyItems.length === 0 ? (
                    <EmptyState message="No weekly pattern items yet." />
                  ) : (
                    <div className="space-y-3">
                      {insights.weeklyItems.map((item) => (
                        <SmallPatternCard key={item.key} item={item} tone="blue" />
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-zinc-900">Monthly items</h3>
                    <p className="mt-1 text-xs text-zinc-500">Items that repeat around once a month.</p>
                  </div>

                  {insights.monthlyItems.length === 0 ? (
                    <EmptyState message="No monthly pattern items yet." />
                  ) : (
                    <div className="space-y-3">
                      {insights.monthlyItems.map((item) => (
                        <SmallPatternCard key={item.key} item={item} tone="violet" />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard
              title="Bulk buy opportunities"
              subtitle="Items bought often enough that bigger packs may save money."
              count={insights.bulkCandidates.length}
              tone="amber"
              defaultOpen={false}
            >
              {insights.bulkCandidates.length === 0 ? (
                <EmptyState message="No strong bulk-buy signals yet." />
              ) : (
                <div className="space-y-3">
                  {insights.bulkCandidates.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">
                            {capitalizeLabel(item.label)}
                          </p>
                          <p className="mt-1 text-sm text-zinc-500">
                            Bought {item.monthlyCount} time(s) in the last 30 days
                          </p>
                        </div>

                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                          Bulk hint
                        </span>
                      </div>

                      <p className="mt-3 text-sm text-zinc-700">{getBulkMessage(item.monthlyCount)}</p>

                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-600">
                        <p>Total purchases: {item.totalPurchases}</p>
                        <p>Total spent: {formatMoney(item.totalSpent)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Best store per item"
              subtitle="Compare stores by lowest average price per unit."
              count={insights.cheapestStoreItems.length}
              tone="emerald"
              defaultOpen={false}
            >
              {insights.cheapestStoreItems.length === 0 ? (
                <EmptyState message="Add the same item from at least 2 stores to unlock price comparison." />
              ) : (
                <div className="space-y-3">
                  {insights.cheapestStoreItems.map((item) => (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-zinc-900">
                            {capitalizeLabel(item.label)}
                          </p>
                          <p className="mt-1 text-sm text-zinc-500">
                            Best price: {item.cheapestStore?.name || '—'}
                          </p>
                        </div>

                        {item.cheapestStore ? (
                          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                            {formatMoney(item.cheapestStore.avgUnitPrice)}/unit
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-3 space-y-2">
                        {item.storeComparisons.map((store) => (
                          <div
                            key={`${item.key}-${store.name}`}
                            className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 text-sm ring-1 ring-zinc-100"
                          >
                            <div>
                              <p className="font-medium text-zinc-900">{store.name}</p>
                              <p className="text-xs text-zinc-500">
                                {store.purchaseCount} purchase(s)
                              </p>
                            </div>

                            <div className="text-right">
                              <p className="font-semibold text-zinc-900">
                                {formatMoney(store.avgUnitPrice)}/unit
                              </p>
                              <p className="text-xs text-zinc-500">
                                Avg basket {formatMoney(store.avgBasketPrice)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Shopping frequency"
              subtitle="Your most repeated items and their current shopping pattern."
              count={topItems.length}
              tone="neutral"
              defaultOpen={false}
            >
              <div className="space-y-3">
                {topItems.map((item) => (
                  <div
                    key={item.key}
                    className={`rounded-2xl border p-4 ${getToneClasses(getItemStatusTone(item)).shell}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-zinc-900">
                          {capitalizeLabel(item.label)}
                        </p>
                        <p className="mt-1 text-sm text-zinc-500">{item.frequency}</p>
                      </div>

                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${getFrequencyBadgeClasses(item)}`}
                      >
                        {getFrequencyBadgeLabel(item)}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-zinc-600">
                      <p>Total purchases: {item.totalPurchases}</p>
                      <p>Last 30 days: {item.monthlyCount}</p>
                      <p>Total spent: {formatMoney(item.totalSpent)}</p>
                      <p>Best store: {item.cheapestStore ? item.cheapestStore.name : 'Not enough data'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </AppPageShell>
  )
}