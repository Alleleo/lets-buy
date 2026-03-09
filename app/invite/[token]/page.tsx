"use client";

import { supabase } from "@/lib/supabase";
import { useMemo, useState } from "react";

type InviteMemberCardProps = {
  householdId: string;
};

type InviteRow = {
  id: string;
  token: string;
  expires_at: string;
  status: "pending" | "accepted" | "revoked" | "expired";
};

function getErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function InviteMemberCard({
  householdId,
}: InviteMemberCardProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [invite, setInvite] = useState<InviteRow | null>(null);

  const inviteLink = useMemo(() => {
    if (!invite?.token) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/invite/${invite.token}`;
  }, [invite]);

  async function handleGenerateInvite() {
    try {
      setIsGenerating(true);
      setErrorMessage("");
      setCopySuccess(false);

      const { data, error } = await supabase.rpc("create_household_invite", {
        p_household_id: householdId,
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("Invite was not created.");
      }

      setInvite(data as InviteRow);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to generate invite link."));
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleCopyInvite() {
    if (!inviteLink) return;

    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopySuccess(true);
      window.setTimeout(() => setCopySuccess(false), 1800);
    } catch {
      setErrorMessage("Could not copy the invite link. Please copy it manually.");
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            Invite your partner
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Generate a secure link so they can join your shared household.
          </p>
        </div>
      </div>

      <div className="mt-4">
        <button
          type="button"
          onClick={handleGenerateInvite}
          disabled={isGenerating}
          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isGenerating ? "Generating..." : "Generate invite link"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {invite && inviteLink ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Share this link
          </div>

          <div className="mt-2 break-all rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
            {inviteLink}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyInvite}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-100"
            >
              {copySuccess ? "Copied" : "Copy link"}
            </button>

            <span className="text-xs text-slate-500">
              Expires: {new Date(invite.expires_at).toLocaleString()}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}