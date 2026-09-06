"use client";

import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Eye, LockKeyhole, ShieldCheck } from "lucide-react";
import { DeviceFrame } from "@/components/DeviceFrame";
import { PixelPet, type PetMood } from "@/components/PixelPet";
import { useCube } from "@/hooks/useCube";

function AmountAction({
  label,
  onSubmit,
  disabled,
}: {
  label: string;
  onSubmit(amount: string): Promise<void> | void;
  disabled?: boolean;
}) {
  const [amount, setAmount] = useState("");
  return (
    <form
      className="amount-action"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(amount);
      }}
    >
      <div className="amount-field">
        <input
          inputMode="decimal"
          min="0"
          placeholder="0.00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          aria-label={`${label} amount`}
        />
        <span>cUSDCMock</span>
      </div>
      <button className="primary-button" disabled={disabled || !amount}>
        {label}
      </button>
    </form>
  );
}

export function PoolDashboard() {
  const pool = useCube();
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [tab, setTab] = useState<"deposit" | "withdraw">("deposit");
  const remaining = Math.max(0, (pool.draw?.closesAt ?? 0) - now);
  const depositsOpen = Boolean(pool.draw?.id);
  const canOpenDraw = pool.draw?.state === 0;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const countdown =
    pool.draw?.state === 1
      ? `${String(Math.floor(remaining / 3600)).padStart(2, "0")}:${String(Math.floor((remaining % 3600) / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`
      : "--:--:--";
  const closesAtLabel = pool.draw?.closesAt
    ? new Date(pool.draw.closesAt * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";
  const timeLeftLabel =
    pool.draw?.state !== 1
      ? "No active draw"
      : remaining === 0
        ? "Ready to close"
        : `${Math.floor(remaining / 60)}m ${remaining % 60}s left`;

  let mood: PetMood = "idle";
  if (pool.won === true) mood = "winner";
  else if (pool.pendingDraw?.state === 2) mood = "sleeping";
  else if (pool.draw?.state === 1) mood = "waiting";
  else if (pool.address) mood = "happy";

  return (
    <>
      <section className="page-hero shell vault-hero">
        <div>
          <p className="eyebrow">The vault</p>
          <h1>Feed, wait, decrypt.</h1>
          <p className="lede">
            Connect on Sepolia, mint test USDC, shield it, then deposit into the confidential prize vault. The handheld
            screen keeps the current draw and your encrypted prize pet in one place.
          </p>
          {pool.busy && <p className="busy">{pool.busy}</p>}
        </div>
        <DeviceFrame title={`DRAW #${pool.draw?.id.toString() ?? "--"}`} status={pool.drawLabel}>
          <PixelPet mood={mood} label={pool.won === true ? "You won!" : "Prize sealed"} />
          <div className="stat-pips">
            <span>CLOSE</span>
            <b>{countdown}</b>
            <span>STATE</span>
            <b>{pool.drawLabel}</b>
          </div>
        </DeviceFrame>
      </section>

      {!pool.configured && (
        <div className="config-banner shell">
          Add vault and strategy addresses to <code>frontend/.env.local</code> to enable transactions.
        </div>
      )}

      <section className="band shell">
        <div className="draw-tracker">
          <div className="draw-tracker-head">
            <div>
              <p className="section-kicker">Draw tracker</p>
              <h2>Current and recent draws</h2>
            </div>
            <small>One deposit draw stays open at a time. Closing it automatically opens the next.</small>
          </div>
          <div className="draw-card-grid">
            <article className="pixel-card draw-card active-draw">
              <span className="draw-status open">Open now</span>
              <strong>{pool.draw?.id ? `Draw #${pool.draw.id}` : "No draw open"}</strong>
              <b>{timeLeftLabel}</b>
              <small>Closes at {closesAtLabel}</small>
            </article>
            <article className="pixel-card draw-card">
              <span className="draw-status pending">Pending</span>
              <strong>{pool.pendingDraw ? `Draw #${pool.pendingDraw.id}` : "None"}</strong>
              <b>{pool.pendingDraw ? "Ready for settlement" : "No draw waiting"}</b>
              <small>{pool.pendingDraw ? `${pool.pendingDraw.processed} accounts processed` : "Up to date"}</small>
            </article>
            <article className="pixel-card draw-card">
              <span className="draw-status settled">Settled</span>
              <strong>{pool.latestSettledDrawId ? `Draw #${pool.latestSettledDrawId}` : "None yet"}</strong>
              <b>{pool.latestSettledDrawId ? "Result encrypted" : "Waiting for first result"}</b>
              <small>Decrypt your result below</small>
            </article>
          </div>
        </div>

        <div className="metric-row">
          <div className="pixel-card metric">
            <span>Confidential principal</span>
            <strong>{pool.principal}</strong>
            <small>cUSDCMock · only you</small>
          </div>
          <div className="pixel-card metric">
            <span>Encrypted TWAB</span>
            <strong>{pool.twab}</strong>
            <small>balance × seconds</small>
          </div>
          <div className="pixel-card metric">
            <span>Available confidential balance</span>
            <strong>{pool.privateBalance}</strong>
            <small>cUSDCMock in your connected wallet</small>
          </div>
          <button
            className="pixel-card metric decrypt-card"
            onClick={() => void pool.decryptPosition()}
            disabled={!pool.address || Boolean(pool.busy)}
          >
            <Eye size={18} />
            Decrypt my position
          </button>
        </div>

        <div className="vault-grid">
          <div className="pixel-card panel">
            <div className="tabs">
              <button className={tab === "deposit" ? "active" : ""} onClick={() => setTab("deposit")}>
                <ArrowDownToLine size={15} /> Deposit
              </button>
              <button className={tab === "withdraw" ? "active" : ""} onClick={() => setTab("withdraw")}>
                <ArrowUpFromLine size={15} /> Withdraw
              </button>
            </div>
            <div className="action-copy">
              <h3>{tab === "deposit" ? "Feed without showing the amount" : "Principal is always yours"}</h3>
              <p>
                {tab === "deposit"
                  ? depositsOpen
                    ? "The vault stays open while earlier draws use encrypted FHE tickets and settle."
                    : "Initialize the first draw before submitting an encrypted deposit."
                  : "Over-withdrawals resolve to an encrypted zero, so reverts never reveal your balance."}
              </p>
            </div>
            <AmountAction
              label={tab === "deposit" ? "Encrypt & deposit" : "Withdraw privately"}
              onSubmit={tab === "deposit" ? pool.deposit : pool.withdraw}
              disabled={
                !pool.address ||
                !pool.configured ||
                Boolean(pool.busy) ||
                (tab === "deposit" && (!pool.isOperator || !depositsOpen))
              }
            />
            {tab === "deposit" && canOpenDraw && pool.keeper && (
              <button
                className="operator-callout"
                onClick={() => void pool.keeper?.openDraw()}
                disabled={!pool.address || Boolean(pool.busy)}
              >
                Open a draw before depositing
              </button>
            )}
            {tab === "deposit" && !pool.isOperator && (
              <button
                className="operator-callout"
                onClick={() => void pool.authorize()}
                disabled={!pool.address || Boolean(pool.busy)}
              >
                <ShieldCheck size={16} /> Authorize the vault first
              </button>
            )}
            <p className="action-note">
              <LockKeyhole size={14} /> Deposits, balances, and transfer amounts stay encrypted onchain.
            </p>
          </div>

          <div className="pixel-card panel">
            <h3>Testnet onramp</h3>
            <div className="balance-line">
              <span>Public test USDC</span>
              <strong>{pool.publicBalance}</strong>
            </div>
            <button
              className="secondary-button"
              onClick={() => void pool.mintTestUsdc()}
              disabled={!pool.address || Boolean(pool.busy)}
            >
              1. Mint 1,000 test USDC
            </button>
            <AmountAction
              label="2. Shield as cUSDCMock"
              onSubmit={pool.shield}
              disabled={!pool.address || Boolean(pool.busy)}
            />
            <hr className="divider" />
            <p className="small-copy">
              Sponsor cUSDC funds the mock-yield reserve. It backs interest earned by depositors but does not become the
              prize until accrued yield is harvested.
            </p>
            <AmountAction
              label="Fund yield reserve"
              onSubmit={pool.fundYieldReserve}
              disabled={!pool.isOperator || Boolean(pool.busy)}
            />
            <button
              className="secondary-button"
              onClick={() => void pool.harvestYield()}
              disabled={!pool.address || pool.draw?.state !== 1 || remaining === 0 || Boolean(pool.busy)}
            >
              Harvest accrued yield now (optional)
            </button>
            <p className="action-note">
              Closing automatically harvests all remaining accrued yield. This optional button demonstrates an early
              harvest before the countdown ends.
            </p>
          </div>
        </div>

        <div className="result-strip">
          <div>
            <strong>
              Latest result{pool.latestSettledDrawId ? ` · Draw #${pool.latestSettledDrawId}` : ""}
            </strong>
            <small>Only your wallet can decrypt this value.</small>
          </div>
          <div className={`result-value ${pool.won === true ? "winner" : ""}`}>
            {pool.claimed
              ? "CLAIMED"
              : pool.won === null
                ? "ENCRYPTED"
                : pool.won
                  ? `WON ${pool.payout} cUSDCMock`
                  : "NOT SELECTED"}
          </div>
          <div className="result-actions">
            <button
              className="secondary-button"
              onClick={() => void pool.decryptResult()}
              disabled={pool.latestSettledDrawId === 0n || !pool.address || Boolean(pool.busy)}
            >
              Decrypt result
            </button>
            <button
              className="primary-button"
              onClick={() => void pool.claimPrize()}
              disabled={!pool.resultDecrypted || pool.claimed || !pool.address || Boolean(pool.busy)}
            >
              {pool.claimed ? "Claimed" : pool.won ? "Claim prize" : "Finalize claim"}
            </button>
          </div>
        </div>
      </section>

      {pool.keeper && (
        <section className="band shell">
          <div className="pixel-card admin">
            <p className="section-kicker">Keeper console</p>
            <div className="admin-actions">
              <button
                className="secondary-button"
                onClick={() => void pool.keeper?.openDraw()}
                disabled={!pool.address || Boolean(pool.busy) || pool.draw?.state !== 0}
              >
                Open draw
              </button>
              <button
                className="secondary-button"
                onClick={() => void pool.keeper?.closeDraw()}
                disabled={!pool.address || Boolean(pool.busy) || pool.draw?.state !== 1 || remaining > 0}
              >
                Harvest + close + FHE RNG
              </button>
              <button
                className="secondary-button"
                onClick={() => void pool.keeper?.settle()}
                disabled={!pool.address || Boolean(pool.busy) || pool.pendingDraw?.state !== 2}
              >
                {pool.pendingDraw ? `Settle draw #${pool.pendingDraw.id}` : "Settle next batch"}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
