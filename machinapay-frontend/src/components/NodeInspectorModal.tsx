import React, { useState } from "react";
import { X, Copy, Check, ShieldCheck, Key, Code, Cpu, ExternalLink, ArrowRight, Clock } from "lucide-react";
import { cfg } from "../lib/config";
import { addressBook } from "../lib/addressBook";
import { TxHistoryItem } from "./TransactionHistoryTable";

export interface NodeTelemetryData {
  id: string;
  title: string;
  stepNumber: number;
  stageName: string;
  status: "completed" | "active" | "pending" | "failed";
  iconType: string;
  description: string;
  contractAddress?: string;
  functionSelector?: string;
  caller?: string;
  eip712?: {
    domainName: string;
    verifyingContract: string;
    primaryType: string;
    structHash?: string;
    signerAddress?: string;
    signature?: string;
  };
  evidenceData?: {
    packageId: string;
    targetZone: string;
    targetCoords: { x: number; y: number };
    finalPosition?: { x: number; y: number };
    delivered?: boolean;
    distanceDelta?: number;
  };
  txHash?: string;
  gasUsed?: string;
  timestamp?: string;
  stateCode?: number;
}

interface NodeInspectorModalProps {
  nodeData?: NodeTelemetryData | null;
  txData?: TxHistoryItem | null;
  onClose: () => void;
}

export function NodeInspectorModal({ nodeData, txData, onClose }: NodeInspectorModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!nodeData && !txData) return null;

  function handleCopy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  }

  // Render Transaction Detail View
  if (txData) {
    const counterparty = addressBook.resolve(txData.counterparty);
    const explorerUrl = cfg.explorerUrl || "https://testnet.mstscan.com";

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in font-mono text-xs">
        <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-page">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Transaction Detail Receipt
              </span>
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  txData.status === "confirmed"
                    ? "pill-confirmed"
                    : txData.status === "failed"
                    ? "pill-failed"
                    : "pill-pending"
                }`}
              >
                {txData.status}
              </span>
            </div>
            <button onClick={onClose} className="p-1 text-secondary hover:text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Tx Hash */}
            <div>
              <span className="text-secondary text-[10px] uppercase block mb-1">Transaction Hash</span>
              <div className="flex items-center justify-between p-2 rounded bg-page border border-border">
                <span className="text-primary truncate mr-2 font-bold">{txData.txHash}</span>
                <button
                  onClick={() => handleCopy(txData.txHash, "txHash")}
                  className="text-secondary hover:text-primary"
                >
                  {copiedKey === "txHash" ? <Check className="w-3.5 h-3.5 text-accent-green" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* 2x2 Metric Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded border border-border bg-page">
                <span className="text-secondary text-[10px] uppercase block">Transfer Amount</span>
                <span className="text-sm font-bold text-primary">{txData.amountEth} ETH</span>
              </div>
              <div className="p-3 rounded border border-border bg-page">
                <span className="text-secondary text-[10px] uppercase block">Gas Consumed</span>
                <span className="text-sm font-bold text-primary">{txData.gasUsed}</span>
              </div>
              <div className="p-3 rounded border border-border bg-page">
                <span className="text-secondary text-[10px] uppercase block">Block Confirmations</span>
                <span className="text-sm font-bold text-accent-green">1 Confirmation (#{txData.blockNumber})</span>
              </div>
              <div className="p-3 rounded border border-border bg-page">
                <span className="text-secondary text-[10px] uppercase block">Transaction Nonce</span>
                <span className="text-sm font-bold text-primary">{txData.nonce ?? 0}</span>
              </div>
            </div>

            {/* Counterparty Entity */}
            <div className="p-3 rounded border border-border bg-page space-y-1">
              <div className="flex justify-between text-[10px] uppercase text-secondary">
                <span>Counterparty Entity</span>
                <span className="text-accent-blue font-bold">{counterparty.tag}</span>
              </div>
              <div className="text-xs font-bold text-primary">{counterparty.label}</div>
              <div className="text-[10px] text-muted truncate">{txData.counterparty}</div>
            </div>

            {/* Calldata / Function Decoding */}
            {txData.calldata && (
              <div>
                <span className="text-secondary text-[10px] uppercase block mb-1">Decoded Function Calldata</span>
                <div className="p-2.5 rounded bg-gray-900 text-green-400 text-[11px] font-mono overflow-x-auto">
                  {txData.calldata}
                </div>
              </div>
            )}

            {/* Job ID if linked */}
            {txData.jobId && (
              <div>
                <span className="text-secondary text-[10px] uppercase block mb-1">Linked Escrow Job ID</span>
                <div className="p-2 rounded bg-page border border-border text-primary text-[11px] truncate">
                  {txData.jobId}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-3 border-t border-border bg-page flex items-center justify-between">
            <a
              href={`${explorerUrl}/tx/${txData.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-accent-blue hover:underline flex items-center gap-1.5"
            >
              <span>View in Block Explorer</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-card border border-border hover:bg-gray-100 text-primary font-bold text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Node Telemetry View
  if (nodeData) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in font-mono text-xs">
        <div className="w-full max-w-xl rounded-lg border border-border bg-card shadow-2xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-page">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Node Telemetry: {nodeData.title}
              </span>
              <span className="pill-confirmed text-[9px] font-bold px-2 py-0.5 rounded-full uppercase">
                {nodeData.status}
              </span>
            </div>
            <button onClick={onClose} className="p-1 text-secondary hover:text-primary">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-xs text-secondary font-sans leading-relaxed">{nodeData.description}</p>
            {nodeData.contractAddress && (
              <div>
                <span className="text-secondary text-[10px] uppercase block mb-1">Contract Address</span>
                <div className="p-2 rounded bg-page border border-border text-primary font-bold">
                  {nodeData.contractAddress}
                </div>
              </div>
            )}
            {nodeData.functionSelector && (
              <div>
                <span className="text-secondary text-[10px] uppercase block mb-1">Function Selector</span>
                <div className="p-2 rounded bg-page border border-border text-accent-blue font-bold">
                  {nodeData.functionSelector}
                </div>
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t border-border bg-page flex justify-end">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded bg-card border border-border hover:bg-gray-100 text-primary font-bold text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
