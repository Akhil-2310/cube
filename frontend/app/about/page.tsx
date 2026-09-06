import Link from "next/link";
import { DeviceFrame } from "@/components/DeviceFrame";
import { PixelPet } from "@/components/PixelPet";

export default function AboutPage() {
  return (
    <main>
      <section className="page-hero shell">
        <div>
          <p className="eyebrow">What is this</p>
          <h1>Prize savings, not a casino chip.</h1>
          <p className="lede">
            Cube follows PoolTogether’s idea: deposit money, let it earn yield, raffle that yield to one or more
            depositors, then let everyone take their principal back. The twist is confidentiality — balances, odds, and
            payouts stay encrypted onchain.
          </p>
        </div>
        <DeviceFrame title="ABOUT" status="INFO">
          <PixelPet mood="happy" label="Principal stays yours" />
        </DeviceFrame>
      </section>

      <section className="band shell">
        <div className="card-grid two">
          <article className="pixel-card">
            <h3>No-loss by design</h3>
            <p>
              You are not betting your deposit. Yield from pooled principal becomes the prize. If you are not selected,
              you still withdraw what you put in (minus nothing but gas).
            </p>
          </article>
          <article className="pixel-card mint">
            <h3>Encrypted tickets</h3>
            <p>
              Time-weighted average balances (TWAB) pick winners. Those values live as ciphertexts, so other players
              cannot size your position from the chain.
            </p>
          </article>
          <article className="pixel-card pink">
            <h3>Public rules</h3>
            <p>
              Draw timing, participant addresses, and FHE operations stay visible so keepers can run the protocol
              without seeing balances, random tickets, or payouts.
            </p>
          </article>
          <article className="pixel-card">
            <h3>Testnet toy</h3>
            <p>
              This is an unaudited Sepolia demonstration. The yield strategy uses a funded reserve at a fixed testnet
              rate — a stand-in for a production lending adapter.
            </p>
          </article>
        </div>
        <div className="hero-actions">
          <Link className="primary-button" href="/vault">
            Go to vault
          </Link>
          <Link className="secondary-button" href="/privacy">
            Privacy map
          </Link>
        </div>
      </section>
    </main>
  );
}
