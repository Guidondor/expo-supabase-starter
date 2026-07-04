/**
 * withTimeout — wrap any promise with a time limit.
 *
 * Why it exists: on mobile, after the OS puts the app to sleep (doze/suspend),
 * supabase-js requests can hang forever without resolving or rejecting. Wrapping
 * every network query in `withTimeout` guarantees the UI never gets stuck waiting
 * on a dead promise.
 *
 * Usage: `const { data } = await withTimeout(supabase.from('x').select(), 12000)`
 */
export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Operation timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number = 12000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
  });
  return Promise.race([Promise.resolve(promise), timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
