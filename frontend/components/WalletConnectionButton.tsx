"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

export function WalletConnectionButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, mounted, openAccountModal, openChainModal, openConnectModal }) => {
        const connected = mounted && account && chain;
        if (!connected) {
          return (
            <button className="wallet-button" onClick={openConnectModal} disabled={!mounted}>
              Connect
            </button>
          );
        }
        if (chain.unsupported) {
          return (
            <button className="wallet-button wrong-network" onClick={openChainModal}>
              Switch net
            </button>
          );
        }
        return (
          <button className="wallet-button" onClick={openAccountModal}>
            <span className="network-dot" />
            {account.displayName}
          </button>
        );
      }}
    </ConnectButton.Custom>
  );
}
