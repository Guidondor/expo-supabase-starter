/**
 * syncQueue — Durable offline-first write queue, persisted in AsyncStorage.
 *
 * What it's for: on mobile, an optimistic write (the user tapped something and
 * the UI already reflects it) must NOT be lost if there's no network at that
 * moment. This queue persists every write, retries it with backoff until it
 * lands, and survives the app being killed. It's one of the most annoying
 * problems to get right in RN — here it's already solved.
 *
 * Generic by design: the core knows nothing about your backend. You register one
 * handler per `kind` of write; the handler makes the request and classifies the
 * result as 'ok' | 'permanent' | 'retry'.
 *
 *   registerQueueHandler('todo_upsert', async (payload) => {
 *     const { error } = await supabase.from('todos').upsert(payload as Todo)
 *     if (!error) return 'ok'
 *     return isPermanentSupabaseError(error) ? 'permanent' : 'retry'
 *   })
 *
 *   await enqueue({ kind: 'todo_upsert', userId, coalesceKey: `todo:${id}`, payload })
 *
 * - Coalescing: a new entry with the same `coalesceKey` REPLACES the previous one
 *   (only the final state reaches the server).
 * - 'permanent' drops the entry (no point retrying: RLS, constraint violation).
 * - 'retry' keeps it and retries with exponential backoff (5s → 60s).
 * - Entries auto-expire after 7 days.
 *
 * Recommended triggers (wire them in your auth hook / AppState / NetInfo):
 *   call processQueue() on cold start, on returning to foreground, and on reconnect.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { withTimeout, TimeoutError } from './withTimeout';

// ──────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────

export interface QueueEntry {
  /** Discriminates which handler processes this write. */
  kind: string;
  /** Owner of the write. Lets us clear a user's queue on sign out. */
  userId: string;
  /** Entries with the same key collapse (only the latest is kept). */
  coalesceKey: string;
  /** Data your handler needs to make the request. */
  payload: unknown;
  /** Enqueue timestamp (set by `enqueue`). */
  enqueuedAt: number;
}

export type ApplyResult = 'ok' | 'permanent' | 'retry';
export type QueueHandler = (payload: unknown, entry: QueueEntry) => Promise<ApplyResult>;

export interface QueueSnapshot {
  entries: QueueEntry[];
  syncing: boolean;
  lastError: string | null;
}

// ──────────────────────────────────────────────────────────────────────
// Module-level state
// ──────────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'app.syncQueue.v1';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days → auto-expire

const cache: QueueSnapshot = { entries: [], syncing: false, lastError: null };
const handlers = new Map<string, QueueHandler>();

let hydrated = false;
let hydrating: Promise<void> | null = null;
const subscribers = new Set<() => void>();

// Re-trigger: if processQueue() is called while another run is active (typical:
// NetInfo fires on reconnect mid-sync), schedule a re-run when it finishes.
// Without this the second trigger is lost to the semaphore.
let pendingRetrigger = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 5000;
const RETRY_MIN_MS = 5000;
const RETRY_MAX_MS = 60000;

// ──────────────────────────────────────────────────────────────────────
// Handler registration
// ──────────────────────────────────────────────────────────────────────

export function registerQueueHandler(kind: string, handler: QueueHandler): void {
  handlers.set(kind, handler);
}

/**
 * Classifies a Supabase/PostgREST error as permanent (no point retrying). Useful
 * inside your handlers. Covers RLS (42501) and check/unique/foreign-key violations.
 */
export function isPermanentSupabaseError(error: { code?: string } | null | undefined): boolean {
  if (!error?.code) return false;
  return ['42501', '23514', '23505', '23503'].includes(error.code);
}

// ──────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────

function notify(): void {
  subscribers.forEach((cb) => cb());
}
function clearRetryTimer(): void {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}
function resetRetryBackoff(): void {
  retryDelayMs = RETRY_MIN_MS;
}
function scheduleRetry(): void {
  if (retryTimer || cache.entries.length === 0) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void processQueue();
  }, retryDelayMs);
  retryDelayMs = Math.min(retryDelayMs * 2, RETRY_MAX_MS);
}
async function flushToStorage(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cache.entries));
  } catch (e) {
    if (__DEV__) console.error('[syncQueue flush]', e);
  }
}
async function hydrate(): Promise<void> {
  if (hydrated) return;
  if (hydrating) return hydrating;
  hydrating = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as QueueEntry[];
        const now = Date.now();
        cache.entries = parsed.filter((e) => now - e.enqueuedAt < MAX_AGE_MS);
        if (cache.entries.length !== parsed.length) void flushToStorage();
      }
    } catch (e) {
      if (__DEV__) console.error('[syncQueue hydrate]', e);
      cache.entries = [];
    } finally {
      hydrated = true;
      notify();
    }
  })();
  return hydrating;
}

