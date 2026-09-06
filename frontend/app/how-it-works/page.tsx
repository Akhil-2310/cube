"use client";

import { useCube } from "@/hooks/useCube";

const steps = [
  {
    n: "01",
    title: "Encrypted TWAB",
    copy: "Your time-weighted balance updates with confidential math. Nobody else reads the ticket size.",
  },
  {
    n: "02",
    title: "Encrypted FHE random",
    copy: "After the draw freezes, Zama creates unpredictable encrypted random values in the close transaction.",
  },
  {
    n: "03",
    title: "Encrypted ticket",
    copy: "Each random value maps into encrypted total TWAB without exposing the ticket or winning interval.",
  },
  {
    n: "04",
    title: "Decrypt & claim",
    copy: "Each candidate decrypts a private zero-or-prize result, then claims through a confidential transfer.",
  },
];

export default function HowItWorksPage() {
  const pool = useCube();

  return (
    <main>
      <section className="page-hero shell">
        <div>
          <p className="eyebrow">How it works</p>
          <h1>Fairness has a public trail.</h1>
          <p className="lede">
            The protocol can be operated and audited without decrypting anyone’s position. Addresses and timing are
            public. Money stays private.
          </p>
        </div>
      </section>

      <section className="band shell">
        <ol className="flow-grid">
          {steps.map((step) => (
            <li className="pixel-card" key={step.n}>
              <span className="step-num">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
            </li>
          ))}
        </ol>
        <div className="public-proof">
          <div>
            <span>Participants</span>
            <strong>{pool.draw?.participants ?? 0}</strong>
          </div>
          <div>
            <span>Settled intervals</span>
            <strong>{pool.pendingDraw?.processed ?? 0}</strong>
          </div>
          <div>
            <span>FHE draw</span>
            <strong>{pool.pendingDraw ? `Draw #${pool.pendingDraw.id} sealed` : "No pending draw"}</strong>
          </div>
          <div>
            <span>Network</span>
            <strong>{pool.chainId === 11155111n ? "Ethereum Sepolia" : "Connect Sepolia"}</strong>
          </div>
        </div>
      </section>
    </main>
  );
}
