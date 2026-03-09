"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/shopping", label: "Shopping", icon: "🛒" },
  { href: "/purchases", label: "Purchases", icon: "🧾" },
  { href: "/assistant", label: "Assistant", icon: "💬" },
  { href: "/insights", label: "Insights", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50">
      <div className="mx-auto w-full max-w-3xl px-3 pb-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <nav className="pointer-events-auto rounded-3xl border border-slate-200/80 bg-white/95 p-2 shadow-[0_10px_30px_rgba(15,23,42,0.10)] backdrop-blur-xl">
          <div className="grid grid-cols-5 gap-1">
            {tabs.map((tab) => {
              const active =
                pathname === tab.href || pathname.startsWith(`${tab.href}/`);

              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "flex min-w-0 flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-[11px] font-medium transition-all duration-200 sm:px-2 sm:text-xs",
                    active
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "text-base leading-none transition-transform duration-200",
                      active ? "scale-105" : "",
                    ].join(" ")}
                  >
                    {tab.icon}
                  </span>
                  <span className="truncate">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}