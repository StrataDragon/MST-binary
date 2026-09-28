import { Signer } from "ethers";
import { sendEth } from "./wallet";
import { eventBus } from "./events";

export interface BatchItem {
  id: string;
  recipient: string;
  amount: string;
  status: "idle" | "pending" | "confirmed" | "failed";
  txHash?: string;
  error?: string;
  gasCostWei?: bigint;
}

export interface BatchExecutionState {
  items: BatchItem[];
  totalSentCount: number;
  totalFailedCount: number;
  totalQueuedEth: string;
  runningGasCostWei: bigint;
  isRunning: boolean;
  isCancelled: boolean;
}

export interface BatchCallbacks {
  onRowUpdate?: (index: number, item: BatchItem) => void;
  onLog?: (message: string) => void;
  onSummaryUpdate?: (state: BatchExecutionState) => void;
}

/**
 * Executes a list of transfers sequentially with manual local nonce tracking.
 * - Nonce is initialized from provider via getNonce("pending") before the batch starts.
 * - Nonce increments ONLY when a transaction broadcasts successfully.
 * - If an RPC error occurs during sendTransaction before broadcast, the nonce is NOT incremented,
 *   guaranteeing that subsequent rows will submit with the correct sequential nonce without desync.
 * - Supports graceful mid-run cancellation.
 */
export async function executeBatchTransfers(
  signer: Signer,
  clientAddress: string,
  items: BatchItem[],
  callbacks: BatchCallbacks = {},
  isCancelledCheck?: () => boolean
): Promise<BatchExecutionState> {
  let runningGasCostWei = 0n;
  let totalSentCount = 0;
  let totalFailedCount = 0;

  // Initialize nonce manually from network pending count
  let currentNonce = await signer.getNonce("pending");

  callbacks.onLog?.(
    `[BATCH_INIT] Starting sequential batch of ${items.length} transfers. Initial pending nonce: ${currentNonce}`
  );

  for (let i = 0; i < items.length; i++) {
    // Check if cancellation was triggered
    if (isCancelledCheck && isCancelledCheck()) {
      callbacks.onLog?.(`[BATCH_CANCELLED] Batch cancelled by user at row ${i + 1}. Remaining items skipped.`);
      break;
    }

    const item = items[i];
    const time = new Date().toLocaleTimeString();

    // 1. Mark pending
    item.status = "pending";
    callbacks.onRowUpdate?.(i, item);
    callbacks.onLog?.(
      `[${time}] [ROW_${i + 1}/${items.length}] Dispatching ${item.amount} ETH to ${item.recipient.slice(0, 10)}… (Nonce: ${currentNonce})`
    );

    try {
      // Send with explicit manual nonce
      const tx = await sendEth(signer, item.recipient.trim(), item.amount.trim(), {
        nonce: currentNonce,
      });

      // Broadcast succeeded -> increment manual nonce for subsequent tx
      currentNonce++;
      item.txHash = tx.hash;

      // Await confirmation receipt
      const receipt = await tx.wait();
      item.status = "confirmed";

      const gasCost = receipt ? receipt.gasUsed * (receipt.gasPrice || 0n) : 0n;
      item.gasCostWei = gasCost;
      runningGasCostWei += gasCost;
      totalSentCount++;

      callbacks.onRowUpdate?.(i, item);
      callbacks.onLog?.(
        `[${time}] [ROW_${i + 1}_CONFIRMED] Tx: ${tx.hash.slice(0, 12)}… Block: #${receipt?.blockNumber} Gas: ${receipt?.gasUsed}`
      );

      eventBus.emit({
        id: `batch-${item.id}`,
        txHash: tx.hash,
        from: clientAddress,
        to: item.recipient,
        amount: `${item.amount} ETH`,
        type: "transfer",
        status: "confirmed",
        gasUsed: `${receipt?.gasUsed} gas`,
        blockNumber: receipt?.blockNumber,
        timestamp: time,
      });
    } catch (err: any) {
      // Failed before broadcast or receipt failure
      // Notice: if sendTransaction threw before broadcast, currentNonce was NOT incremented,
      // ensuring the next row uses the correct, unskipped nonce!
      item.status = "failed";
      item.error = err?.reason || err?.message || "Transfer failed";
      totalFailedCount++;

      callbacks.onRowUpdate?.(i, item);
      callbacks.onLog?.(
        `[${time}] [ROW_${i + 1}_FAILED] Error: ${item.error}. Next row will reuse current nonce: ${currentNonce}`
      );

      eventBus.emit({
        id: `batch-${item.id}`,
        from: clientAddress,
        to: item.recipient,
        amount: `${item.amount} ETH`,
        type: "transfer",
        status: "failed",
        error: item.error,
        timestamp: time,
      });
    }
  }

  const state: BatchExecutionState = {
    items,
    totalSentCount,
    totalFailedCount,
    totalQueuedEth: items
      .reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0)
      .toFixed(4),
    runningGasCostWei,
    isRunning: false,
    isCancelled: Boolean(isCancelledCheck && isCancelledCheck()),
  };

  callbacks.onSummaryUpdate?.(state);
  return state;
}
