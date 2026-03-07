export type ShoppingItemStatus = 'pending' | 'purchased' | 'deleted'

export interface Household {
  id: string
  name: string
  created_by: string | null
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  role: 'owner' | 'member'
  joined_at: string
}

export interface ShoppingItem {
  id: string
  household_id: string
  name: string
  normalized_name: string
  quantity: number
  unit: string | null
  note: string | null
  status: ShoppingItemStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface Purchase {
  id: string
  household_id: string
  shopping_item_id: string | null
  item_name: string
  normalized_name: string
  quantity: number
  unit: string | null
  price: number | null
  store: string | null
  note: string | null
  purchased_by: string | null
  purchased_at: string
  created_at: string
}

export interface Store {
  id: string
  household_id: string
  name: string
  created_at: string
}