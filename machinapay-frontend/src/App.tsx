import React, { useState, useEffect } from "react";
import { formatEther } from "ethers";
import { Sidebar, SentinelTab } from "./components/Sidebar";
import { TopNav } from "./components/TopNav";
import { OverviewView } from "./components/OverviewView";
import { WalletMapView } from "./components/WalletMapView";
import { TransactionLabView } from "./components/TransactionLabView";
import { SettlementTestingView } from "./components/SettlementTestingView";
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
import { getReadProvider, getEscrow, getLiveBalance } from "./lib/wallet";
import { cfg } from "./lib/config";
import { X, Sparkles } from "lucide-react";

export default function App() {
  const [currentTab, setCurrentTab] = useState<SentinelTab>("overview");
  const [signer, setSigner] = useState<any>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [clientBalance, setClientBalance] = useState<string>("0.0000");
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
      const total = Number(await escrow.jobCount());
      if (total === 0) {
        setJobs([]);
        return;
      }
      const offset = Math.max(0, total - 25);
      const ids: string[] = await escrow.getJobIds(offset, total - offset);
      const fetched = await Promise.all(
        ids
          .slice()
          .reverse()
          .map(async (jobId) => {
            const j = await escrow.getJob(jobId);
            return {
              jobId,
              state: Number(j.state),
              verdict: Number(j.verdict),
              reward: formatEther(j.reward),
              customer: j.customer,
            };
          })
      );
      setJobs(fetched);
      if (!selectedJob && fetched.length > 0) {
        setSelectedJob(fetched[0].jobId);
      }
    } catch (err: any) {
      console.warn("Could not load jobs in App:", err);
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

  useEffect(() => {
    loadJobs();
    const t = setInterval(loadJobs, 5000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    loadBalance();
    const t = setInterval(loadBalance, 5000);
    return () => clearInterval(t);
  }, [address]);

  // Derived metrics
  const activeJobsCount = jobs.filter((j) => j.state >= 1 && j.state <= 5).length;
  const paidJobsCount = jobs.filter((j) => j.state === 6).length;
  const totalLockedEth = jobs
    .filter((j) => j.state >= 1 && j.state <= 5)
    .reduce((sum, j) => sum + Number(j.reward || 0), 0)
    .toFixed(2);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#F5F6F8] text-[#111827] font-sans antialiased">
      {/* 1. Left Sidebar Navigation (SENTINEL Style) */}
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
          {/* TAB 1: OVERVIEW (SENTINEL Stat Tiles + 30d Trajectory + Machine Breakdown) */}
          {currentTab === "overview" && (
            <OverviewView
              jobs={jobs}
              tvl={totalLockedEth === "0.00" && jobs.length > 0 ? jobs[0].reward : totalLockedEth}
              activeJobsCount={activeJobsCount}
              paidJobsCount={paidJobsCount}
              clientBalance={clientBalance}
            />
          )}

          {/* TAB 2: WALLET MAP (SENTINEL Hospital Map with interactive nodes & ETH transfer) */}
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

          {/* TAB 3: TRANSACTION HISTORY (Paginated table + filters + drawer) */}
          {currentTab === "tx-history" && (
            <TransactionHistoryTable
              clientAddress={address}
              onSelectTx={(tx) => setSelectedTx(tx)}
            />
          )}

          {/* TAB 4: TRANSACTION LAB (SENTINEL Simulation Lab with transfer params & terminal log) */}
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

          {/* TAB 5: SETTLEMENT TESTING (SENTINEL Policy Testing with radar cards & trajectory) */}
          {currentTab === "settlement-testing" && (
            <SettlementTestingView />
          )}

          {/* TAB 6: ALERTS (Real client-side alerts feed) */}
          {currentTab === "alerts" && (
            <AlertsFeed
              onNavigateToTx={(txHash) => {
                setSelectedTx({
                  id: txHash,
                  txHash,
                  timestamp: "Recent",
                  timeMillis: Date.now(),
                  direction: "out",
                  counterparty: address || "0x5C024AF5878888a9F1d4E1aAfF6a928DEc812225",
                  amountEth: "1.00",
                  status: "confirmed",
                  gasUsed: "21,000 gas",
                  blockNumber: 1,
                });
              }}
              onNavigateToWallet={() => {
                setCurrentTab("wallet-map");
              }}
            />
          )}

          {/* TAB 7: ADDRESS BOOK (Entity registry with CRUD and JSON import/export) */}
          {currentTab === "address-book" && (
            <AddressBookPanel />
          )}

          {/* TAB 8: REPORTS (Full settlement report with stats summary & CSV export) */}
          {currentTab === "reports" && (
            <ReportsView
              jobs={jobs}
              tvl={totalLockedEth === "0.00" && jobs.length > 0 ? jobs[0].reward : totalLockedEth}
            />
          )}

          {/* TAB 9: ESCROW CONTRACTS */}
          {currentTab === "contracts" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <MachinePanel />
              <div className="bg-card border border-border rounded-lg shadow-sm p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-primary font-mono">
                    JobEscrow Specification
                  </h3>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-blue hover:bg-blue-600 text-white text-xs font-semibold font-mono shadow-xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Post Job</span>
                  </button>
                </div>

                <div className="text-xs text-secondary space-y-3 font-mono leading-relaxed">
                  <p>
                    Autonomous machines register in <span className="text-primary font-semibold">MachineRegistry.sol</span> with a mandatory staked collateral in native coin.
                  </p>
                  <p>
                    Hardware identities execute cryptographic proof generation on-board using ECDSA secp256k1 keys. The verifier validates the proof against on-chain escrow parameters before countersigning.
                  </p>
                  <div className="p-3 rounded-lg bg-page border border-border text-[11px] text-accent-green space-y-1">
                    <div>Machine ID: M-042</div>
                    <div>Hardware Architecture: Autonomous Ground Transport</div>
                    <div>Staked Deposit: 0.01 MST</div>
                    <div>EIP-712 Compatibility: MachinaPayProof v1.0</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 10: SETTINGS (Gas preferences, confirmation threshold, density, currency) */}
          {currentTab === "settings" && (
            <SettingsView />
          )}
        </main>
      </div>

      {/* Transaction Detail Drawer Modal */}
      {selectedTx && (
        <NodeInspectorModal
          txData={selectedTx}
          onClose={() => setSelectedTx(null)}
        />
      )}

      {/* Post Escrow Job Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-lg border border-border bg-card shadow-xl p-6 relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-secondary hover:text-primary hover:bg-page transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="mb-4">
              <h2 className="text-base font-bold text-primary tracking-tight">Deploy Escrow Job</h2>
              <p className="text-xs text-secondary">
                Lock native funds into JobEscrow to dispatch autonomous machine M-042.
              </p>
            </div>
            <CreateJobForm
              signer={signer}
              onCreated={(jobId) => {
                setShowCreateModal(false);
                setSelectedJob(jobId);
                loadJobs();
                setCurrentTab("overview");
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
