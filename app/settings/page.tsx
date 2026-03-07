"use client";

import AppPageShell from "@/components/AppPageShell";
import { supabase } from "@/lib/supabase";
import { useEffect, useState } from "react";

type HouseholdRow = {
  id: string;
  name: string;
};

type MemberRow = {
  id: string;
  user_id: string;
  role: string;
};

export default function SettingsPage() {
  const [household, setHousehold] = useState<HouseholdRow | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  async function loadHousehold() {
    setLoading(true);

    const { data: memberships } = await supabase
      .from("household_members")
      .select("household_id, role")
      .limit(1);

    if (!memberships || memberships.length === 0) {
      setLoading(false);
      return;
    }

    const householdId = memberships[0].household_id;

    const { data: householdData } = await supabase
      .from("households")
      .select("id, name")
      .eq("id", householdId)
      .single();

    const { data: membersData } = await supabase
      .from("household_members")
      .select("id, user_id, role")
      .eq("household_id", householdId);

    setHousehold(householdData ?? null);
    setMembers(membersData ?? []);
    setLoading(false);
  }

  useEffect(() => {
    loadHousehold();
  }, []);

  async function createInvite() {
    if (!household) return;

    const { data, error } = await supabase.rpc(
      "create_household_invite",
      {
        p_household_id: household.id,
      }
    );

    if (error) {
      alert(error.message);
      return;
    }

    const link = `${window.location.origin}/invite/${data}`;
    setInviteLink(link);
  }

  async function copyInvite() {
    if (!inviteLink) return;

    await navigator.clipboard.writeText(inviteLink);
    alert("Invite link copied");
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading) {
    return (
      <AppPageShell title="Settings">
        <p className="text-sm text-slate-500">Loading settings...</p>
      </AppPageShell>
    );
  }

  return (
    <AppPageShell title="Settings">
      <div className="space-y-6">

        {/* Household */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Household
          </h2>

          {household ? (
            <div className="mt-3">
              <div className="text-sm text-slate-600">Name</div>
              <div className="text-lg font-semibold text-slate-900">
                {household.name}
              </div>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              No household found.
            </p>
          )}
        </section>

        {/* Members */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Members
          </h2>

          <div className="mt-3 space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
              >
                <div className="text-sm text-slate-700">
                  User ID
                </div>

                <div className="text-xs text-slate-500">
                  {m.role}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Invite */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Invite partner
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Send an invite link so your partner can join your
            household.
          </p>

          <div className="mt-4 flex gap-2">
            <button
              onClick={createInvite}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Generate invite link
            </button>
          </div>

          {inviteLink && (
            <div className="mt-3 space-y-2">
              <div className="rounded-xl bg-slate-50 p-2 text-xs text-slate-600 break-all">
                {inviteLink}
              </div>

              <button
                onClick={copyInvite}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                Copy link
              </button>
            </div>
          )}
        </section>

        {/* Account */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">
            Account
          </h2>

          <button
            onClick={signOut}
            className="mt-3 rounded-xl border border-red-200 px-4 py-2 text-sm text-red-600"
          >
            Sign out
          </button>
        </section>

      </div>
    </AppPageShell>
  );
}