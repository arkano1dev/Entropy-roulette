// Mempool.space API integration for Mainnet

const MEMPOOL_API = "https://mempool.space/api";
const MEMPOOL_WS = "wss://mempool.space/api/v1/ws";

export interface MempoolUTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

export interface FeeEstimates {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

export interface TransactionStatus {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
}

// Fetch UTXOs for an address
export async function getAddressUTXOs(address: string): Promise<MempoolUTXO[]> {
  const response = await fetch(`${MEMPOOL_API}/address/${address}/utxo`);
  if (!response.ok) {
    throw new Error(`Failed to fetch UTXOs: ${response.statusText}`);
  }
  return response.json();
}

// Fetch recommended fee rates
export async function getFeeEstimates(): Promise<FeeEstimates> {
  const response = await fetch(`${MEMPOOL_API}/v1/fees/recommended`);
  if (!response.ok) {
    throw new Error(`Failed to fetch fees: ${response.statusText}`);
  }
  return response.json();
}

// Broadcast a raw transaction
export async function broadcastTransaction(txHex: string): Promise<string> {
  const response = await fetch(`${MEMPOOL_API}/tx`, {
    method: "POST",
    body: txHex,
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Broadcast failed: ${error}`);
  }
  return response.text(); // Returns txid
}

// Get transaction status
export async function getTransactionStatus(
  txid: string
): Promise<TransactionStatus> {
  const response = await fetch(`${MEMPOOL_API}/tx/${txid}/status`);
  if (!response.ok) {
    throw new Error(`Failed to get tx status: ${response.statusText}`);
  }
  return response.json();
}

// Get current block height
export async function getBlockHeight(): Promise<number> {
  const response = await fetch(`${MEMPOOL_API}/blocks/tip/height`);
  if (!response.ok) {
    throw new Error(`Failed to get block height: ${response.statusText}`);
  }
  return parseInt(await response.text(), 10);
}

// WebSocket connection for real-time updates
export class MempoolWebSocket {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(MEMPOOL_WS);

        this.ws.onopen = () => {
          this.reconnectAttempts = 0;
          resolve();
        };

        this.ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            this.handleMessage(data);
          } catch {
            // Ignore parse errors
          }
        };

        this.ws.onerror = () => {
          reject(new Error("WebSocket connection failed"));
        };

        this.ws.onclose = () => {
          this.attemptReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  private handleMessage(data: Record<string, unknown>) {
    // Handle block updates
    if (data.block) {
      this.emit("block", data.block);
    }

    // Handle transaction updates
    if (data["txConfirmed"]) {
      this.emit("txConfirmed", data["txConfirmed"]);
    }

    // Handle mempool updates
    if (data.mempoolInfo) {
      this.emit("mempool", data.mempoolInfo);
    }
  }

  private emit(event: string, data: unknown) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach((callback) => callback(data));
    }
  }

  on(event: string, callback: (data: unknown) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: (data: unknown) => void) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  // Subscribe to transaction confirmation
  trackTransaction(txid: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ "track-tx": txid }));
    }
  }

  // Subscribe to address activity
  trackAddress(address: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ "track-address": address }));
    }
  }

  // Subscribe to new blocks
  trackBlocks() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: "want", data: ["blocks"] }));
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.pow(2, this.reconnectAttempts) * 1000;
      setTimeout(() => this.connect(), delay);
    }
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
