"use client";

import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type InvitePageProps = {
  params: {
    token: string;
  };
};

function getErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function InviteAcceptPage({ params }: InvitePageProps) {
  const router = useRouter();
  const token = useMemo(() => params.token, [params.token]);

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function checkAuth() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (!mounted) return;

      if (error) {
        setErrorMessage(error.message);
        setIsLoggedIn(false);
        setIsCheckingAuth(false);
        return;
      }

      setIsLoggedIn(!!user);
      setIsCheckingAuth(false);
    }

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleAcceptInvite() {
    try {
      setIsAccepting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const { data, error } = await supabase.rpc("accept_household_invite", {
        p_token: token,
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("Invite was accepted, but no household was returned.");
      }

      setSuccessMessage("Invite accepted. Redirecting to your household...");
      window.setTimeout(() => {
        router.push("/");
        router.refresh();
      }, 1200);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to accept invite."));
    } finally {
      setIsAccepting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-6">
            <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
              LETS BUY
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              Household Invite
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use this invite to join a shared shopping household.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Invite token
            </div>
            <div className="mt-2 break-all text-sm text-slate-800">{token}</div>
          </div>

          {isCheckingAuth ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
              Checking your login...
            </div>
          ) : null}

          {!isCheckingAuth && !isLoggedIn ? (
            <div className="mt-6 space-y-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                You need to log in first before joining this household.
              </div>

              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Go to login
              </Link>
            </div>
          ) : null}

          {!isCheckingAuth && isLoggedIn ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleAcceptInvite}
                disabled={isAccepting}
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAccepting ? "Joining household..." : "Join household"}
              </button>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          {successMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-700">
              {successMessage}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}