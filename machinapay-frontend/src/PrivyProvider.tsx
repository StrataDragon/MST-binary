import { PrivyProvider } from "@privy-io/react-auth";
import { defineChain } from "viem";
import type { ReactNode } from "react";

const appId = (import.meta as any).env?.VITE_PRIVY_APP_ID;

const mstTestnet = defineChain({
  id: 91562037,
  name: "MST Testnet",
  nativeCurrency: {
    name: "MSTC",
    symbol: "MSTC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnetrpc.mstblockchain.com"],
    },
  },
});

export function MachinaPayPrivyProvider({
  children,
}: {
  children: ReactNode;
}) {
  if (!appId) {
    throw new Error("VITE_PRIVY_APP_ID is missing from .env");
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["google", "email"],

        supportedChains: [mstTestnet],
        defaultChain: mstTestnet,

        embeddedWallets: {
          ethereum: {
            createOnLogin: "all-users",
          },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}