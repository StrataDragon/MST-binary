import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import { getReadProvider, getEscrow } from "../lib/wallet";

interface FeedItem { key: string; text: string; }

export function EventFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);

  useEffect(() => {
    const provider = getReadProvider();
    const escrow = getEscrow(provider);

    // Backfill a little history so the feed isn't empty on first load.
    (async () => {
      const latest = await provider.getBlockNumber();
      const logs = await escrow.queryFilter("*", Math.max(0, latest - 3000), latest);
      const parsed = logs.slice(-15).map(describeLog).reverse();
      setItems(parsed);
    })().catch(() => {});

    const names = [
      "JobCreated", "JobAccepted", "JobExecutionStarted", "ProofSubmitted",
      "VerificationSubmitted", "JobVerified", "PaymentReleased", "JobRefunded",
    ];
    const handlers: Array<() => void> = [];
    for (const name of names) {
      const handler = (...args: any[]) => {
        const evt = args[args.length - 1];
        setItems((prev) => [describeLog(evt), ...prev].slice(0, 30));
      };
      escrow.on(name, handler);
      handlers.push(() => escrow.off(name, handler));
    }
    return () => handlers.forEach((off) => off());
  }, []);

  function describeLog(log: any): FeedItem {
    const name = log.fragment?.name ?? log.eventName ?? "Event";
    const a = log.args ?? [];
    let text = name;
    try {
      if (name === "JobCreated") text = `Job ${short(a[0])} created — ${formatEther(a[2])} locked`;
      else if (name === "JobAccepted") text = `Job ${short(a[0])} accepted by machine`;
      else if (name === "JobExecutionStarted") text = `Job ${short(a[0])} execution started`;
      else if (name === "ProofSubmitted") text = `Job ${short(a[0])} proof submitted (result=${a[4]})`;
      else if (name === "VerificationSubmitted") text = `Job ${short(a[0])} verified — passed=${a[3]}`;
      else if (name === "JobVerified") text = `Job ${short(a[0])} verdict: PASS`;
      else if (name === "PaymentReleased") text = `Job ${short(a[0])} paid — ${formatEther(a[3])} to machine`;
      else if (name === "JobRefunded") text = `Job ${short(a[0])} refunded — ${formatEther(a[2])} to customer`;
    } catch {
      /* fall back to raw name */
    }
    return { key: `${log.transactionHash}-${log.index ?? log.data ?? Date.now()}`, text };
  }

  function short(id: string) {
    return id ? `${id.slice(0, 10)}…` : "?";
  }

  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-dim">Live chain feed</h2>
      <div className="max-h-72 space-y-1 overflow-y-auto font-mono text-xs">
        {items.map((i) => (
          <div key={i.key} className="text-dim">
            <span className="text-signal">›</span> {i.text}
          </div>
        ))}
        {items.length === 0 && <p className="text-dim">No events yet.</p>}
      </div>
    </div>
  );
}
