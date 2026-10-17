import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFrame } from '@blip/protocol';
import { ensureConnected } from '../src/background/socket.js';
import { injectExistingTabs } from '../src/background/inject.js';

vi.mock('../src/background/socket.js', () => ({
  ensureConnected: vi.fn(),
  onSocketWelcome: vi.fn(() => vi.fn()),
  sendPageChanged: vi.fn(() => true),
}));
vi.mock('../src/background/inject.js', () => ({ injectExistingTabs: vi.fn().mockResolvedValue(undefined) }));

describe('background service-worker listeners', () => {
  let startupListeners: Array<() => void>;
  let installedListeners: Array<() => void>;
  let alarmListeners: Array<(alarm: { name: string }) => void>;
  let messageListeners: Array<(message: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => void>;
  let createAlarm: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    startupListeners = [];
    installedListeners = [];
    alarmListeners = [];
    messageListeners = [];
    createAlarm = vi.fn(async () => undefined);

    Object.defineProperty(globalThis, 'chrome', {
      configurable: true,
      value: {
        runtime: {
          onStartup: { addListener: (listener: () => void) => startupListeners.push(listener) },
          onInstalled: { addListener: (listener: () => void) => installedListeners.push(listener) },
          id: 'blip-extension-id',
          onMessage: { addListener: (listener: (message: unknown, sender: { id?: string }, sendResponse: (response: unknown) => void) => void) => messageListeners.push(listener) },
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
    expect(injectExistingTabs).toHaveBeenCalledOnce();
  });

  it('reconnects only for the service-worker keepalive alarm', () => {
    alarmListeners[0]?.({ name: 'unrelated' });
    expect(ensureConnected).toHaveBeenCalledTimes(1);

    alarmListeners[0]?.({ name: 'blip-reconnect' });
    expect(ensureConnected).toHaveBeenCalledTimes(2);
  });

  it('returns correlated typed failures while dispatch modules are not ready', () => {
    const onMessage = messageListeners[0];
    const snapshotReply = vi.fn();
    const snapshotRequest = buildFrame('snapshot.request', { reason: 'user' }, { id: 'snapshot-request' });
    onMessage?.(snapshotRequest, { id: 'blip-extension-id' }, snapshotReply);

    const snapshot = snapshotReply.mock.calls[0]?.[0] as {
      type: string;
      replyTo?: string;
      payload: { ok: boolean; error?: { code: string } };
    };
    expect(snapshot.type).toBe('snapshot.result');
    expect(snapshot.replyTo).toBe('snapshot-request');
    expect(snapshot.payload).toEqual({
      ok: false,
      error: { code: 'not-ready', message: expect.any(String) },
    });

    const actReply = vi.fn();
    const actRequest = buildFrame(
      'act.request',
      {
        actId: 'act-1',
        tabId: 7,
        snapshotVersion: 1,
        action: { op: 'fill', targetId: 'e1', value: 'A' },
        expectedKind: 'fill',
      },
      { id: 'act-request' },
    );
    onMessage?.(actRequest, { id: 'blip-extension-id' }, actReply);

    const act = actReply.mock.calls[0]?.[0] as {
      type: string;
      replyTo?: string;
      payload: { actId: string; ok: boolean; error?: string; detail?: string };
    };
    expect(act.type).toBe('act.result');
    expect(act.replyTo).toBe('act-request');
    expect(act.payload).toEqual({
      actId: 'act-1',
      ok: false,
      error: 'exception',
      detail: expect.stringContaining('not-implemented'),
    });
  });
});
