export type PurchaseForSuggestions = {
  id: string;
  item_name: string;
  normalized_name: string | null;
  quantity: number | string | null;
  unit: string | null;
  price: number | string | null;
  store: string | null;
  note?: string | null;
  purchased_at: string;
};

export type SuggestedItem = {
  key: string;
  name: string;
  count: number;
  averageGapDays: number | null;
  lastPurchasedAt: string | null;
  daysSinceLastPurchase: number | null;
  monthsSeen: number;
  reason:
    | "frequent"
    | "weekly"
    | "monthly"
    | "due-soon"
    | "overdue"
    | "bulk";
};

export type ShoppingSuggestionsResult = {
  nextShoppingList: SuggestedItem[];
  buySoon: SuggestedItem[];
  weeklyItems: SuggestedItem[];
  frequentItems: SuggestedItem[];
  bulkBuyCandidates: SuggestedItem[];
};

type PurchaseGroup = {
  key: string;
  name: string;
  purchases: PurchaseForSuggestions[];
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function diffInDays(a: Date, b: Date) {
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(diff / msPerDay);
}

function average(numbers: number[]) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeKey(p: PurchaseForSuggestions) {
  return (p.normalized_name || p.item_name || "").trim().toLowerCase();
}

function groupPurchases(purchases: PurchaseForSuggestions[]): PurchaseGroup[] {
  const map = new Map<string, PurchaseForSuggestions[]>();

  for (const purchase of purchases) {
    const key = normalizeKey(purchase);
    if (!key) continue;

    const existing = map.get(key) ?? [];
    existing.push(purchase);
    map.set(key, existing);
  }

  return Array.from(map.entries()).map(([key, list]) => ({
    key,
    name: list[0]?.item_name || key,
    purchases: [...list].sort(
      (a, b) =>
        new Date(a.purchased_at).getTime() - new Date(b.purchased_at).getTime()
    ),
  }));
}

function analyzeGroup(
  group: PurchaseGroup,
  now = new Date()
): Omit<SuggestedItem, "reason"> {
  const purchases = group.purchases;
  const count = purchases.length;

  const dates = purchases.map((p) => new Date(p.purchased_at));
  const lastDate = dates[count - 1] ?? null;

  const gaps: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    gaps.push(diffInDays(dates[i], dates[i - 1]));
  }

  const averageGapDays = average(gaps);
  const daysSinceLastPurchase = lastDate ? diffInDays(now, lastDate) : null;
  const monthSet = new Set(dates.map((d) => getMonthKey(d)));

  return {
    key: group.key,
    name: group.name,
    count,
    averageGapDays,
    lastPurchasedAt: lastDate ? lastDate.toISOString() : null,
    daysSinceLastPurchase,
    monthsSeen: monthSet.size,
  };
}

export function buildShoppingSuggestions(
  purchases: PurchaseForSuggestions[],
  now = new Date()
): ShoppingSuggestionsResult {
  const groups = groupPurchases(purchases);

  const analyzed = groups
    .map((group) => analyzeGroup(group, now))
    .filter((item) => item.count >= 2);

  const frequentItems: SuggestedItem[] = analyzed
    .filter(
      (item) =>
        item.count >= 6 ||
        (item.averageGapDays !== null && item.averageGapDays <= 3)
    )
    .map((item) => ({ ...item, reason: "frequent" as const }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const weeklyItems: SuggestedItem[] = analyzed
    .filter(
      (item) =>
        item.averageGapDays !== null &&
        item.averageGapDays >= 5 &&
        item.averageGapDays <= 10 &&
        item.count >= 3
    )
    .map((item) => ({ ...item, reason: "weekly" as const }))
    .sort((a, b) => (a.averageGapDays ?? 999) - (b.averageGapDays ?? 999))
    .slice(0, 8);

  const bulkBuyCandidates: SuggestedItem[] = analyzed
    .filter(
      (item) =>
        item.monthsSeen >= 2 &&
        item.count >= 4 &&
        item.averageGapDays !== null &&
        item.averageGapDays >= 7
    )
    .map((item) => ({ ...item, reason: "bulk" as const }))
    .sort((a, b) => b.monthsSeen - a.monthsSeen || b.count - a.count)
    .slice(0, 8);

  const buySoonBase = analyzed
    .filter(
      (item) =>
        item.averageGapDays !== null &&
        item.daysSinceLastPurchase !== null &&
        item.count >= 3
    )
    .map((item) => {
      const ratio =
        item.averageGapDays && item.daysSinceLastPurchase
          ? item.daysSinceLastPurchase / item.averageGapDays
          : 0;

      return { item, ratio };
    });

  const overdueItems: SuggestedItem[] = buySoonBase
    .filter(({ ratio }) => ratio >= 1.15)
    .map(({ item }) => ({ ...item, reason: "overdue" as const }))
    .sort(
      (a, b) =>
        (b.daysSinceLastPurchase ?? 0) - (a.daysSinceLastPurchase ?? 0)
    )
    .slice(0, 8);

  const dueSoonItems: SuggestedItem[] = buySoonBase
    .filter(({ ratio }) => ratio >= 0.8 && ratio < 1.15)
    .map(({ item }) => ({ ...item, reason: "due-soon" as const }))
    .sort(
      (a, b) =>
        (b.daysSinceLastPurchase ?? 0) - (a.daysSinceLastPurchase ?? 0)
    )
    .slice(0, 8);

  const nextShoppingMap = new Map<string, SuggestedItem>();

  for (const item of overdueItems) nextShoppingMap.set(item.key, item);
  for (const item of dueSoonItems) {
    if (!nextShoppingMap.has(item.key)) nextShoppingMap.set(item.key, item);
  }
  for (const item of weeklyItems) {
    if (!nextShoppingMap.has(item.key)) nextShoppingMap.set(item.key, item);
  }
  for (const item of frequentItems) {
    if (!nextShoppingMap.has(item.key)) nextShoppingMap.set(item.key, item);
  }

  const nextShoppingList = Array.from(nextShoppingMap.values()).slice(0, 12);

  return {
    nextShoppingList,
    buySoon: [...overdueItems, ...dueSoonItems].slice(0, 10),
    weeklyItems,
    frequentItems,
    bulkBuyCandidates,
  };
}