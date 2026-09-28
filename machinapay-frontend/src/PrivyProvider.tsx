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
  const effectiveAppId =
    appId && /^c[a-z0-9]{20,35}$/i.test(appId)
      ? appId
      : "cl00000000000000000000000";

  if (!appId && typeof window !== "undefined") {
    console.info(
      "[MachinaPay] VITE_PRIVY_APP_ID not configured in .env. BridgeKey and injected Web3 wallets are active."
    );
  }

  return (
    <PrivyProvider
      appId={effectiveAppId}
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