"use client";

import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { use, useEffect, useRef, useState } from "react";

type InvitePageProps = {
  params: Promise<{
    token: string;
  }>;
};

type AuthMode = "login" | "signup";

function getErrorMessage(error: unknown, fallback = "Something went wrong.") {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: string }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function InviteAcceptPage({ params }: InvitePageProps) {
  const router = useRouter();
  const { token } = use(params);

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const [isAccepting, setIsAccepting] = useState(false);
  const [hasAccepted, setHasAccepted] = useState(false);

  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authLoading, setAuthLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const acceptStartedRef = useRef(false);

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

    void checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
      setIsCheckingAuth(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (!token) return;
    if (hasAccepted) return;
    if (acceptStartedRef.current) return;

    acceptStartedRef.current = true;
    void handleAcceptInvite();
  }, [isLoggedIn, token, hasAccepted]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setAuthLoading(true);
      setErrorMessage("");
      setSuccessMessage("");

      const trimmedEmail = email.trim();

      if (!trimmedEmail || !password.trim()) {
        throw new Error("Please enter your email and password.");
      }

      if (authMode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });

        if (error) throw error;

        setSuccessMessage("Logged in. Joining household...");
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });

        if (error) throw error;

        if (data.session?.user) {
          setSuccessMessage("Account created. Joining household...");
        } else {
          setSuccessMessage(
            "Account created. Please verify your email if required, then log in to join the household."
          );
          setAuthMode("login");
        }
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, "Failed to continue."));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAcceptInvite() {
    try {
      setIsAccepting(true);
      setErrorMessage("");
      setSuccessMessage("");

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) throw userError;
      if (!user) {
        throw new Error("You need to log in before joining this household.");
      }

      if (!token) {
        throw new Error("Invite token is missing.");
      }

      const { data, error } = await supabase.rpc("accept_household_invite", {
        p_token: token,
      });

      if (error) {
        throw error;
      }

      if (!data) {
        throw new Error("Invite was accepted, but no household was returned.");
      }

      setHasAccepted(true);
      setSuccessMessage("Invite accepted. Redirecting to your shared list...");

      window.setTimeout(() => {
        router.push("/shopping");
        router.refresh();
      }, 1200);
    } catch (error) {
      acceptStartedRef.current = false;
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
              Join a shared shopping household using this invite.
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
            <div className="mt-6">
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
                Log in or create an account here to join the shared household without losing the invite.
              </div>

              <div className="mt-4 flex rounded-2xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("login");
                    setErrorMessage("");
                    setSuccessMessage("");
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    authMode === "login"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  Login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setErrorMessage("");
                    setSuccessMessage("");
                  }}
                  className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    authMode === "signup"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600"
                  }`}
                >
                  Sign up
                </button>
              </div>

              <form onSubmit={handleAuthSubmit} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-900"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl border border-slate-300 px-4 py-3 text-slate-900 placeholder-slate-400 outline-none transition focus:border-slate-900"
                    placeholder="••••••••"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={authLoading}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authLoading
                    ? authMode === "login"
                      ? "Logging in..."
                      : "Creating account..."
                    : authMode === "login"
                      ? "Login and join household"
                      : "Create account and join household"}
                </button>
              </form>
            </div>
          ) : null}

          {!isCheckingAuth && isLoggedIn ? (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleAcceptInvite}
                disabled={isAccepting || hasAccepted}
                className="inline-flex w-full items-center justify-center rounded-xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isAccepting
                  ? "Joining household..."
                  : hasAccepted
                    ? "Invite accepted"
                    : "Join household"}
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