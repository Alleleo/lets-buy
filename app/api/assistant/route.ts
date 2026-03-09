import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { buildAssistantReply } from '@/lib/assistant'
import type { Purchase } from '@/lib/shoppingSuggestions'

type RequestBody = {
  message?: string
}

type HouseholdMemberRow = {
  household_id: string
}

type PurchaseRow = Purchase & {
  household_id: string
  unit?: string | null
  note?: string | null
  purchased_by?: string | null
  created_at?: string | null
  shopping_item_id?: string | null
}

function getBearerToken(request: Request) {
  const authHeader =
    request.headers.get('authorization') || request.headers.get('Authorization')

  if (!authHeader) return null

  const [type, token] = authHeader.split(' ')

  if (type?.toLowerCase() !== 'bearer' || !token) return null

  return token
}

function createAuthedSupabaseClient(accessToken: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  )
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody
    const message = body?.message?.trim()

    if (!message) {
      return NextResponse.json(
        { error: 'Message is required.' },
        { status: 400 }
      )
    }

    const accessToken = getBearerToken(request)

    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing access token.' },
        { status: 401 }
      )
    }

    const supabase = createAuthedSupabaseClient(accessToken)

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: authError?.message || 'You must be logged in to use the assistant.' },
        { status: 401 }
      )
    }

    const { data: memberRows, error: memberError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)

    if (memberError) {
      return NextResponse.json(
        { error: memberError.message || 'Failed to load household membership.' },
        { status: 500 }
      )
    }

    const householdIds = ((memberRows || []) as HouseholdMemberRow[])
      .map((row) => row.household_id)
      .filter(Boolean)

    if (!householdIds.length) {
      return NextResponse.json(
        {
          intent: 'unknown',
          itemName: null,
          answer: 'I could not find a household linked to your account yet.',
          matchedCount: 0,
          suggestions: [],
        },
        { status: 200 }
      )
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
      .limit(3000)

    if (purchasesError) {
      return NextResponse.json(
        { error: purchasesError.message || 'Failed to load purchases for assistant.' },
        { status: 500 }
      )
    }

    const purchases: Purchase[] = ((purchaseRows || []) as PurchaseRow[]).map((row) => ({
      id: row.id,
      item_name: row.item_name ?? null,
      normalized_name: row.normalized_name ?? null,
      quantity: row.quantity ?? null,
      price: row.price ?? null,
      store: row.store ?? null,
      purchased_at: row.purchased_at ?? null,
    }))

    const reply = buildAssistantReply({
      message,
      purchases,
    })

    return NextResponse.json(reply, { status: 200 })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected server error.'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}