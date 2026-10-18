import { describe, expect, it } from 'vitest';
import { SocketState } from '../src/background/socket-state.js';

describe('SocketState', () => {
  it('uses capped exponential reconnect backoff with 0.8–1.2 jitter', () => {
    const lowJitter = new SocketState({ random: () => 0 });
    const expected = [500, 1_000, 2_000, 4_000, 8_000, 10_000, 10_000];

    for (const base of expected) {
      expect(lowJitter.nextReconnectDelay()).toBe(Math.floor(base * 0.8));
    }

    const highJitter = new SocketState({ random: () => 1 });
    expect(highJitter.nextReconnectDelay()).toBe(Math.floor(500 * 1.2));
  });

  it('resets the backoff after a successful connection', () => {
    const state = new SocketState({ random: () => 0.5 });
    state.nextReconnectDelay();
    state.nextReconnectDelay();

    state.onOpen();

    expect(state.nextReconnectDelay()).toBe(500);
  });

  it('blocks reconnecting for 30 seconds after a replaced connection', () => {
    let now = 1_000;
    const state = new SocketState({ now: () => now });
    state.onReplaced();

    expect(state.canReconnect()).toBe(false);
    now += 29_999;
    expect(state.canReconnect()).toBe(false);
    now += 1;
    expect(state.canReconnect()).toBe(true);
  });

  it('marks a peer dead when a ping has no pong within 10 seconds', () => {
    let now = 0;
    const state = new SocketState({ now: () => now });
    state.onPing();

    now = 9_999;
    expect(state.isPongOverdue()).toBe(false);
    now = 10_000;
    expect(state.isPongOverdue()).toBe(true);

    state.onPong();
    expect(state.isPongOverdue()).toBe(false);
  });
});
