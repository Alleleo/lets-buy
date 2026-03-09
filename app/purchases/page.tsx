"use client";

import { useEffect, useMemo, useState } from "react";
import AppPageShell from "@/components/AppPageShell";
import { normalizeItemName } from "@/lib/helpers";
import { supabase } from "@/lib/supabase";

type HouseholdRow = {
  id: string;
  name: string;
};

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

type AwaitingItemRow = {
  id: string;
  household_id: string;
  name: string;
  normalized_name: string | null;
  quantity: number | null;
  unit: string | null;
  note: string | null;
  updated_at: string | null;
  created_at: string | null;
};

function formatQty(value: number | null) {
  if (value == null) return "—";
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}

function formatMoney(value: number | null) {
  if (value == null) return "—";
  return `$${value.toFixed(2)}`;
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
  const [loading, setLoading] = useState(true);
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [awaitingItems, setAwaitingItems] = useState<AwaitingItemRow[]>([]);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);

  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [bulkStore, setBulkStore] = useState("");
  const [bulkNote, setBulkNote] = useState("");

  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  const [savingBulk, setSavingBulk] = useState(false);
  const [savingSingleId, setSavingSingleId] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function loadHouseholdAndUser() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) {
      setUserId(null);
      setHousehold(null);
      return null;
    }

    setUserId(user.id);

    const { data: membership, error: membershipError } = await supabase
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membershipError) throw membershipError;
    if (!membership?.household_id) {
      setHousehold(null);
      return null;
    }

    const { data: householdRow, error: householdError } = await supabase
      .from("households")
      .select("id, name")
      .eq("id", membership.household_id)
      .maybeSingle();

    if (householdError) throw householdError;
    if (!householdRow) {
      setHousehold(null);
      return null;
    }

    const resolvedHousehold = householdRow as HouseholdRow;
    setHousehold(resolvedHousehold);
    return {
      userId: user.id,
      householdId: resolvedHousehold.id,
    };
  }

  async function loadPageData(householdId: string) {
    const { data: purchaseRows, error: purchasesError } = await supabase
      .from("purchases")
      .select(
        "id, household_id, shopping_item_id, item_name, normalized_name, quantity, unit, price, store, note, purchased_by, purchased_at, created_at"
      )
      .eq("household_id", householdId)
      .order("purchased_at", { ascending: false });

    if (purchasesError) throw purchasesError;

    const typedPurchases = (purchaseRows ?? []) as PurchaseRow[];
    setPurchases(typedPurchases);

    const completedShoppingItemIds = new Set(
      typedPurchases
        .map((row) => row.shopping_item_id)
        .filter((value): value is string => Boolean(value))
    );

    const { data: purchasedShoppingItems, error: awaitingError } = await supabase
      .from("shopping_items")
      .select(
        "id, household_id, name, normalized_name, quantity, unit, note, updated_at, created_at"
      )
      .eq("household_id", householdId)
      .eq("status", "purchased")
      .order("updated_at", { ascending: false });

    if (awaitingError) throw awaitingError;

    const typedAwaiting = ((purchasedShoppingItems ?? []) as AwaitingItemRow[]).filter(
      (item) => !completedShoppingItemIds.has(item.id)
    );

    setAwaitingItems(typedAwaiting);
  }

  async function refreshAll() {
    const resolved = await loadHouseholdAndUser();
    if (!resolved) {
      setPurchases([]);
      setAwaitingItems([]);
      return;
    }
    await loadPageData(resolved.householdId);
  }

  function toggleItemSelection(itemId: string) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  }

  function selectAllAwaiting() {
    setSelectedItemIds(awaitingItems.map((item) => item.id));
  }

  function clearSelection() {
    setSelectedItemIds([]);
  }

  async function saveSingleItem(item: AwaitingItemRow) {
    if (!userId) {
      setErrorMessage("You must be logged in to save purchases.");
      return;
    }

    try {
      setSavingSingleId(item.id);
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
      setSelectedItemIds((prev) => prev.filter((id) => id !== item.id));

      if (household) {
        await loadPageData(household.id);
      }

      setSuccessMessage("Purchase saved successfully.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed saving purchase."));
    } finally {
      setSavingSingleId(null);
    }
  }

  async function saveSelectedItems() {
    if (!userId || !household) {
      setErrorMessage("You must be logged in to save purchases.");
      return;
    }

    if (selectedItemIds.length === 0) {
      setErrorMessage("Select at least one item first.");
      return;
    }

    try {
      setSavingBulk(true);
      setErrorMessage("");
      setSuccessMessage("");

      const selectedItems = awaitingItems.filter((item) =>
        selectedItemIds.includes(item.id)
      );

      if (selectedItems.length === 0) {
        throw new Error("No valid items selected.");
      }

      const purchasedAt = new Date().toISOString();

      const rows = selectedItems.map((item) => {
        const rawPrice = (priceMap[item.id] ?? "").trim();

        let numericPrice: number | null = null;
        if (rawPrice) {
          const parsed = Number(rawPrice);
          if (!Number.isFinite(parsed)) {
            throw new Error(`Price for "${item.name}" must be a valid number.`);
          }
          numericPrice = parsed;
        }

        const itemStore = (storeMap[item.id] ?? "").trim() || bulkStore.trim() || null;
        const itemNote =
          (noteMap[item.id] ?? "").trim() || bulkNote.trim() || item.note || null;

        return {
          household_id: item.household_id,
          shopping_item_id: item.id,
          item_name: item.name,
          normalized_name:
            item.normalized_name?.trim() || normalizeItemName(item.name),
          quantity: item.quantity,
          unit: item.unit,
          price: numericPrice,
          store: itemStore,
          note: itemNote,
          purchased_by: userId,
          purchased_at: purchasedAt,
        };
      });

      const { error } = await supabase.from("purchases").insert(rows);

      if (error) throw error;

      const clearedPriceMap = { ...priceMap };
      const clearedStoreMap = { ...storeMap };
      const clearedNoteMap = { ...noteMap };

      for (const itemId of selectedItemIds) {
        clearedPriceMap[itemId] = "";
        clearedStoreMap[itemId] = "";
        clearedNoteMap[itemId] = "";
      }

      setPriceMap(clearedPriceMap);
      setStoreMap(clearedStoreMap);
      setNoteMap(clearedNoteMap);

      setBulkStore("");
      setBulkNote("");
      setSelectedItemIds([]);

      await loadPageData(household.id);

      setSuccessMessage("Selected purchases saved successfully.");
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed saving selected purchases."));
    } finally {
      setSavingBulk(false);
    }
  }

  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        setLoading(true);
        setErrorMessage("");
        setSuccessMessage("");

        await refreshAll();
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(getErrorMessage(error));
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const selectedCount = selectedItemIds.length;

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
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  Awaiting Details
                </h2>
                <p className="text-sm text-slate-500">
                  Items marked as bought but not yet saved into purchase history.
                </p>
              </div>

              <div className="shrink-0 text-right text-sm text-slate-500">
                {awaitingItems.length} item(s)
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAllAwaiting}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    Select All
                  </button>

                  <button
                    type="button"
                    onClick={clearSelection}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700"
                  >
                    Clear
                  </button>

                  <span className="text-sm text-slate-500">
                    {selectedCount} selected
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <input
                    type="text"
                    value={bulkStore}
                    onChange={(e) => setBulkStore(e.target.value)}
                    placeholder="Store for selected items"
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                  />

                  <textarea
                    value={bulkNote}
                    onChange={(e) => setBulkNote(e.target.value)}
                    placeholder="Shared note for selected items"
                    rows={3}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                  />

                  <button
                    type="button"
                    onClick={saveSelectedItems}
                    disabled={savingBulk || selectedCount === 0}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {savingBulk
                      ? "Saving Selected..."
                      : `Save Selected (${selectedCount})`}
                  </button>
                </div>
              </div>
            </div>

            {awaitingItems.map((item) => {
              const isSelected = selectedItemIds.includes(item.id);
              const isSavingThis = savingSingleId === item.id;

              return (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start gap-3">
                    <div className="pt-1">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleItemSelection(item.id)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                    </div>

                    <div className="min-w-0 flex-1 space-y-3">
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-slate-900">
                          {item.name}
                        </p>
                        <p className="mt-1 text-sm text-slate-500">
                          Qty: {formatQty(item.quantity)}
                          {item.unit ? ` ${item.unit}` : ""}
                        </p>
                        {item.updated_at && (
                          <p className="mt-1 text-xs text-slate-400">
                            Bought on {formatDate(item.updated_at)}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        <input
                          inputMode="decimal"
                          placeholder="Price (optional)"
                          value={priceMap[item.id] ?? ""}
                          onChange={(e) =>
                            setPriceMap((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                        />

                        <input
                          placeholder="Store (optional)"
                          value={storeMap[item.id] ?? ""}
                          onChange={(e) =>
                            setStoreMap((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                        />

                        <textarea
                          placeholder="Note (optional)"
                          rows={3}
                          value={noteMap[item.id] ?? ""}
                          onChange={(e) =>
                            setNoteMap((prev) => ({
                              ...prev,
                              [item.id]: e.target.value,
                            }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-900"
                        />

                        <button
                          type="button"
                          onClick={() => saveSingleItem(item)}
                          disabled={isSavingThis}
                          className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {isSavingThis ? "Saving..." : "Save This Item"}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
                    <p className="truncate text-base font-semibold text-slate-900">
                      {purchase.item_name}
                    </p>

                    <p className="mt-1 text-sm text-slate-500">
                      Qty: {formatQty(purchase.quantity)}
                      {purchase.unit ? ` ${purchase.unit}` : ""}
                    </p>

                    {(purchase.store || purchase.note) && (
                      <p className="mt-2 break-words text-sm text-slate-500">
                        {purchase.store ? `Store: ${purchase.store}` : ""}
                        {purchase.store && purchase.note ? " • " : ""}
                        {purchase.note ? purchase.note : ""}
                      </p>
                    )}

                    {purchase.purchased_at && (
                      <p className="mt-2 text-xs text-slate-400">
                        {formatDate(purchase.purchased_at)}
                      </p>
                    )}
                  </div>

                  <div className="shrink-0 text-sm font-semibold text-slate-900">
                    {formatMoney(purchase.price)}
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