"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/shopping", label: "Shopping", icon: "🛒" },
  { href: "/purchases", label: "Purchases", icon: "🧾" },
  { href: "/insights", label: "Insights", icon: "📊" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto grid max-w-3xl grid-cols-4">
        {tabs.map((tab) => {
          const active = pathname === tab.href;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center justify-center gap-1 px-2 py-3 text-xs font-medium transition ${
                active
                  ? "text-slate-900"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}