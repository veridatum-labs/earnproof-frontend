"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { NetworkBadge } from "@/components/common/network-badge";
import { MobileNav } from "@/components/layout/mobile-nav";

const navItems = [
  { href: "/how-it-works", label: "Product" },
  { href: "/proofs", label: "Proofs" },
  { href: "/issuers", label: "Issuers" },
  { href: "/developers", label: "Developers" },
  { href: "/settings", label: "Settings" },
];

export function PublicNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    pathname === href ||
    (href === "/proofs" && pathname.startsWith("/proofs")) ||
    (href === "/settings" && pathname.startsWith("/settings"));

  return (
    <header className="relative border-b border-white/10 bg-slate-950">
      <div className="flex h-[60px] w-full max-w-[1440px] items-center gap-3 px-3 sm:h-[72px] sm:gap-5 sm:px-5">
        <Link className="flex min-w-0 flex-1 items-center gap-2.5 text-xl font-semibold text-white sm:max-w-[210px]" href="/">
          <Image
            alt="EarnProof"
            className="h-6 w-6"
            height={24}
            priority
            src="/logo.svg"
            width={24}
          />
          EarnProof
        </Link>

        <nav className="hidden flex-1 items-center gap-6 text-sm text-slate-300 md:flex">
          {navItems.map((item) => (
            <Link
              className={
                isActive(item.href)
                  ? "font-medium text-cyan-200"
                  : "transition-colors hover:text-white"
              }
              href={item.href}
              key={item.href}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <MobileNav isActive={isActive} items={navItems} />

        <div className="shrink-0">
          <NetworkBadge />
        </div>
      </div>
    </header>
  );
}
