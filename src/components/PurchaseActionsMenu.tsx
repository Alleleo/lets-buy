"use client";

import { supabase } from "@/lib/supabase";
import { useState } from "react";

type PurchaseRow = {
  id: string;
  item_name: string;
  price: number | null;
  store: string | null;
  note: string | null;
};

export default function PurchaseActionsMenu({
  purchase,
  onChanged,
}: {
  purchase: PurchaseRow;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [price, setPrice] = useState(purchase.price ?? 0);
  const [store, setStore] = useState(purchase.store ?? "");
  const [note, setNote] = useState(purchase.note ?? "");

  async function updatePurchase() {
    const { error } = await supabase
      .from("purchases")
      .update({
        price,
        store: store.trim() || null,
        note: note.trim() || null,
      })
      .eq("id", purchase.id);

    if (!error) {
      setEditing(false);
      onChanged();
    } else {
      alert(error.message);
    }
  }

  async function deletePurchase() {
    if (!confirm("Delete this purchase?")) return;

    const { error } = await supabase
      .from("purchases")
      .delete()
      .eq("id", purchase.id);

    if (!error) {
      onChanged();
    } else {
      alert(error.message);
    }
  }

  return (
    <>
      <button
        onClick={() => setEditing(true)}
        className="text-xs text-blue-600 hover:underline"
      >
        Edit
      </button>

      <button
        onClick={deletePurchase}
        className="ml-2 text-xs text-red-600 hover:underline"
      >
        Delete
      </button>

      {editing && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow">
            <h3 className="text-sm font-semibold mb-3">
              Edit {purchase.item_name}
            </h3>

            <label className="text-xs text-slate-600">Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(Number(e.target.value))}
              className="mb-2 w-full rounded border px-2 py-1 text-sm"
            />

            <label className="text-xs text-slate-600">Store</label>
            <input
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="mb-2 w-full rounded border px-2 py-1 text-sm"
            />

            <label className="text-xs text-slate-600">Note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mb-3 w-full rounded border px-2 py-1 text-sm"
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditing(false)}
                className="text-sm text-slate-600"
              >
                Cancel
              </button>

              <button
                onClick={updatePurchase}
                className="rounded bg-slate-900 px-3 py-1 text-sm text-white"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}