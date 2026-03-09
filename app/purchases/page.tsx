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

type BoughtItemRow = {
  id: string;
  household_id: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  updated_at: string;
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

export default function PurchasesPage() {
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRow[]>([]);
  const [awaitingItems, setAwaitingItems] = useState<BoughtItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [priceMap, setPriceMap] = useState<Record<string, string>>({});
  const [storeMap, setStoreMap] = useState<Record<string, string>>({});
  const [noteMap, setNoteMap] = useState<Record<string, string>>({});

  async function loadAwaitingItems(householdId: string) {
    const { data } = await supabase
      .from("shopping_items")
      .select("id, household_id, name, quantity, unit, updated_at")
      .eq("household_id", householdId)
      .eq("status", "purchased")
      .order("updated_at", { ascending: false });

    setAwaitingItems((data ?? []) as BoughtItemRow[]);
  }

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

  async function savePurchase(item: BoughtItemRow) {
    try {
      const price = Number(priceMap[item.id] ?? 0);

      const { error } = await supabase.from("purchases").insert({
        household_id: item.household_id,
        shopping_item_id: item.id,
        item_name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        price: price || null,
        store: storeMap[item.id] || null,
        note: noteMap[item.id] || null,
      });

      if (error) throw error;

      setPriceMap((prev) => ({ ...prev, [item.id]: "" }));
      setStoreMap((prev) => ({ ...prev, [item.id]: "" }));
      setNoteMap((prev) => ({ ...prev, [item.id]: "" }));

      await reloadPurchases();
      await loadAwaitingItems(item.household_id);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed saving purchase."));
    }
  }

  useEffect(() => {
    let mounted = true;

    async function loadPage() {
      try {
        setLoading(true);
        setErrorMessage("");

        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const { data: memberRows } = await supabase
          .from("household_members")
          .select("household_id, households(id, name)")
          .eq("user_id", user.id)
          .limit(1);

        const member = memberRows?.[0] as any;

        const resolvedHousehold = Array.isArray(member.households)
          ? member.households[0]
          : member.households;

        if (!mounted) return;

        setHousehold(resolvedHousehold);

        await reloadPurchases();
        await loadAwaitingItems(resolvedHousehold.id);
      } catch (error) {
        if (!mounted) return;
        setErrorMessage(getErrorMessage(error));
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPage();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <AppPageShell
      title="Purchases"
      subtitle="Add bill details after shopping."
    >
      {loading && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          Loading purchases...
        </div>
      )}

      {errorMessage && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {!loading && awaitingItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Awaiting Details</h2>

          {awaitingItems.map((item) => (
            <div
              key={item.id}
              className="rounded-2xl border bg-white p-4 shadow-sm space-y-3"
            >
              <div className="font-semibold">{item.name}</div>

              <div className="text-sm text-slate-500">
                Qty: {formatQty(item.quantity)} {item.unit ?? ""}
              </div>

              <input
                placeholder="Price"
                className="w-full border rounded-lg px-3 py-2"
                value={priceMap[item.id] ?? ""}
                onChange={(e) =>
                  setPriceMap({ ...priceMap, [item.id]: e.target.value })
                }
              />

              <input
                placeholder="Store"
                className="w-full border rounded-lg px-3 py-2"
                value={storeMap[item.id] ?? ""}
                onChange={(e) =>
                  setStoreMap({ ...storeMap, [item.id]: e.target.value })
                }
              />

              <input
                placeholder="Note"
                className="w-full border rounded-lg px-3 py-2"
                value={noteMap[item.id] ?? ""}
                onChange={(e) =>
                  setNoteMap({ ...noteMap, [item.id]: e.target.value })
                }
              />

              <button
                onClick={() => savePurchase(item)}
                className="w-full bg-green-600 text-white rounded-lg py-2"
              >
                Save Purchase
              </button>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-3 mt-6">
        <h2 className="text-lg font-semibold">Purchase History</h2>

        {purchases.map((purchase) => (
          <div
            key={purchase.id}
            className="rounded-2xl border bg-white p-4 shadow-sm"
          >
            <div className="font-semibold">{purchase.item_name}</div>

            <div className="text-sm text-slate-500">
              Qty: {formatQty(purchase.quantity)} {purchase.unit ?? ""}
            </div>

            {purchase.price && (
              <div className="text-sm">{formatMoney(purchase.price)}</div>
            )}

            {purchase.store && (
              <div className="text-sm text-slate-500">
                Store: {purchase.store}
              </div>
            )}
          </div>
        ))}
      </section>
    </AppPageShell>
  );
}