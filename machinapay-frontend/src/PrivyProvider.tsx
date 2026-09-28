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
  const effectiveAppId = appId || "cm_machinapay_mst_testnet_demo";
  if (!appId && typeof window !== "undefined") {
    console.info(
      "[MachinaPay] VITE_PRIVY_APP_ID not configured in .env. Privy social/email logins will use demo fallback mode; BridgeKey and injected Web3 wallets remain fully active."
    );
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