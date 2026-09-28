import React, { useState, useEffect } from "react";
import { formatEther } from "ethers";
import { Sidebar, SentinelTab } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { OverviewView } from "./components/OverviewView";
import { WalletMapView } from "./components/WalletMapView";
import { TransactionLabView } from "./components/TransactionLabView";
import { SettlementAnalyticsView } from "./components/SettlementAnalyticsView";
import { AlertsFeed } from "./components/AlertsFeed";
import { ReportsView } from "./components/ReportsView";
import { TransactionHistoryTable, TxHistoryItem } from "./components/TransactionHistoryTable";
import { AddressBookPanel } from "./components/AddressBookPanel";
import { SettingsView } from "./components/SettingsView";
import { NodeInspectorModal } from "./components/NodeInspectorModal";
import { MachinePanel } from "./components/MachinePanel";
import { CreateJobForm } from "./components/CreateJobForm";
import { EventFeed } from "./components/EventFeed";
import { JobDetail } from "./components/JobDetail";
import { JobSummary } from "./components/JobList";
import { MarketplaceView } from "./components/MarketplaceView";
import { DynamicPricingDashboard } from "./components/DynamicPricingDashboard";
import { getReadProvider, getEscrow, getLiveBalance } from "./lib/wallet";
import { cfg, NATIVE_SYMBOL } from "./lib/config";
import { X, AlertTriangle, Copy, Check, ExternalLink } from "lucide-react";

