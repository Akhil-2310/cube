export default function PrivacyPage() {
  const rows = [
    ["Draw schedule", "Deposit amount"],
    ["Draw-close transaction", "FHE random tickets"],
    ["Settlement progress", "Time-weighted balance"],
    ["Contract rules", "Winning status & payout"],
  ];

  return (
    <main>
      <section className="page-hero shell">
        <div>
          <p className="eyebrow">Privacy</p>
          <h1>Transparent rules. Private finances.</h1>
          <p className="lede">
            Addresses and transaction timing remain public so anyone can keep the vault running. Financial values stay
            encrypted and only decrypt for the wallet that owns them.
          </p>
        </div>
      </section>

      <section className="band shell">
        <div className="privacy-table">
          <div className="privacy-head">
            <span>Publicly verifiable</span>
            <span>Kept private</span>
          </div>
          {rows.map(([visible, hidden]) => (
            <div className="privacy-row" key={visible}>
              <span>{visible}</span>
              <span>{hidden}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
