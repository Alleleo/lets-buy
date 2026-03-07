export function normalizeItemName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function parseQuickItemInput(input: string) {
  const trimmed = input.trim()

  if (!trimmed) {
    return {
      name: '',
      quantity: 1,
      unit: null as string | null,
    }
  }

  const startQtyMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)
  if (startQtyMatch) {
    return {
      name: startQtyMatch[2].trim(),
      quantity: Number(startQtyMatch[1]),
      unit: null as string | null,
    }
  }

  return {
    name: trimmed,
    quantity: 1,
    unit: null as string | null,
  }
}