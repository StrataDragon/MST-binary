import React, { createContext, useContext, ReactNode } from "react";
import {
  PrivyProvider,
  usePrivy as useRealPrivy,
  useLogin as useRealLogin,
  useWallets as useRealWallets,
} from "@privy-io/react-auth";
import { defineChain } from "viem";

export const mstTestnet = defineChain({
  id: 91562037,
  name: "MST Testnet",
  nativeCurrency: {
    name: "tMSTC",
    symbol: "tMSTC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://testnetrpc.mstblockchain.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "MSTScan",
      url: "https://testnet.mstscan.com",
    },
  },
});

export function isValidPrivyAppId(id?: string | null): boolean {
  if (!id) return false;
  const trimmed = id.trim();
  if (!trimmed || trimmed === "cl00000000000000000000000") return false;
  // Privy App IDs are strictly 25 characters (cuid format starting with 'c')
  return trimmed.length === 25 && /^c[a-z0-9]{24}$/i.test(trimmed);
}

export interface PrivyAdapterContextValue {
  isConfigured: boolean;
  ready: boolean;
  authenticated: boolean;
  user: any;
  wallets: any[];
  login: (options?: any) => void;
  logout: () => Promise<void>;
}

const defaultContextValue: PrivyAdapterContextValue = {
  isConfigured: false,
  ready: false,
  authenticated: false,
  user: null,
  wallets: [],
  login: () => {
    console.warn(
      "[MachinaPay] Privy login called, but VITE_PRIVY_APP_ID is not configured in .env."
    );
  },
  logout: async () => {},
};

export const MachinaPayPrivyContext = createContext<PrivyAdapterContextValue>(defaultContextValue);

function PrivyBridgeConsumer({ children }: { children: ReactNode }) {
  const { ready, authenticated, user, logout } = useRealPrivy();
  const { login } = useRealLogin();
  const { wallets } = useRealWallets();

  return (
    <MachinaPayPrivyContext.Provider
      value={{
        isConfigured: true,
        ready,
        authenticated,
        user,
        wallets,
        login,
        logout,
      }}
    >
      {children}
    </MachinaPayPrivyContext.Provider>
  );
}

export function MachinaPayPrivyProvider({
  children,
  appIdOverride,
  clientIdOverride,
}: {
  children: ReactNode;
  appIdOverride?: string | null;
  clientIdOverride?: string | null;
}) {
  const envAppId = (import.meta as any).env?.VITE_PRIVY_APP_ID;
  const envClientId = (import.meta as any).env?.VITE_PRIVY_CLIENT_ID;

  const rawAppId = appIdOverride !== undefined ? appIdOverride : envAppId;
  const rawClientId = clientIdOverride !== undefined ? clientIdOverride : envClientId;

  const isConfigured = isValidPrivyAppId(rawAppId);

  if (!isConfigured) {
    if (typeof window !== "undefined") {
      console.info(
        "[MachinaPay] VITE_PRIVY_APP_ID not configured or invalid in .env. BridgeKey and injected Web3 wallets are active."
      );
    }
    return (
      <MachinaPayPrivyContext.Provider value={defaultContextValue}>
        {children}
      </MachinaPayPrivyContext.Provider>
    );
  }

  const validAppId = rawAppId!.trim();
  const validClientId = rawClientId ? rawClientId.trim() : undefined;

  return (
    <PrivyProvider
      appId={validAppId}
      clientId={validClientId}
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
      <PrivyBridgeConsumer>{children}</PrivyBridgeConsumer>
    </PrivyProvider>
  );
}

/**
 * Safe hooks that never throw when PrivyProvider is not mounted.
 */
export function useSafePrivy() {
  const ctx = useContext(MachinaPayPrivyContext);
  return {
    isConfigured: ctx.isConfigured,
    ready: ctx.ready,
    authenticated: ctx.authenticated,
    user: ctx.user,
    logout: ctx.logout,
  };
}

export function useSafeLogin() {
  const ctx = useContext(MachinaPayPrivyContext);
  return {
    login: ctx.login,
  };
}

export function useSafeWallets() {
  const ctx = useContext(MachinaPayPrivyContext);
  return {
    wallets: ctx.wallets,
  };
}