export default function App() {
  const [currentTab, setCurrentTab] = useState<SentinelTab>("marketplace");
  const [signer, setSigner] = useState<any>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [clientBalance, setClientBalance] = useState<string>("0.0000");
  const [copiedAddress, setCopiedAddress] = useState<boolean>(false);
  const [selectedTx, setSelectedTx] = useState<TxHistoryItem | null>(null);

  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Load all jobs from chain
  async function loadJobs() {
    try {
      const provider = getReadProvider();
      const escrow = getEscrow(provider);
      const total = Number(await escrow.jobCount().catch(() => 0));
      if (total === 0) {
        setJobs([]);
        return;
      }
      const offset = Math.max(0, total - 25);
      const ids: string[] = await escrow.getJobIds(offset, total - offset).catch(() => []);
      const fetched = await Promise.all(
        ids
          .slice()
          .reverse()
          .map(async (jobId) => {
            const j = await escrow.getJob(jobId).catch(() => null);
            if (!j) return null;
            return {
              jobId,
              state: Number(j.state),
              verdict: Number(j.verdict),
              reward: formatEther(j.reward),
              customer: j.customer,
            };
          })
      );
      setJobs(fetched.filter(Boolean) as any);
      if (!selectedJob && fetched.length > 0 && fetched[0]) {
        setSelectedJob(fetched[0].jobId);
      }
    } catch (err: any) {
      console.warn("Could not load jobs in App:", err);
      setJobs([]);
    }
  }

  // Load wallet live balance
  async function loadBalance() {
    if (!address) return;
    try {
      const bal = await getLiveBalance(address);
      setClientBalance(bal);
    } catch (err) {
      console.warn("Could not load balance:", err);
    }
  }

  // Purely event-driven: Initial load + reactive event listeners (NO setInterval)
  useEffect(() => {
    loadJobs();
    loadBalance();

    try {
      const provider = getReadProvider();
      const escrow = getEscrow(provider);

      const handleEvent = () => {
        loadJobs();
        loadBalance();
      };

      escrow.on("JobCreated", handleEvent);
      escrow.on("JobFunded", handleEvent);
      escrow.on("JobAccepted", handleEvent);
      escrow.on("JobExecutionStarted", handleEvent);
      escrow.on("ProofSubmitted", handleEvent);
      escrow.on("VerificationSubmitted", handleEvent);
      escrow.on("JobVerified", handleEvent);
      escrow.on("PaymentReleased", handleEvent);
      escrow.on("JobRefunded", handleEvent);

      return () => {
        escrow.off("JobCreated", handleEvent);
        escrow.off("JobFunded", handleEvent);
        escrow.off("JobAccepted", handleEvent);
        escrow.off("JobExecutionStarted", handleEvent);
        escrow.off("ProofSubmitted", handleEvent);
        escrow.off("VerificationSubmitted", handleEvent);
        escrow.off("JobVerified", handleEvent);
        escrow.off("PaymentReleased", handleEvent);
        escrow.off("JobRefunded", handleEvent);
      };
    } catch (err) {
      console.warn("Could not register escrow event listeners in App:", err);
    }
  }, [address]);

  // Derived metrics
  const activeJobsCount = jobs.filter((j) => j.state >= 1 && j.state <= 5).length;
  const paidJobsCount = jobs.filter((j) => j.state === 6).length;
  const totalLocked = jobs
    .filter((j) => j.state >= 1 && j.state <= 5)
    .reduce((sum, j) => sum + Number(j.reward || 0), 0)
    .toFixed(2);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F6F8] text-[#111827] font-sans antialiased">
      {/* 1. Left Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        jobCount={jobs.length}
      />

      {/* 2. Main Content Viewport */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Navbar */}
        <TopNav
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onConnected={(addr, s) => {
            setAddress(addr);
            setSigner(s);
          }}
          clientAddress={address}
          onDisconnect={() => {
            setAddress(null);
            setSigner(null);
            setClientBalance("0.0000");
          }}
        />

        {/* Page Content Container */}
        <main className="flex-1 p-6 max-w-7xl w-full mx-auto space-y-6">
          {/* Zero Balance Alert Banner for Embedded & Connected Wallets */}
          {address && (Number(clientBalance) === 0 || clientBalance === "0.0000") && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 font-mono shadow-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                <span>
                  Connected wallet has <strong>0 {NATIVE_SYMBOL}</strong>. Fund it to post jobs or pay escrow fees:
                </span>
                <span className="font-semibold text-gray-900 bg-amber-500/20 px-2 py-0.5 rounded border border-amber-500/30">
                  {address.slice(0, 6)}...{address.slice(-4)}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(address);
                    setCopiedAddress(true);
                    setTimeout(() => setCopiedAddress(false), 1500);
                  }}
                  className="p-1 hover:text-black text-amber-600 transition cursor-pointer"
                  title="Copy address"
                >
                  {copiedAddress ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <a
                href="https://faucet.mstblockchain.com/"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black font-bold rounded shadow-xs transition shrink-0"
              >
                <span>Open MST Faucet</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* TAB: MARKETPLACE */}
          {currentTab === "marketplace" && (
            <MarketplaceView
              signer={signer}
              clientAddress={address}
              onOpenPricingDashboard={() => setCurrentTab("pricing")}
              onJobCreated={(jobId) => {
                setSelectedJob(jobId);
                loadJobs();
                loadBalance();
                setCurrentTab("wallet-map");
              }}
            />
          )}

          {/* TAB: DYNAMIC PRICING DASHBOARD */}
          {currentTab === "pricing" && (
            <DynamicPricingDashboard />
          )}

          {/* TAB: OVERVIEW */}
          {currentTab === "overview" && (
            <OverviewView
              jobs={jobs}
              tvl={totalLocked === "0.00" && jobs.length > 0 ? jobs[0].reward : totalLocked}
              activeJobsCount={activeJobsCount}
              paidJobsCount={paidJobsCount}
              clientBalance={clientBalance}
            />
          )}

          {/* TAB: WALLET MAP */}
          {currentTab === "wallet-map" && (
            <WalletMapView
              signer={signer}
              clientAddress={address}
              clientBalance={clientBalance}
              onRefreshBalances={() => {
                loadBalance();
                loadJobs();
              }}
            />
          )}

          {/* TAB: TRANSACTION HISTORY */}
          {currentTab === "tx-history" && (
            <TransactionHistoryTable
              clientAddress={address}
              onSelectTx={(tx) => setSelectedTx(tx)}
            />
          )}

          {/* TAB: TRANSACTION LAB */}
          {currentTab === "transaction-lab" && (
            <TransactionLabView
              signer={signer}
              clientAddress={address}
              selectedJobId={selectedJob}
              onRefresh={() => {
                loadBalance();
                loadJobs();
              }}
            />
          )}

          {/* TAB: SETTLEMENT ANALYTICS */}
          {(currentTab === "settlement-analytics" || currentTab === "settlement-testing") && (
            <SettlementAnalyticsView />
          )}

          {/* TAB: ALERTS */}
          {currentTab === "alerts" && (
            <AlertsFeed
              onNavigateToTx={() => {
                setCurrentTab("tx-history");
              }}
            />
          )}

          {/* TAB: REPORTS */}
          {currentTab === "reports" && (
            <ReportsView
              jobs={jobs}
              tvl={totalLocked}
            />
          )}

          {/* TAB: ADDRESS BOOK */}
          {currentTab === "address-book" && (
            <AddressBookPanel />
          )}

          {/* TAB: ESCROW CONTRACTS */}
          {currentTab === "contracts" && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-xs p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h2 className="text-base font-bold text-gray-900">Deployed Escrow Smart Contracts</h2>
                  <p className="text-xs text-gray-500">
                    Network: {cfg.network} (Chain ID {cfg.chainId})
                  </p>
                </div>
              </div>

              <div className="space-y-3 font-mono text-xs">
                <div className="p-4 rounded-lg bg-[#f6f7f9] border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-gray-900">JobEscrow Contract</div>
                    <div className="text-gray-500 text-[11px]">Primary autonomous commerce escrow vault</div>
                  </div>
                  <div className="px-2.5 py-1 rounded bg-white border border-gray-200 text-gray-800 text-xs">
                    {cfg.addresses.JobEscrow}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#f6f7f9] border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-gray-900">MachineRegistry Contract</div>
                    <div className="text-gray-500 text-[11px]">Registry of authorized autonomous robots & arms</div>
                  </div>
                  <div className="px-2.5 py-1 rounded bg-white border border-gray-200 text-gray-800 text-xs">
                    {cfg.addresses.MachineRegistry}
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-[#f6f7f9] border border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-bold text-gray-900">Trusted Verifier Address</div>
                    <div className="text-gray-500 text-[11px]">Sole authorized cryptographic verifier</div>
                  </div>
                  <div className="px-2.5 py-1 rounded bg-white border border-gray-200 text-gray-800 text-xs">
                    {cfg.verifier}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SETTINGS */}
          {currentTab === "settings" && (
            <SettingsView />
          )}
        </main>
      </div>

      {/* Selected Transaction Inspector Drawer */}
      {selectedTx && (
        <NodeInspectorModal
          txData={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}

      {/* Deploy Job Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="bg-white border border-gray-200 rounded-xl shadow-xl max-w-lg w-full p-6 relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-4">
              <h2 className="text-base font-bold text-gray-900 tracking-tight">Deploy Escrow Job</h2>
              <p className="text-xs text-gray-500">
                Lock native funds into JobEscrow to dispatch an autonomous machine.
              </p>
            </div>
            <CreateJobForm
              signer={signer}
              onCreated={(jobId) => {
                setShowCreateModal(false);
                setSelectedJob(jobId);
                loadJobs();
                loadBalance();
                setCurrentTab("overview");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
