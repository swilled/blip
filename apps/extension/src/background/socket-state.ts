const RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 4_000, 8_000, 10_000] as const;
const REPLACEMENT_HOLDOFF_MS = 30_000;
const PONG_TIMEOUT_MS = 10_000;

export interface SocketStateOptions {
  now?: () => number;
  random?: () => number;
}

/** Pure timing policy for the extension's reconnecting WebSocket. */
export class SocketState {
  private readonly now: () => number;
  private readonly random: () => number;
  private reconnectAttempt = 0;
  private reconnectBlockedUntil = 0;
  private pingSentAt: number | undefined;

  constructor(options: SocketStateOptions = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  nextReconnectDelay(): number {
    const baseDelay = RECONNECT_DELAYS_MS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)] ?? 10_000;
    this.reconnectAttempt += 1;
    const random = Math.min(1, Math.max(0, this.random()));
    return Math.floor(baseDelay * (0.8 + random * 0.4));
  }

  onOpen(): void {
    this.reconnectAttempt = 0;
    this.reconnectBlockedUntil = 0;
    this.pingSentAt = undefined;
  }

  onReplaced(): void {
    this.reconnectBlockedUntil = this.now() + REPLACEMENT_HOLDOFF_MS;
  }

  reconnectHoldoffMs(): number {
    return Math.max(0, this.reconnectBlockedUntil - this.now());
  }

  canReconnect(): boolean {
    return this.reconnectHoldoffMs() === 0;
  }

  onPing(): void {
    this.pingSentAt = this.now();
  }

  onPong(): void {
    this.pingSentAt = undefined;
  }

  isPongOverdue(): boolean {
    return this.pingSentAt !== undefined && this.now() - this.pingSentAt >= PONG_TIMEOUT_MS;
  }
}
