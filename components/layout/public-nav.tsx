"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NetworkBadge } from "@/components/common/network-badge";

const navItems = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/privacy", label: "Privacy" },
  { href: "/developers", label: "Developers" },
  { href: "/verify", label: "Verify" },
  { href: "/issuers", label: "Issuers" },
  { href: "/status", label: "Status" },
];

export function PublicNav() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link className="flex items-center gap-3 text-lg font-semibold text-white" href="/">
          <Image
            alt="EarnProof"
            className="h-8 w-8"
            height={32}
            priority
            src="/logo.svg"
            width={32}
          />
          EarnProof
        </Link>

        <nav className="hidden items-center gap-6 text-sm text-slate-300 lg:flex">
          {navItems.map((item) => (
            <Link
              className={
                pathname === item.href
                  ? "font-medium text-cyan-200"
                  : "hover:text-white"
              }
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <NetworkBadge />
        </div>

        <button
          aria-expanded={isOpen}
          aria-label="Toggle navigation"
          className="rounded-md border border-white/15 px-3 py-2 text-sm text-white lg:hidden"
          onClick={() => setIsOpen((value) => !value)}
          type="button"
        >
          Menu
        </button>
      </div>

      {isOpen ? (
        <div className="border-t border-white/10 px-6 py-4 lg:hidden">
          <nav className="mx-auto grid max-w-6xl gap-3 text-sm text-slate-200">
            {navItems.map((item) => (
              <Link
                className={
                  pathname === item.href
                    ? "font-medium text-cyan-200"
                    : "hover:text-white"
                }
                href={item.href}
                key={item.href}
                onClick={() => setIsOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-2">
              <NetworkBadge />
            </div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
