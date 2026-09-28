import React, { useState } from "react";
import { Globe, ChevronDown, Check, AlertTriangle, X } from "lucide-react";
import { cfg } from "../lib/config";

interface NetworkOption {
  chainId: number;
  hexChainId: string;
  name: string;
  rpcUrl: string;
  nativeToken: string;
  explorerUrl?: string;
  isCurrentAppTarget: boolean;
}

const SUPPORTED_NETWORKS: NetworkOption[] = [
  {
    chainId: cfg.chainId,
    hexChainId: "0x" + cfg.chainId.toString(16),
    name: `${cfg.network} (Active Deployment)`,
    rpcUrl: cfg.rpcUrl,
    nativeToken: cfg.nativeToken,
    explorerUrl: cfg.explorerUrl || undefined,
    isCurrentAppTarget: true,
  },
  {
    chainId: 31337,
    hexChainId: "0x7a69",
    name: "Hardhat Localnet (Port 8545)",
    rpcUrl: "http://127.0.0.1:8545",
    nativeToken: "ETH",
    isCurrentAppTarget: cfg.chainId === 31337,
  },
  {
    chainId: 11155111,
    hexChainId: "0xaa36a7",
    name: "Ethereum Sepolia Testnet",
    rpcUrl: "https://rpc.sepolia.org",
    nativeToken: "ETH",
    explorerUrl: "https://sepolia.etherscan.io",
    isCurrentAppTarget: cfg.chainId === 11155111,
  },
];

export function NetworkBadge() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentChainId, setCurrentChainId] = useState<number>(cfg.chainId);
  const [isSwitching, setIsSwitching] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSwitchNetwork(target: NetworkOption) {
    const eth = (window as any).ethereum;
    if (!eth) {
      setErrorMsg("No Web3 wallet detected.");
      return;
    }

    setIsSwitching(true);
    setErrorMsg(null);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: target.hexChainId }],
      });
      setCurrentChainId(target.chainId);
      setIsOpen(false);
    } catch (switchErr: any) {
      if (switchErr?.code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: target.hexChainId,
                chainName: target.name,
                rpcUrls: [target.rpcUrl],
                nativeCurrency: { name: target.nativeToken, symbol: target.nativeToken, decimals: 18 },
                blockExplorerUrls: target.explorerUrl ? [target.explorerUrl] : [],
              },
            ],
          });
          setCurrentChainId(target.chainId);
          setIsOpen(false);
        } catch (addErr: any) {
          setErrorMsg(addErr?.message || "Failed to add chain");
        }
      } else {
        setErrorMsg(switchErr?.message || "Failed to switch chain");
      }
    } finally {
      setIsSwitching(false);
    }
  }

  const isMismatched = currentChainId !== cfg.chainId;

  return (
    <div className="relative">
      {/* Badge Button in TopNav */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-mono font-medium transition-all shadow-xs ${
          isMismatched
            ? "bg-amber-50 text-accent-amber border-amber-300 animate-pulse"
            : "bg-page text-primary border-border hover:border-accent-blue"
        }`}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            isMismatched ? "bg-accent-amber" : "bg-accent-green animate-pulse"
          }`}
        />
        <span>{cfg.network}</span>
        <ChevronDown className="w-3.5 h-3.5 text-secondary" />
      </button>

      {/* Switcher Modal / Dropdown */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-card border border-border rounded-lg shadow-xl z-50 p-3 space-y-2 animate-fade-in font-mono text-xs">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <span className="font-bold text-primary uppercase text-[10px] tracking-wider">
              Select Blockchain Network
            </span>
            <button
              onClick={() => setIsOpen(false)}
              className="text-secondary hover:text-primary p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-1">
            {SUPPORTED_NETWORKS.map((net) => {
              const isSelected = net.chainId === currentChainId;
              return (
                <button
                  key={net.chainId}
                  disabled={isSwitching}
                  onClick={() => handleSwitchNetwork(net)}
                  className={`w-full text-left p-2 rounded flex items-center justify-between transition-colors ${
                    isSelected
                      ? "bg-page border border-border text-primary font-bold"
                      : "hover:bg-page text-secondary"
                  }`}
                >
                  <div>
                    <div className="text-xs text-primary">{net.name}</div>
                    <div className="text-[10px] text-muted">Chain ID: {net.chainId}</div>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-accent-green" />}
                </button>
              );
            })}
          </div>

          {errorMsg && (
            <div className="p-2 rounded bg-red-50 border border-red-200 text-[10px] text-accent-red">
              {errorMsg}
            </div>
          )}

          <div className="pt-2 border-t border-border text-[10px] text-muted leading-tight">
            Target contracts deployed on Chain ID {cfg.chainId}.
          </div>
        </div>
      )}
    </div>
  );
}
