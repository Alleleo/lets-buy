"use client";

import AppPageShell from "@/components/AppPageShell";
import { supabase } from "@/lib/supabase";
import { useEffect, useMemo, useState } from "react";

type PurchaseRow = {
  id: string;
  household_id: string;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  store: string | null;
  note: string | null;
  purchased_at: string;
};

type HouseholdRow = {
  id: string;
  name: string;
};

function formatMoney(value: number) {
  return `$${value.toFixed(2)}`;
}

function formatQty(value: number | null) {
  if (value == null) return "—";
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

function matchesDateRange(
  purchasedAt: string,
  startDate: string,
  endDate: string
) {
  const itemDate = new Date(purchasedAt);

  if (startDate) {
    const start = new Date(`${startDate}T00:00:00`);
    if (itemDate < start) return false;
  }

  if (endDate) {
    const end = new Date(`${endDate}T23:59:59.999`);
    if (itemDate > end) return false;
  }

  return true;
}

function formatMonthLabel(key: string) {
  const [year, month] = key.split("-");
  const date = new Date(Number(year), Number(month) - 1);

  return date.toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function PurchasesPage() {
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStore, setSelectedStore] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  async function reloadPurchases() {
    if (!household) return;

    const { data } = await supabase
      .from("purchases")
      .select(
        "id, household_id, item_name, quantity, unit, price, store, note, purchased_at"
      )
      .eq("household_id", household.id)
      .order("purchased_at", { ascending: false })
      .limit(200);

    setPurchases((data ?? []) as PurchaseRow[]);
  }

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
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

        const { data: purchaseRows, error: purchaseError } = await supabase
          .from("purchases")
          .select(
            "id, household_id, item_name, quantity, unit, price, store, note, purchased_at"
          )
          .eq("household_id", resolvedHousehold.id)
          .order("purchased_at", { ascending: false })
          .limit(200);

        if (purchaseError) throw purchaseError;

        if (!mounted) return;

        setHousehold(resolvedHousehold);
        setPurchases((purchaseRows ?? []) as PurchaseRow[]);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(getErrorMessage(error, "Failed to load purchases."));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPage();

    return () => {
      mounted = false;
    };
  }, []);

  const storeOptions = useMemo(() => {
    const uniqueStores = Array.from(
      new Set(
        purchases
          .map((purchase) => purchase.store?.trim())
          .filter((store): store is string => !!store)
      )
    ).sort((a, b) => a.localeCompare(b));

    return uniqueStores;
  }, [purchases]);

  const filteredPurchases = useMemo(() => {
    const search = searchTerm.trim().toLowerCase();

    return purchases.filter((purchase) => {
      const matchesSearch =
        !search ||
        purchase.item_name.toLowerCase().includes(search) ||
        (purchase.note ?? "").toLowerCase().includes(search) ||
        (purchase.store ?? "").toLowerCase().includes(search);

      const matchesStore =
        selectedStore === "all" || (purchase.store?.trim() || "") === selectedStore;

      const matchesDates = matchesDateRange(
        purchase.purchased_at,
        startDate,
        endDate
      );

      return matchesSearch && matchesStore && matchesDates;
    });
  }, [purchases, searchTerm, selectedStore, startDate, endDate]);

  const purchasesByMonth = useMemo(() => {
    const groups: Record<string, PurchaseRow[]> = {};

    for (const purchase of filteredPurchases) {
      const date = new Date(purchase.purchased_at);

      const key = `${date.getFullYear()}-${String(
        date.getMonth() + 1
      ).padStart(2, "0")}`;

      if (!groups[key]) groups[key] = [];

      groups[key].push(purchase);
    }

    return groups;
  }, [filteredPurchases]);

  const sortedMonths = useMemo(() => {
    return Object.keys(purchasesByMonth).sort((a, b) => b.localeCompare(a));
  }, [purchasesByMonth]);

  const totalSpent = useMemo(() => {
    return filteredPurchases.reduce(
      (sum, purchase) => sum + Number(purchase.price ?? 0),
      0
    );
  }, [filteredPurchases]);

  const totalEntries = filteredPurchases.length;

  const totalUnits = useMemo(() => {
    return filteredPurchases.reduce(
      (sum, purchase) => sum + Number(purchase.quantity ?? 0),
      0
    );
  }, [filteredPurchases]);

  function clearFilters() {
    setSearchTerm("");
    setSelectedStore("all");
    setStartDate("");
    setEndDate("");
  }

  return (
    <AppPageShell
      title="Purchases"
      subtitle="Search, filter, and review your household purchase history."
    >
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-600">Loading purchases...</p>
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
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Search item, store, or note
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search purchases..."
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Store
                </label>
                <select
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                >
                  <option value="all">All stores</option>
                  {storeOptions.map((store) => (
                    <option key={store} value={store}>
                      {store}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 transition hover:bg-slate-50"
                >
                  Clear filters
                </button>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Start date
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  End date
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-slate-500"
                />
              </div>
            </div>
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">Filtered spending</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {formatMoney(totalSpent)}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">Filtered entries</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {totalEntries}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-sm text-slate-500">Total quantity</div>
              <div className="mt-2 text-2xl font-semibold text-slate-900">
                {formatQty(totalUnits)}
              </div>
            </div>
          </section>

          {filteredPurchases.length === 0 ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-600">
                No purchases match your current filters.
              </p>
            </section>
          ) : (
            <section className="space-y-6">
              {sortedMonths.map((monthKey) => {
                const monthPurchases = purchasesByMonth[monthKey];

                const monthTotal = monthPurchases.reduce(
                  (sum, p) => sum + Number(p.price ?? 0),
                  0
                );

                return (
                  <div key={monthKey} className="space-y-3">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-lg font-semibold text-slate-900">
                            {formatMonthLabel(monthKey)}
                          </h2>
                          <p className="text-sm text-slate-500">
                            {monthPurchases.length} purchases
                          </p>
                        </div>

                        <div className="text-right">
                          <div className="text-sm text-slate-500">Total spent</div>
                          <div className="text-lg font-semibold text-slate-900">
                            {formatMoney(monthTotal)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {monthPurchases.map((purchase) => (
                      <article
                        key={purchase.id}
                        className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <h2 className="truncate text-base font-semibold text-slate-900">
                              {purchase.item_name}
                            </h2>

                            <p className="mt-1 text-sm text-slate-600">
                              Qty: {formatQty(purchase.quantity)}{" "}
                              {purchase.unit ? purchase.unit : ""}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <div className="text-sm font-semibold text-slate-900">
                              {formatMoney(Number(purchase.price ?? 0))}
                            </div>

                            <div className="mt-1 text-xs text-slate-500">
                              {new Date(purchase.purchased_at).toLocaleString()}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                            Store: {purchase.store || "—"}
                          </span>

                          {purchase.note ? (
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                              Note: {purchase.note}
                            </span>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                );
              })}
            </section>
          )}
        </div>
      ) : null}
    </AppPageShell>
  );
}