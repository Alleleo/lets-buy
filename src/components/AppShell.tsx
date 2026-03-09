'use client'

import BottomNav from "@/components/BottomNav";
import InviteMemberCard from "@/components/InviteMemberCard";
import { normalizeItemName, parseQuickItemInput } from '@/lib/helpers';
import { supabase } from '@/lib/supabase';
import type { Household, Purchase, ShoppingItem } from '@/types/database';
import { useEffect, useMemo, useState } from 'react';

type AuthMode = 'login' | 'signup'

type UserProfileState = {
  userId: string
  householdId: string | null
  householdName: string | null
}

type PendingItem = ShoppingItem

export default function AppShell() {
  const [loading, setLoading] = useState(true)
  const [authLoading, setAuthLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [profile, setProfile] = useState<UserProfileState | null>(null)
  const [householdNameInput, setHouseholdNameInput] = useState('')

  const [items, setItems] = useState<PendingItem[]>([])
  const [purchases, setPurchases] = useState<Purchase[]>([])

  const [quickItemInput, setQuickItemInput] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    initialize()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      initialize()
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!profile?.householdId) return

    fetchShoppingItems(profile.householdId)
    fetchPurchases(profile.householdId)

    const itemsChannel = supabase
      .channel(`shopping_items_${profile.householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shopping_items',
          filter: `household_id=eq.${profile.householdId}`,
        },
        () => {
          fetchShoppingItems(profile.householdId!)
        }
      )
      .subscribe()

    const purchasesChannel = supabase
      .channel(`purchases_${profile.householdId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchases',
          filter: `household_id=eq.${profile.householdId}`,
        },
        () => {
          fetchPurchases(profile.householdId!)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(itemsChannel)
      supabase.removeChannel(purchasesChannel)
    }
  }, [profile?.householdId])

  async function initialize() {
    setLoading(true)
    setError(null)

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError

      if (!user) {
        setProfile(null)
        setItems([])
        setPurchases([])
        return
      }

      const householdResult = await getMyHousehold(user.id)

      setProfile({
        userId: user.id,
        householdId: householdResult?.householdId ?? null,
        householdName: householdResult?.householdName ?? null,
      })
    } catch (err) {
      console.error('initialize error:', err)
      setProfile(null)
      setItems([])
      setPurchases([])
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function getMyHousehold(userId: string) {
    try {
      const { data: membership, error: membershipError } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle()

      if (membershipError) throw membershipError
      if (!membership?.household_id) return null

      const { data: household, error: householdError } = await supabase
        .from('households')
        .select('id, name')
        .eq('id', membership.household_id)
        .maybeSingle()

      if (householdError) throw householdError
      if (!household) return null

      const typedHousehold = household as Household

      return {
        householdId: typedHousehold.id,
        householdName: typedHousehold.name,
      }
    } catch (err) {
      console.error('getMyHousehold error:', err)
      return null
    }
  }

  async function fetchShoppingItems(householdId: string) {
    try {
      const { data, error } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('household_id', householdId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      if (error) throw error

      setItems((data ?? []) as PendingItem[])
    } catch (err) {
      console.error('fetchShoppingItems error:', err)
      setError(getErrorMessage(err))
    }
  }

  async function fetchPurchases(householdId: string) {
    try {
      const { data, error } = await supabase
        .from('purchases')
        .select('*')
        .eq('household_id', householdId)
        .order('purchased_at', { ascending: false })
        .limit(10)

      if (error) throw error

      setPurchases((data ?? []) as Purchase[])
    } catch (err) {
      console.error('fetchPurchases error:', err)
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (authMode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })

        if (error) throw error

        setMessage('Account created. You can now log in.')
        setAuthMode('login')
        setPassword('')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })

        if (error) throw error

        setMessage('Logged in successfully.')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setAuthLoading(false)
    }
  }

  async function handleLogout() {
    setError(null)
    setMessage(null)
    await supabase.auth.signOut()
    setProfile(null)
    setItems([])
    setPurchases([])
  }

  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault()

    if (!householdNameInput.trim()) {
      setError('Please enter a household name.')
      return
    }

    setActionLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await supabase.rpc('create_household_with_owner', {
        household_name: householdNameInput.trim(),
      })

      if (error) throw error

      setMessage('Household created successfully.')
      setHouseholdNameInput('')
      await initialize()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAddItem(e: React.FormEvent) {
    e.preventDefault()

    if (!profile?.householdId) {
      setError('No household found.')
      return
    }

    const parsed = parseQuickItemInput(quickItemInput)

    if (!parsed.name.trim()) {
      setError('Please enter an item name.')
      return
    }

    const normalizedName = normalizeItemName(parsed.name)

    setActionLoading(true)
    setError(null)
    setMessage(null)

    try {
      const existing = items.find(
        (item) => item.normalized_name === normalizedName && item.status === 'pending'
      )

      if (existing) {
        const newQuantity = Number(existing.quantity) + Number(parsed.quantity || 1)

        const { error } = await supabase
          .from('shopping_items')
          .update({
            quantity: newQuantity,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)

        if (error) throw error
      } else {
        const { error } = await supabase.from('shopping_items').insert({
          household_id: profile.householdId,
          name: parsed.name.trim(),
          normalized_name: normalizedName,
          quantity: parsed.quantity || 1,
          unit: parsed.unit,
          created_by: profile.userId,
          status: 'pending',
        })

        if (error) throw error
      }

      setQuickItemInput('')
      setMessage('Item added.')
      await fetchShoppingItems(profile.householdId)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleDeleteItem(itemId: string) {
    if (!profile?.householdId) return

    setActionLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({
          status: 'deleted',
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)

      if (error) throw error

      setMessage('Item deleted.')
      await fetchShoppingItems(profile.householdId)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  async function handleMarkBought(itemId: string) {
    if (!profile?.householdId) return

    setActionLoading(true)
    setError(null)
    setMessage(null)

    try {
      const { error } = await supabase
        .from('shopping_items')
        .update({
          status: 'purchased',
          updated_at: new Date().toISOString(),
        })
        .eq('id', itemId)

      if (error) throw error

      setMessage('Item moved to Purchases.')
      await fetchShoppingItems(profile.householdId)
    } catch (err) {
      console.error('handleMarkBought error:', err)
      setError(getErrorMessage(err))
    } finally {
      setActionLoading(false)
    }
  }

  const stats = useMemo(() => {
    const totalPendingItems = items.length
    const totalPendingQty = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

    return {
      totalPendingItems,
      totalPendingQty,
    }
  }, [items])

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 p-6 pb-24">
        <div className="mx-auto max-w-md rounded-3xl bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-500">Loading LETS BUY...</p>
        </div>
      </main>
    )
  }

  if (!profile) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 pb-24">
        <div className="mx-auto max-w-md">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">LETS BUY</h1>
            <p className="mt-2 text-sm text-slate-600">
              Shared shopping list for you.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">
              {authMode === 'login' ? 'Login' : 'Create account'}
            </h2>

            <form onSubmit={handleAuthSubmit} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:border-slate-900"
                  placeholder="you@example.com"
                  required
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:border-slate-900"
                  placeholder="••••••••"
                  required
                />
              </div>

              {message && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {authLoading
                  ? 'Please wait...'
                  : authMode === 'login'
                    ? 'Login'
                    : 'Create account'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setAuthMode(authMode === 'login' ? 'signup' : 'login')
                setError(null)
                setMessage(null)
              }}
              className="mt-4 w-full text-sm font-medium text-slate-600 underline underline-offset-4"
            >
              {authMode === 'login'
                ? 'Need an account? Sign up'
                : 'Already have an account? Log in'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  if (!profile.householdId) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 pb-24">
        <div className="mx-auto max-w-md">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">LETS BUY</h1>
              <p className="mt-2 text-sm text-slate-600">Create your shared household first.</p>
            </div>

            <button
              onClick={handleLogout}
              className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Logout
            </button>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
            <h2 className="text-xl font-semibold text-slate-900">Create household</h2>
            <p className="mt-2 text-sm text-slate-600">
              Example: Alle &amp; Fiance Home
            </p>

            <form onSubmit={handleCreateHousehold} className="mt-5 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Household name
                </label>
                <input
                  type="text"
                  value={householdNameInput}
                  onChange={(e) => setHouseholdNameInput(e.target.value)}
                  className="w-full rounded-2xl border border-slate-300 px-4 py-3 outline-none focus:border-slate-900"
                  placeholder="OUR HOME"
                />
              </div>

              {message && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {message}
                </div>
              )}

              {error && (
                <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={actionLoading}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
              >
                {actionLoading ? 'Creating...' : 'Create household'}
              </button>
            </form>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 pb-24">
      <div className="mx-auto max-w-md">
        <header className="mb-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900">LETS BUY</h1>
              <p className="mt-1 truncate text-sm text-slate-600">{profile.householdName}</p>
            </div>

            <button
              onClick={handleLogout}
              className="shrink-0 rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700"
            >
              Logout
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Pending items</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{stats.totalPendingItems}</p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500">Total quantity</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{stats.totalPendingQty}</p>
            </div>
          </div>
        </header>

        <section className="rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Quick Add</h2>

          <form
            onSubmit={handleAddItem}
            className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"
          >
            <input
              type="text"
              value={quickItemInput}
              onChange={(e) => setQuickItemInput(e.target.value)}
              className="w-full min-w-0 rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none focus:border-slate-900 sm:flex-1"
              placeholder="Example: 2 Milk"
            />
            <button
              type="submit"
              disabled={actionLoading}
              className="w-full shrink-0 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
            >
              Add
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {['Milk', 'Eggs', 'Rice', 'Bread', 'Bananas', 'Water'].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setQuickItemInput(item)}
                className="rounded-full bg-slate-100 px-3 py-2 text-sm text-slate-700"
              >
                {item}
              </button>
            ))}
          </div>

          {message && (
            <div className="mt-4 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {message}
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}
        </section>

        <InviteMemberCard householdId={profile.householdId} />

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Shopping List</h2>
            <p className="shrink-0 text-sm text-slate-500">{items.length} item(s)</p>
          </div>

          <div className="mt-4 space-y-3">
            {items.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No pending items yet.
              </div>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-slate-200 px-4 py-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-slate-900">{item.name}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Qty: {item.quantity}
                        {item.unit ? ` ${item.unit}` : ''}
                      </p>
                    </div>

                    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:shrink-0">
                      <button
                        type="button"
                        onClick={() => handleMarkBought(item.id)}
                        className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-sm font-medium text-white sm:w-auto"
                      >
                        Bought
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 sm:w-auto"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="mt-5 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Recent Purchases</h2>
            <p className="shrink-0 text-sm text-slate-500">Latest 10</p>
          </div>

          <div className="mt-4 space-y-3">
            {purchases.length === 0 ? (
              <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No purchases yet.
              </div>
            ) : (
              purchases.map((purchase) => (
                <div
                  key={purchase.id}
                  className="rounded-2xl border border-slate-200 px-4 py-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-base font-semibold text-slate-900">
                        {purchase.item_name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Qty: {purchase.quantity}
                        {purchase.unit ? ` ${purchase.unit}` : ''}
                      </p>
                    </div>

                    {purchase.price !== null && (
                      <p className="shrink-0 text-sm font-semibold text-slate-900">
                        {purchase.price}
                      </p>
                    )}
                  </div>

                  {(purchase.store || purchase.note) && (
                    <p className="mt-2 break-words text-sm text-slate-500">
                      {purchase.store ? `Store: ${purchase.store}` : ''}
                      {purchase.store && purchase.note ? ' • ' : ''}
                      {purchase.note ? purchase.note : ''}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      <BottomNav />
    </main>
  )
}

function getErrorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  return 'Something went wrong.'
}