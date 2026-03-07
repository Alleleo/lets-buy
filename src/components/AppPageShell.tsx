"use client";

import BottomNav from "@/components/BottomNav";
import type { ReactNode } from "react";

type AppPageShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export default function AppPageShell({
  title,
  subtitle,
  children,
}: AppPageShellProps) {
  return (
    <main className="min-h-screen bg-slate-50 pb-24">
      <div className="mx-auto max-w-3xl px-4 py-6">
        <header className="mb-6">
          <div className="text-sm font-medium uppercase tracking-wide text-slate-500">
            LETS BUY
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
          {subtitle ? (
            <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
          ) : null}
        </header>

        {children}
      </div>

      <BottomNav />
    </main>
  );
}