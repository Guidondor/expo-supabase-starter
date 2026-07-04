import { withTimeout, TimeoutError } from '../withTimeout';

describe('withTimeout', () => {
  it('resolves the value if the promise settles before the timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000);
    expect(result).toBe('ok');
  });

  it('propagates the original promise rejection', async () => {
    const err = new Error('boom');
    await expect(withTimeout(Promise.reject(err), 1000)).rejects.toBe(err);
  });

  it('rejects with TimeoutError if the promise takes longer than ms', async () => {
    jest.useFakeTimers();
    const never = new Promise<string>(() => {}); // never resolves
    const p = withTimeout(never, 5000);
    const assertion = expect(p).rejects.toBeInstanceOf(TimeoutError);
    jest.advanceTimersByTime(5000);
    await assertion;
    jest.useRealTimers();
  });
});
