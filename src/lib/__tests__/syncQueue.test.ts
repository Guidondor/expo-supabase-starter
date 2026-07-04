// Mock AsyncStorage with the package's official (in-memory) mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

import {
  enqueue,
  processQueue,
  registerQueueHandler,
  getQueueSnapshot,
  clearQueueForUser,
  __resetForTesting,
  type ApplyResult,
} from '../syncQueue';

const USER = 'user-1';

function entry(kind: string, coalesceKey: string, payload: unknown = {}) {
  return { kind, userId: USER, coalesceKey, payload };
}

afterEach(() => {
  __resetForTesting();
});

describe('syncQueue', () => {
  it('enqueues and coalesces entries with the same coalesceKey', async () => {
    await enqueue(entry('todo', 'todo:1', { v: 1 }));
    await enqueue(entry('todo', 'todo:1', { v: 2 })); // replaces
    await enqueue(entry('todo', 'todo:2', { v: 9 }));

    const snap = getQueueSnapshot();
    expect(snap.entries).toHaveLength(2);
    const first = snap.entries.find((e) => e.coalesceKey === 'todo:1');
    expect((first?.payload as { v: number }).v).toBe(2);
  });

  it('processes OK and empties the queue', async () => {
    const seen: unknown[] = [];
    registerQueueHandler('todo', async (payload) => {
      seen.push(payload);
      return 'ok' as ApplyResult;
    });
    await enqueue(entry('todo', 'todo:1', { v: 1 }));
    await enqueue(entry('todo', 'todo:2', { v: 2 }));

    const res = await processQueue();
    expect(res.ok).toBe(2);
    expect(res.remaining).toBe(0);
    expect(getQueueSnapshot().entries).toHaveLength(0);
    expect(seen).toHaveLength(2);
  });

  it("keeps the entry when the handler returns 'retry'", async () => {
    registerQueueHandler('todo', async () => 'retry' as ApplyResult);
    await enqueue(entry('todo', 'todo:1'));

    const res = await processQueue();
    expect(res.failed).toBe(1);
    expect(res.remaining).toBe(1);
    expect(getQueueSnapshot().lastError).toBe('network');
  });

  it("drops the entry when the handler returns 'permanent'", async () => {
    registerQueueHandler('todo', async () => 'permanent' as ApplyResult);
    await enqueue(entry('todo', 'todo:1'));

    const res = await processQueue();
    expect(res.remaining).toBe(0);
    expect(getQueueSnapshot().entries).toHaveLength(0);
  });

  it('drops entries with no registered handler (avoids infinite retry)', async () => {
    await enqueue(entry('unknown-kind', 'x:1'));
    const res = await processQueue();
    expect(res.remaining).toBe(0);
  });

  it('clearQueueForUser removes only that user\'s entries', async () => {
    await enqueue({ kind: 'todo', userId: 'a', coalesceKey: 'a:1', payload: {} });
    await enqueue({ kind: 'todo', userId: 'b', coalesceKey: 'b:1', payload: {} });

    await clearQueueForUser('a');
    const snap = getQueueSnapshot();
    expect(snap.entries).toHaveLength(1);
    expect(snap.entries[0].userId).toBe('b');
  });
});
