"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  CreditCard,
  FileMinus2,
  FileBarChart,
  FileText,
  Gauge,
  PackageCheck,
  Package,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";

const navItems = [
  { label: "Dashboard", href: "/dashboard", icon: Gauge },
  { label: "Invoices", href: "/invoices", icon: FileText },
  { label: "Credit Notes", href: "/credit-notes", icon: FileMinus2 },
  { label: "Packing Lists", href: "/packing-lists", icon: PackageCheck },
  { label: "Payments", href: "/payments", icon: CreditCard },
  { label: "Buyers", href: "/buyers", icon: Users },
  { label: "Items", href: "/items", icon: Package },
  { label: "Companies", href: "/companies", icon: Building2 },
  { label: "Reports", href: "/reports", icon: FileBarChart },
  { label: "Users & Roles", href: "/dashboard", icon: ShieldCheck },
  { label: "Settings", href: "/settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">IM</span>
          <span>Invoice Management</span>
        </div>
        <nav className="nav" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.href !== "/dashboard"
              ? pathname === item.href || pathname.startsWith(`${item.href}/`)
              : pathname === item.href;

            return (
              <Link aria-current={active ? "page" : undefined} className={active ? "active" : undefined} href={item.href} key={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className="content">{children}</section>
    </main>
  );
}