// Start hydration when the module loads (no await).
void hydrate();

// ──────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────

export async function enqueue(entry: Omit<QueueEntry, 'enqueuedAt'>): Promise<void> {
  await hydrate();
  const full: QueueEntry = { ...entry, enqueuedAt: Date.now() };
  cache.entries = cache.entries.filter((e) => e.coalesceKey !== full.coalesceKey);
  cache.entries.push(full);
  notify();
  await flushToStorage();
}

export async function clearQueueForUser(userId: string): Promise<void> {
  await hydrate();
  const before = cache.entries.length;
  cache.entries = cache.entries.filter((e) => e.userId !== userId);
  if (cache.entries.length !== before) {
    if (cache.entries.length === 0) {
      cache.lastError = null;
      clearRetryTimer();
      resetRetryBackoff();
    }
    notify();
    await flushToStorage();
  }
}

export function getQueueSnapshot(): QueueSnapshot {
  return { entries: [...cache.entries], syncing: cache.syncing, lastError: cache.lastError };
}

export function subscribeQueueChange(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** Test-only — resets module-level state. Do NOT use at runtime. */
export function __resetForTesting(): void {
  cache.entries = [];
  cache.syncing = false;
  cache.lastError = null;
  handlers.clear();
  hydrated = false;
  hydrating = null;
  subscribers.clear();
  pendingRetrigger = false;
  clearRetryTimer();
  resetRetryBackoff();
}

// ──────────────────────────────────────────────────────────────────────
// Worker
// ──────────────────────────────────────────────────────────────────────

async function applyEntry(entry: QueueEntry): Promise<ApplyResult> {
  const handler = handlers.get(entry.kind);
  if (!handler) {
    if (__DEV__) console.warn(`[syncQueue] no handler for kind="${entry.kind}" → dropped`);
    return 'permanent';
  }
  try {
    return await withTimeout(handler(entry.payload, entry), 10000);
  } catch (e) {
    if (e instanceof TimeoutError) return 'retry';
    if (__DEV__) console.error('[syncQueue applyEntry]', e);
    return 'retry';
  }
}

export async function processQueue(): Promise<{ ok: number; failed: number; remaining: number }> {
  await hydrate();
  if (cache.syncing) {
    pendingRetrigger = true;
    return { ok: 0, failed: 0, remaining: cache.entries.length };
  }
  if (cache.entries.length === 0) {
    if (cache.lastError) {
      cache.lastError = null;
      notify();
    }
    clearRetryTimer();
    resetRetryBackoff();
    return { ok: 0, failed: 0, remaining: 0 };
  }

  clearRetryTimer();
  cache.syncing = true;
  cache.lastError = null;
  pendingRetrigger = false;
  notify();

  const toProcess = [...cache.entries].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
  let ok = 0;
  let failed = 0;

  for (const entry of toProcess) {
    const result = await applyEntry(entry);
    if (result === 'ok' || result === 'permanent') {
      // Remove by coalesceKey, unless a later enqueue replaced it.
      cache.entries = cache.entries.filter(
        (e) => e.coalesceKey !== entry.coalesceKey || e.enqueuedAt > entry.enqueuedAt
      );
      ok++;
      if (result === 'permanent' && __DEV__) console.warn('[syncQueue dropped permanent]', entry);
    } else {
      failed++;
      cache.lastError = 'network';
    }
  }

  await flushToStorage();
  cache.syncing = false;
  if (cache.entries.length === 0) resetRetryBackoff();
  else if (failed > 0) scheduleRetry();
  notify();

  if (pendingRetrigger) {
    pendingRetrigger = false;
    setTimeout(() => void processQueue(), 100);
  }

  return { ok, failed, remaining: cache.entries.length };
}
