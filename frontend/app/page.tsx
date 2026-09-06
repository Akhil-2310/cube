import Link from "next/link";
import { DeviceFrame } from "@/components/DeviceFrame";
import { PixelPet } from "@/components/PixelPet";

export default function Home() {
  return (
    <main>
      <section className="hero shell">
        <div>
          <p className="eyebrow">A handheld prize vault</p>
          <h1>
            Keep a pet.
            <br />
            Keep your prize private.
          </h1>
          <p className="lede">
            Cube is prize savings with a Tamagotchi twist: deposit together, earn yield, and let an encrypted draw
            pick a winner. Your balance stays hidden. Your principal stays yours.
          </p>
          <div className="hero-actions">
            <Link className="primary-button" href="/vault">
              Feed the vault
            </Link>
            <Link className="secondary-button" href="/about">
              What is this?
            </Link>
          </div>
        </div>
        <DeviceFrame title="HOME" status="HUNGRY">
          <PixelPet mood="idle" label="Tap vault to feed me" />
          <div className="stat-pips">
            <span>FOOD</span>
            <b>●●●○○</b>
            <span>LUCK</span>
            <b>●●○○○</b>
          </div>
        </DeviceFrame>
      </section>

      <section className="band shell">
        <p className="section-kicker">What is this</p>
        <h2>A no-loss lottery you can hug</h2>
        <p className="lede tight">
          Everyone deposits into one vault. Yield from that pool becomes the prize. Instead of interest, you get a
          chance to win — and nobody else can see how much you put in.
        </p>
        <div className="card-grid">
          <article className="pixel-card">
            <h3>Save</h3>
            <p>Deposit confidential test USDC. You can withdraw principal whenever the vault is open.</p>
          </article>
          <article className="pixel-card pink">
            <h3>Play</h3>
            <p>Time-weighted balances become lottery tickets. Longer deposits mean more chances.</p>
          </article>
          <article className="pixel-card mint">
            <h3>Win privately</h3>
            <p>Only you can decrypt whether you won. Everyone else sees a sealed result.</p>
          </article>
        </div>
        <Link className="text-link" href="/about">
          Read the full story →
        </Link>
      </section>

      <section className="band shell">
        <p className="section-kicker">Care cycle</p>
        <h2>Four buttons, one draw</h2>
        <ol className="step-list">
          <li>
            <strong>Mint &amp; shield</strong>
            <span>Turn public test USDC into confidential cUSDCMock.</span>
          </li>
          <li>
            <strong>Deposit</strong>
            <span>Feed the vault. The pet’s food bar is your encrypted principal.</span>
          </li>
          <li>
            <strong>Run FHE draw</strong>
            <span>Zama generates encrypted random tickets onchain after the draw closes.</span>
          </li>
          <li>
            <strong>Decrypt &amp; claim</strong>
            <span>Open your private result with EIP-712, then claim the sealed payout.</span>
          </li>
        </ol>
        <Link className="text-link" href="/how-it-works">
          See the public trail →
        </Link>
      </section>

      <section className="cta-band shell">
        <div className="pixel-card cta-card">
          <PixelPet mood="waiting" />
          <div>
            <h2>Ready to play?</h2>
            <p>Connect a Sepolia wallet, mint test assets, and keep the vault pet company.</p>
            <Link className="primary-button" href="/vault">
              Open vault
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
