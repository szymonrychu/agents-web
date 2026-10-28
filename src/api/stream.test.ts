import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STATUS_EVENTS, openStream, statusEventFromFrame } from './stream';

class FakeSource {
  static all: FakeSource[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string; lastEventId: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  listeners = new Map<string, (e: { data: string; lastEventId: string }) => void>();
  addEventListener(name: string, fn: (e: { data: string; lastEventId: string }) => void) {
    this.listeners.set(name, fn);
  }
  constructor(public url: string) {
    FakeSource.all.push(this);
  }
  close() {
    this.closed = true;
  }
  emit(id: number, data: unknown = { id }) {
    this.onmessage?.({ data: JSON.stringify(data), lastEventId: String(id) });
  }
}

const ctor = FakeSource as unknown as typeof EventSource;
const last = () => FakeSource.all[FakeSource.all.length - 1];

beforeEach(() => {
  FakeSource.all = [];
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('openStream', () => {
  it('reconnects with capped exponential backoff', () => {
    openStream('/s', { onEvent: () => {}, eventSource: ctor });
    const delays = [1000, 2000, 4000, 8000, 16000, 30000, 30000];
    delays.forEach((d, i) => {
      expect(FakeSource.all).toHaveLength(i + 1);
      last().onerror?.();
      expect(last().closed).toBe(true);
      vi.advanceTimersByTime(d - 1);
      expect(FakeSource.all).toHaveLength(i + 1);
      vi.advanceTimersByTime(1);
      expect(FakeSource.all).toHaveLength(i + 2);
    });
  });

  it('resets backoff after first event', () => {
    openStream('/s', { onEvent: () => {}, eventSource: ctor });
    last().onerror?.();
    vi.advanceTimersByTime(1000);
    last().onerror?.();
    vi.advanceTimersByTime(2000);
    expect(FakeSource.all).toHaveLength(3);
    last().emit(1);
    last().onerror?.();
    vi.advanceTimersByTime(999);
    expect(FakeSource.all).toHaveLength(3);
    vi.advanceTimersByTime(1);
    expect(FakeSource.all).toHaveLength(4);
  });

  it('resumes after last event id', () => {
    const got: unknown[] = [];
    openStream('/s?x=1', { onEvent: (e) => got.push(e), eventSource: ctor });
    expect(last().url).toBe('/s?x=1');
    last().emit(5);
    last().emit(7);
    expect(got).toEqual([{ id: 5 }, { id: 7 }]);
    last().onerror?.();
    vi.advanceTimersByTime(1000);
    expect(last().url).toBe('/s?x=1&after_id=7');
  });

  it('uses afterId for the first connection and reports open and error', () => {
    const onOpen = vi.fn();
    const onError = vi.fn();
    openStream('/s', { onEvent: () => {}, onOpen, onError, afterId: 3, eventSource: ctor });
    expect(last().url).toBe('/s?after_id=3');
    last().onopen?.();
    expect(onOpen).toHaveBeenCalledOnce();
    last().onerror?.();
    expect(onError).toHaveBeenCalledOnce();
  });

  it('listens to named server events', () => {
    const got: Array<[unknown, string]> = [];
    openStream('/s', {
      onEvent: (d, info) => got.push([d, info.type]),
      eventNames: ['tool_call', 'gap'],
      eventSource: ctor,
    });
    expect([...last().listeners.keys()]).toEqual(['tool_call', 'gap']);
    last().listeners.get('tool_call')?.({ data: '{"a":1}', lastEventId: '9' });
    expect(got).toEqual([[{ a: 1 }, 'tool_call']]);
    last().onerror?.();
    vi.advanceTimersByTime(1000);
    expect(last().url).toBe('/s?after_id=9');
  });

  it('close stops reconnecting', () => {
    const s = openStream('/s', { onEvent: () => {}, eventSource: ctor });
    last().onerror?.();
    s.close();
    vi.advanceTimersByTime(60000);
    expect(FakeSource.all).toHaveLength(1);
    const s2 = openStream('/s', { onEvent: () => {}, eventSource: ctor });
    s2.close();
    expect(last().closed).toBe(true);
    last().onerror?.();
    vi.advanceTimersByTime(60000);
    expect(FakeSource.all).toHaveLength(2);
  });
});

describe('status stream', () => {
  it('session events', () => {
    expect(STATUS_EVENTS).toEqual(['snapshot', 'session_status', 'agent_status', 'leader_changed', 'message_status', 'session_removed']);
    const got: unknown[] = [];
    openStream('/stream', {
      onEvent: (d, info) => got.push(statusEventFromFrame(info.type, d)),
      eventNames: [...STATUS_EVENTS],
      eventSource: ctor,
    });
    expect([...last().listeners.keys()]).toEqual([...STATUS_EVENTS]);
    last().listeners.get('session_status')?.({ data: '{"session":{"id":"s1"}}', lastEventId: '' });
    last().listeners.get('session_removed')?.({ data: '{"session_id":"s1"}', lastEventId: '' });
    expect(got).toEqual([
      { type: 'session_status', session: { id: 's1' } },
      { type: 'session_removed', sessionId: 's1' },
    ]);
    expect(statusEventFromFrame('snapshot', { sessions: [{ session: { id: 's1' }, agents: [] }] })).toEqual({
      type: 'snapshot',
      sessions: [{ session: { id: 's1' }, agents: [] }],
    });
    expect(statusEventFromFrame('agent_status', { session_id: 's1', agent: { id: 'a1' } })).toEqual({
      type: 'agent_status',
      sessionId: 's1',
      agent: { id: 'a1' },
    });
    expect(statusEventFromFrame('leader_changed', { session_id: 's1', agent_id: 'a1', epoch: 2 })).toEqual({
      type: 'leader_changed',
      sessionId: 's1',
      agentId: 'a1',
      epoch: 2,
      reason: null,
    });
    expect(statusEventFromFrame('message_status', { session_id: 's1', queued: 1, failed: 0, oldest_queued_at: '2026-01-01T00:00:00Z' })).toEqual({
      type: 'message_status',
      sessionId: 's1',
      queued: 1,
      failed: 0,
      oldestQueuedAt: '2026-01-01T00:00:00Z',
    });
    expect(statusEventFromFrame('cluster_status', { cluster: { id: 's1' } })).toBeNull();
    expect(statusEventFromFrame('cluster_removed', { cluster_id: 's1' })).toBeNull();
    expect(statusEventFromFrame('session_status', null)).toBeNull();
  });

  it('message_status carries oldest_queued_at and a missing one is null', () => {
    expect(statusEventFromFrame('message_status', { session_id: 's1', queued: 2, failed: 1, oldest_queued_at: '2026-01-01T00:05:00Z', messages: [] })).toEqual({
      type: 'message_status',
      sessionId: 's1',
      queued: 2,
      failed: 1,
      oldestQueuedAt: '2026-01-01T00:05:00Z',
    });
    expect(statusEventFromFrame('message_status', { session_id: 's1', queued: 0, failed: 0, oldest_queued_at: null })).toMatchObject({ oldestQueuedAt: null });
    expect(statusEventFromFrame('message_status', { session_id: 's1', queued: 0, failed: 0 })).toMatchObject({ oldestQueuedAt: null });
  });

  it('leader_changed carries the reason and a missing reason is null', () => {
    expect(statusEventFromFrame('leader_changed', { session_id: 's1', agent_id: 'a1', epoch: 3, reason: 'compaction' })).toEqual({
      type: 'leader_changed',
      sessionId: 's1',
      agentId: 'a1',
      epoch: 3,
      reason: 'compaction',
    });
    expect(statusEventFromFrame('leader_changed', { session_id: 's1', agent_id: 'a1', epoch: 4, reason: 'handover: context full' })).toMatchObject({ reason: 'handover: context full' });
    expect(statusEventFromFrame('leader_changed', { session_id: 's1', agent_id: 'a1', epoch: 5 })).toMatchObject({ reason: null });
    expect(statusEventFromFrame('leader_changed', { session_id: 's1', agent_id: 'a1', epoch: 5, reason: null })).toMatchObject({ reason: null });
  });
});
