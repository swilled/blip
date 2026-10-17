import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ensureConnected } from '../src/background/socket.js';

vi.mock('../src/background/socket.js', () => ({ ensureConnected: vi.fn() }));

describe('background service-worker listeners', () => {
  let startupListeners: Array<() => void>;
  let installedListeners: Array<() => void>;
  let alarmListeners: Array<(alarm: { name: string }) => void>;
  let createAlarm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    startupListeners = [];
    installedListeners = [];
    alarmListeners = [];
    createAlarm = vi.fn(async () => undefined);

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          onStartup: { addListener: (listener: () => void) => startupListeners.push(listener) },
          onInstalled: { addListener: (listener: () => void) => installedListeners.push(listener) },
          onMessage: { addListener: vi.fn() },
        },
        alarms: {
          create: createAlarm,
          onAlarm: { addListener: (listener: (alarm: { name: string }) => void) => alarmListeners.push(listener) },
        },
      },
    });

    await import('../src/background/index.js');
  });

  it('registers wake listeners synchronously and connects at module load', () => {
    expect(startupListeners).toHaveLength(1);
    expect(installedListeners).toHaveLength(1);
    expect(alarmListeners).toHaveLength(1);
    expect(createAlarm).toHaveBeenCalledWith('blip-reconnect', { periodInMinutes: 0.5 });
    expect(ensureConnected).toHaveBeenCalledTimes(1);
  });

  it('recreates the alarm and ensures a connection on startup and install', () => {
    startupListeners[0]?.();
    installedListeners[0]?.();

    expect(createAlarm).toHaveBeenCalledTimes(3);
    expect(createAlarm).toHaveBeenNthCalledWith(2, 'blip-reconnect', { periodInMinutes: 0.5 });
    expect(createAlarm).toHaveBeenNthCalledWith(3, 'blip-reconnect', { periodInMinutes: 0.5 });
    expect(ensureConnected).toHaveBeenCalledTimes(3);
  });

  it('reconnects only for the service-worker keepalive alarm', () => {
    alarmListeners[0]?.({ name: 'unrelated' });
    expect(ensureConnected).toHaveBeenCalledTimes(1);

    alarmListeners[0]?.({ name: 'blip-reconnect' });
    expect(ensureConnected).toHaveBeenCalledTimes(2);
  });
});
