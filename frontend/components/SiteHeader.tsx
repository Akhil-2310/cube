"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnectionButton } from "@/components/WalletConnectionButton";

const links = [
  { href: "/", label: "Home" },
  { href: "/about", label: "What is this" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/privacy", label: "Privacy" },
  { href: "/vault", label: "Vault" },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="site-header">
      <div className="shell header-inner">
        <Link className="brand" href="/" aria-label="Cube home">
          <span className="brand-mark" aria-hidden>
            <span className="pet-face tiny">
              <i className="eye" />
              <i className="eye" />
              <i className="mouth" />
            </span>
          </span>
          <span className="brand-text">CUBE</span>
        </Link>
        <nav className="nav-center" aria-label="Primary">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={pathname === link.href ? "active" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <WalletConnectionButton />
      </div>
    </header>
  );
}
