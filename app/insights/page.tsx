"use client";

import AppPageShell from "@/components/AppPageShell";
import { buildShoppingSuggestions, type PurchaseForSuggestions } from "@/lib/shoppingSuggestions";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

type HouseholdRow = {
  id: string;
  name: string;
};

type PurchaseRow = {
  id: string;
  household_id: string;
  item_name: string;
  normalized_name: string | null;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  store: string | null;
  purchased_at: string;
};

type ItemAggregate = {
  key: string;
  displayName: string;
  timesBought: number;
  totalQuantity: number;
  totalSpent: number;
  unit: string | null;
};

type StoreAggregate = {
  store: string;
  totalSpent: number;
  purchasesCount: number;
};

function getMonthStart(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatQty(value: number) {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function getErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

function normalizeItemKey(row: PurchaseRow) {
  const normalized = row.normalized_name?.trim().toLowerCase();
  if (normalized) return normalized;
  return row.item_name.trim().toLowerCase();
}

function titleCaseItem(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function aggregateItems(rows: PurchaseRow[]): ItemAggregate[] {
  const map = new Map<string, ItemAggregate>();

  for (const row of rows) {
    const key = normalizeItemKey(row);
    const existing = map.get(key);

    const qty = Number(row.quantity ?? 0);
    const price = Number(row.price ?? 0);

    if (existing) {
      existing.timesBought += 1;
      existing.totalQuantity += qty;
      existing.totalSpent += price;
      if (!existing.unit && row.unit) existing.unit = row.unit;
    } else {
      map.set(key, {
        key,
        displayName: titleCaseItem(row.item_name || key),
        timesBought: 1,
        totalQuantity: qty,
        totalSpent: price,
        unit: row.unit ?? null,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (b.timesBought !== a.timesBought) return b.timesBought - a.timesBought;
    if (b.totalQuantity !== a.totalQuantity) return b.totalQuantity - a.totalQuantity;
    return b.totalSpent - a.totalSpent;
  });
}

function aggregateStores(rows: PurchaseRow[]): StoreAggregate[] {
  const map = new Map<string, StoreAggregate>();

  for (const row of rows) {
    const store = row.store?.trim() || "Unknown Store";
    const existing = map.get(store);
    const price = Number(row.price ?? 0);

    if (existing) {
      existing.totalSpent += price;
      existing.purchasesCount += 1;
    } else {
      map.set(store, {
        store,
        totalSpent: price,
        purchasesCount: 1,
      });
    }
  }

  return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
}

function buildBulkSuggestions(items: ItemAggregate[]) {
  return items
    .filter((item) => item.timesBought >= 4)
    .slice(0, 5)
    .map((item) => ({
      name: item.displayName,
      reason: `${item.displayName} was bought ${item.timesBought} times this month`,
      suggestion:
        item.totalQuantity >= item.timesBought
          ? `Consider buying more at once next time for better value.`
          : `Consider bundling this item into a bulk purchase.`,
    }));
}

function buildWeeklySuggestions(items: ItemAggregate[]) {
  return items
    .filter((item) => item.timesBought >= 2 && item.timesBought <= 3)
    .slice(0, 5)
    .map((item) => ({
      name: item.displayName,
      suggestion: `This looks like a regular weekly item. Buy smaller amounts as needed.`,
    }));
}

export default function InsightsPage() {
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadInsights() {
      try {
        setLoading(true);
        setErrorMessage("");

        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError) throw authError;
        if (!user) {
          if (!mounted) return;
          setLoading(false);
          return;
        }

        const { data: memberRows, error: memberError } = await supabase
          .from("household_members")
          .select("household_id, households(id, name)")
          .eq("user_id", user.id)
          .limit(1);

        if (memberError) throw memberError;

        const member = memberRows?.[0] as
          | {
              household_id: string;
              households: HouseholdRow | HouseholdRow[] | null;
            }
          | undefined;

        if (!member) {
          if (!mounted) return;
          setHousehold(null);
          setPurchases([]);
          setLoading(false);
          return;
        }

        const resolvedHousehold = Array.isArray(member.households)
          ? member.households[0]
          : member.households;

        if (!resolvedHousehold) {
          if (!mounted) return;
          setHousehold(null);
          setPurchases([]);
          setLoading(false);
          return;
        }

        const monthStart = getMonthStart();

        const { data: purchaseRows, error: purchaseError } = await supabase
          .from("purchases")
          .select(
            "id, household_id, item_name, normalized_name, quantity, unit, price, store, purchased_at"
          )
          .eq("household_id", resolvedHousehold.id)
          .gte("purchased_at", monthStart)
          .order("purchased_at", { ascending: false });

        if (purchaseError) throw purchaseError;

        if (!mounted) return;

        setHousehold(resolvedHousehold);
        setPurchases((purchaseRows ?? []) as PurchaseRow[]);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(getErrorMessage(error, "Failed to load insights."));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadInsights();

    return () => {
      mounted = false;
    };
  }, []);

  const itemAggregates = useMemo(() => aggregateItems(purchases), [purchases]);
  const storeAggregates = useMemo(() => aggregateStores(purchases), [purchases]);

  const purchasesByItem = useMemo(() => {
    const map: Record<string, PurchaseRow[]> = {};

    for (const p of purchases) {
      const key = p.normalized_name ?? p.item_name.toLowerCase();

      if (!map[key]) map[key] = [];

      map[key].push(p);
    }

    return map;
  }, [purchases]);

  const frequentItems = useMemo(() => {
    const result: { name: string; count: number }[] = [];

    for (const key in purchasesByItem) {
      const list = purchasesByItem[key];

      if (list.length >= 6) {
        result.push({
          name: list[0].item_name,
          count: list.length,
        });
      }
    }

    return result.sort((a, b) => b.count - a.count).slice(0, 5);
  }, [purchasesByItem]);

  const weeklyItems = useMemo(() => {
    const result: { name: string; count: number }[] = [];

    for (const key in purchasesByItem) {
      const list = purchasesByItem[key];

      if (list.length < 3) continue;

      const dates = list
        .map((p) => new Date(p.purchased_at).getTime())
        .sort((a, b) => a - b);

      const gaps = [];

      for (let i = 1; i < dates.length; i++) {
        gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
      }

      const avgGap =
        gaps.reduce((sum, g) => sum + g, 0) / gaps.length;

      if (avgGap >= 5 && avgGap <= 10) {
        result.push({
          name: list[0].item_name,
          count: list.length,
        });
      }
    }

    return result.slice(0, 5);
  }, [purchasesByItem]);

  const bulkItems = useMemo(() => {
    const result: { name: string; months: number }[] = [];

    for (const key in purchasesByItem) {
      const list = purchasesByItem[key];

      const months = new Set(
        list.map((p) => {
          const d = new Date(p.purchased_at);
          return `${d.getFullYear()}-${d.getMonth()}`;
        })
      );

      if (months.size >= 2 && list.length >= 4) {
        result.push({
          name: list[0].item_name,
          months: months.size,
        });
      }
    }

    return result.slice(0, 5);
  }, [purchasesByItem]);

  const missingThisMonth = useMemo(() => {
    const now = new Date();

    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;

    const result: string[] = [];

    for (const key in purchasesByItem) {
      const list = purchasesByItem[key];

      const months = new Set(
        list.map((p) => {
          const d = new Date(p.purchased_at);
          return `${d.getFullYear()}-${d.getMonth()}`;
        })
      );

      if (!months.has(currentMonth) && months.size >= 2) {
        result.push(list[0].item_name);
      }
    }

    return result.slice(0, 5);
  }, [purchasesByItem]);

  const totalSpent = useMemo(
    () => purchases.reduce((sum, row) => sum + Number(row.price ?? 0), 0),
    [purchases]
  );

  const totalPurchases = purchases.length;
  const mostBoughtItem = itemAggregates[0] ?? null;
  const repeatItems = itemAggregates.filter((item) => item.timesBought >= 2).slice(0, 5);
  const bulkSuggestions = buildBulkSuggestions(itemAggregates);
  const weeklySuggestions = buildWeeklySuggestions(itemAggregates);

  const suggestions = buildShoppingSuggestions(
    (purchases ?? []) as PurchaseForSuggestions[]
  );

  return (
    <AppPageShell
      title="Insights"
      subtitle="Monthly shopping trends, repeat buys, spending patterns, and bulk-buy ideas."
    >
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Loading insights...</p>
        </div>
      ) : null}

      {!loading && errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {!loading && !errorMessage && !household ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">
            No household found yet. Create or join a household first.
          </p>
        </div>
      ) : null}

      {!loading && !errorMessage && household ? (
        <div className="space-y-4">
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">Total spent this month</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {formatMoney(totalSpent)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">Total purchase entries</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">
                {totalPurchases}
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">Most bought item</div>
              {mostBoughtItem ? (
                <>
                  <div className="mt-2 text-xl font-semibold text-slate-900">
                    {mostBoughtItem.displayName}
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    Bought {mostBoughtItem.timesBought} times
                    {mostBoughtItem.totalQuantity > 0
                      ? ` • Total qty ${formatQty(mostBoughtItem.totalQuantity)} ${mostBoughtItem.unit ?? ""}`
                      : ""}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">No purchases this month yet.</p>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-sm text-slate-500">Household</div>
              <div className="mt-2 text-xl font-semibold text-slate-900">
                {household.name}
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Insights are based on this month’s purchase history.
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Top repeated items</h2>

            {repeatItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No repeated items yet this month.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {repeatItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{item.displayName}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        Bought {item.timesBought} times
                        {item.totalQuantity > 0
                          ? ` • Qty ${formatQty(item.totalQuantity)} ${item.unit ?? ""}`
                          : ""}
                      </div>
                    </div>
                    <div className="text-sm font-medium text-slate-800">
                      {formatMoney(item.totalSpent)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Bulk-buy suggestions</h2>

            {bulkSuggestions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No strong bulk-buy suggestion yet. Once items repeat more often, they will appear here.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {bulkSuggestions.map((item) => (
                  <div key={item.name} className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="mt-1 text-sm text-slate-600">{item.reason}</div>
                    <div className="mt-2 text-sm text-slate-800">{item.suggestion}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Weekly-buy suggestions</h2>

            {weeklySuggestions.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">
                No weekly-buy pattern found yet.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {weeklySuggestions.map((item) => (
                  <div key={item.name} className="rounded-xl bg-slate-50 px-3 py-3">
                    <div className="font-medium text-slate-900">{item.name}</div>
                    <div className="mt-2 text-sm text-slate-800">{item.suggestion}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── New sections added below ── */}

          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                Smart next shopping list
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Based on your purchase history and repeat patterns.
              </p>

              <div className="mt-4 space-y-2">
                {suggestions.nextShoppingList.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Not enough purchase history yet to generate suggestions.
                  </p>
                ) : (
                  suggestions.nextShoppingList.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center justify-between rounded-2xl bg-slate-50 px-3 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {item.name}
                        </div>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.reason === "overdue" && "Usually bought by now"}
                          {item.reason === "due-soon" && "Likely needed soon"}
                          {item.reason === "weekly" && "Weekly repeat"}
                          {item.reason === "frequent" && "Frequently bought"}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs text-slate-500">History</div>
                        <div className="text-sm font-semibold text-slate-900">
                          {item.count}x
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Buy soon</h2>
              <p className="mt-1 text-sm text-slate-500">
                Items that look overdue or close to their usual purchase cycle.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {suggestions.buySoon.length === 0 ? (
                  <p className="text-sm text-slate-500">No due-soon items detected yet.</p>
                ) : (
                  suggestions.buySoon.map((item) => (
                    <span
                      key={item.key}
                      className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700"
                    >
                      {item.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Weekly items</h2>
              <p className="mt-1 text-sm text-slate-500">
                Items you tend to buy every week.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {suggestions.weeklyItems.length === 0 ? (
                  <p className="text-sm text-slate-500">No weekly pattern detected yet.</p>
                ) : (
                  suggestions.weeklyItems.map((item) => (
                    <span
                      key={item.key}
                      className="rounded-full bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700"
                    >
                      {item.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                Bulk buy suggestions
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Stable repeat items that may be worth buying in larger amounts.
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                {suggestions.bulkBuyCandidates.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No strong bulk-buy candidates yet.
                  </p>
                ) : (
                  suggestions.bulkBuyCandidates.map((item) => (
                    <span
                      key={item.key}
                      className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700"
                    >
                      {item.name}
                    </span>
                  ))
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Frequent items</h2>
            {frequentItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No items bought 6+ times yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {frequentItems.map((item) => (
                  <div key={item.name} className="text-sm text-slate-700">
                    {item.name} ({item.count} purchases)
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Weekly items</h2>
            {weeklyItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No clear weekly patterns detected yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {weeklyItems.map((item) => (
                  <div key={item.name} className="text-sm text-slate-700">
                    {item.name}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Bulk buy suggestions</h2>
            {bulkItems.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No strong bulk candidates yet.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {bulkItems.map((item) => (
                  <div key={item.name} className="text-sm text-slate-700">
                    {item.name}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">You may need these soon</h2>
            {missingThisMonth.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No missing frequent items this month.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {missingThisMonth.map((name) => (
                  <div key={name} className="text-sm text-slate-700">
                    {name}
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">Store spending report</h2>

            {storeAggregates.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No store spending yet this month.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {storeAggregates.map((store) => (
                  <div
                    key={store.store}
                    className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-3"
                  >
                    <div>
                      <div className="font-medium text-slate-900">{store.store}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {store.purchasesCount} purchase{store.purchasesCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="text-sm font-semibold text-slate-900">
                      {formatMoney(store.totalSpent)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </AppPageShell>
  );
}