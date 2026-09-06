import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-inner">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden>
            <span className="pet-face tiny">
              <i className="eye" />
              <i className="eye" />
              <i className="mouth" />
            </span>
          </span>
          <span className="brand-text">CUBE</span>
        </Link>
        <nav className="footer-links" aria-label="Footer">
          <Link href="/about">What is this</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/vault">Vault</Link>
        </nav>
        <p className="footer-note">Sepolia demo · principal stays yours · keep the pet fed with deposits</p>
      </div>
    </footer>
  );
}
