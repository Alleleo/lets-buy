"use client";

import { useEffect, useMemo, useState } from "react";
import AppPageShell from "@/components/AppPageShell";
import { normalizeItemName } from "@/lib/helpers";
import { supabase } from "@/lib/supabase";

type PurchaseRow = {
  id: string;
  household_id: string;
  shopping_item_id: string | null;
  item_name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  price: number | null;
  store: string | null;
  note: string | null;
  purchased_by: string | null;
  purchased_at: string | null;
  created_at: string | null;
};

type BoughtItemRow = {
  id: string;
  household_id: string;
  name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  updated_at: string | null;
  created_at: string | null;
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

function formatDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function getErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function PurchasesPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [household, setHousehold] = useState<HouseholdRow | null>(null);

  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [awaitingItems, setAwaitingItems] = useState<BoughtItemRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingItemId, setSavingItemId] = useState<string | null>(null);

  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  async function loadPurchases(householdId: string) {
    const { data, error } = await supabase
      .from("purchases")
      .select(
        "id, household_id, shopping_item_id, item_name, normalized_name, quantity, unit, price, store, note, purchased_by, purchased_at, created_at"
      )
      .eq("household_id", householdId)
      .order("purchased_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    setPurchases((data ?? []) as PurchaseRow[]);
    return (data ?? []) as PurchaseRow[];
  }

  async function loadAwaitingItems(
    householdId: string,
    existingPurchases?: PurchaseRow[]
  ) {
    const { data, error } = await supabase
      .from("shopping_items")
      .select(
        "id, household_id, name, normalized_name, quantity, unit, note, updated_at, created_at"
      )
      .eq("household_id", householdId)
      .eq("status", "purchased")
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const purchasedItems = (data ?? []) as BoughtItemRow[];
    const purchaseRows = existingPurchases ?? purchases;

    const completedShoppingItemIds = new Set(
      purchaseRows
        .map((row) => row.shopping_item_id)
        .filter((value): value is string => Boolean(value))
    );

    const filtered = purchasedItems.filter(
      (item) => !completedShoppingItemIds.has(item.id)
    );

    setAwaitingItems(filtered);
  }

  async function loadPageData(householdId: string) {
    const loadedPurchases = await loadPurchases(householdId);
    await loadAwaitingItems(householdId, loadedPurchases);
  }

  async function savePurchase(item: BoughtItemRow) {
    if (!userId) {
      setErrorMessage("You must be logged in to save purchases.");
      return;
    }

    try {
      setSavingItemId(item.id);
      setErrorMessage("");
      setSuccessMessage("");

      const rawPrice = (priceMap[item.id] ?? "").trim();
      const rawStore = (storeMap[item.id] ?? "").trim();
      const rawNote = (noteMap[item.id] ?? "").trim();

      let numericPrice: number | null = null;

      if (rawPrice) {
        numericPrice = Number(rawPrice);
        if (!Number.isFinite(numericPrice)) {
          throw new Error("Price must be a valid number.");
        }
      }

      const normalizedName =
        item.normalized_name?.trim() || normalizeItemName(item.name);

      const { error } = await supabase.from("purchases").insert({
        household_id: item.household_id,
        shopping_item_id: item.id,
        item_name: item.name,
        normalized_name: normalizedName,
        quantity: item.quantity,
        unit: item.unit,
        price: numericPrice,
        store: rawStore || null,
        note: rawNote || item.note || null,
        purchased_by: userId,
        purchased_at: new Date().toISOString(),
      });

      if (error) throw error;

      setPriceMap((prev) => ({ ...prev, [item.id]: "" }));
      setStoreMap((prev) => ({ ...prev, [item.id]: "" }));
      setNoteMap((prev) => ({ ...prev, [item.id]: "" }));

      await loadPageData(item.household_id);
      setSuccessMessage("Purchase saved successfully.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed saving purchase."));
    } finally {
      setSavingItemId(null);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) throw userError;

        if (!user) {
          if (mounted) {
            setUserId(null);
            setHousehold(null);
            setPurchases([]);
            setAwaitingItems([]);
          }
          return;
        }

        if (!mounted) return;
        setUserId(user.id);

        const { data: memberRows, error: memberError } = await supabase
          .from("household_members")
          .select("household_id, households(id, name)")
          .eq("user_id", user.id)
          .limit(1);

        if (memberError) throw memberError;

        const member = memberRows?.[0] as
          | {
              household_id: string;
              households:
                | { id: string; name: string }
                | { id: string; name: string }[]
                | null;
            }
          | undefined;

        const resolvedHousehold = Array.isArray(member?.households)
          ? member?.households[0]
          : member?.households;

        if (!resolvedHousehold?.id) {
          if (mounted) {
            setHousehold(null);
            setPurchases([]);
            setAwaitingItems([]);
          }
          return;
        }

        if (!mounted) return;
        setHousehold({
          id: resolvedHousehold.id,
          name: resolvedHousehold.name,
        });

        await loadPageData(resolvedHousehold.id);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(getErrorMessage(error));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const totalSpent = useMemo(() => {
    return purchases.reduce((sum, purchase) => {
      return sum + Number(purchase.price ?? 0);
    }, 0);
  }, [purchases]);

  return (
    <AppPageShell
      title="Purchases"
      subtitle="Add bill details after shopping."
    >
      <div className="space-y-4">
        {loading && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-sm text-slate-600">Loading purchases...</p>
          </div>
        )}

        {errorMessage && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {successMessage}
          </div>
        )}

        {!loading && household && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Household
                </p>
                <p className="truncate text-sm font-medium text-slate-900">
                  {household.name}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Total spent
                </p>
                <p className="text-sm font-semibold text-slate-900">
                  {formatMoney(totalSpent)}
                </p>
              </div>
            </div>
          </section>
        )}

        {!loading && awaitingItems.length > 0 && (
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                Awaiting Details
              </h2>
              <p className="text-sm text-slate-500">
                Items marked as bought but not yet recorded in purchase history.
              </p>
            </div>

            {awaitingItems.map((item) => (
              <div
                key={item.id}
                className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-slate-900">
                    {item.name}
                  </div>
                  <div className="mt-1 text-sm text-slate-500">
                    Qty: {formatQty(item.quantity)}
                    {item.unit ? ` ${item.unit}` : ""}
                  </div>
                  {item.updated_at && (
                    <div className="mt-1 text-xs text-slate-400">
                      Bought on {formatDate(item.updated_at)}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <input
                    inputMode="decimal"
                    placeholder="Price"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                    value={priceMap[item.id] ?? ""}
                    onChange={(e) =>
                      setPriceMap((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                  />

                  <input
                    placeholder="Store"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                    value={storeMap[item.id] ?? ""}
                    onChange={(e) =>
                      setStoreMap((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                  />

                  <textarea
                    placeholder="Note"
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                    value={noteMap[item.id] ?? ""}
                    onChange={(e) =>
                      setNoteMap((prev) => ({
                        ...prev,
                        [item.id]: e.target.value,
                      }))
                    }
                  />

                  <button
                    type="button"
                    onClick={() => savePurchase(item)}
                    disabled={savingItemId === item.id}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingItemId === item.id ? "Saving..." : "Save Purchase"}
                  </button>
                </div>
              </div>
            ))}
          </section>
        )}

        {!loading && awaitingItems.length === 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">
              Awaiting Details
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              No bought items are waiting for bill details.
            </p>
          </section>
        )}

        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Purchase History
            </h2>
            <p className="text-sm text-slate-500">
              Completed purchases already saved with details.
            </p>
          </div>

          {purchases.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-sm text-slate-500">No purchases yet.</p>
            </div>
          ) : (
            purchases.map((purchase) => (
              <div
                key={purchase.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-slate-900">
                      {purchase.item_name}
                    </div>

                    <div className="mt-1 text-sm text-slate-500">
                      Qty: {formatQty(purchase.quantity)}
                      {purchase.unit ? ` ${purchase.unit}` : ""}
                    </div>

                    {(purchase.store || purchase.note) && (
                      <div className="mt-2 break-words text-sm text-slate-500">
                        {purchase.store ? `Store: ${purchase.store}` : ""}
                        {purchase.store && purchase.note ? " • " : ""}
                        {purchase.note ? purchase.note : ""}
                      </div>
                    )}

                    {purchase.purchased_at && (
                      <div className="mt-2 text-xs text-slate-400">
                        {formatDate(purchase.purchased_at)}
                      </div>
                    )}
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-slate-900">
                    {purchase.price != null ? formatMoney(purchase.price) : "—"}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </AppPageShell>
  );
}