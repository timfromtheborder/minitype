import { useEffect, useRef, useCallback } from 'react';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

export function useWakeLock(timeoutMs: number = FIVE_MINUTES_MS) {
  const sentinelRef = useRef<any>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastActiveTimeRef = useRef<number>(Date.now());

  const releaseLock = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (sentinelRef.current) {
      try {
        await sentinelRef.current.release();
      } catch (e) {
        // Ignore release errors
      }
      sentinelRef.current = null;
    }
  }, []);

  const requestLock = useCallback(async () => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (sentinelRef.current && !sentinelRef.current.released) return;

    try {
      const sentinel = await (navigator as any).wakeLock.request('screen');
      sentinelRef.current = sentinel;

      sentinel.addEventListener('release', () => {
        if (sentinelRef.current === sentinel) {
          sentinelRef.current = null;
        }
      });
    } catch (e) {
      // Screen wake lock request can fail due to battery saver, backgrounding, etc.
      sentinelRef.current = null;
    }
  }, []);

  const scheduleTimeout = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    timerRef.current = setTimeout(() => {
      releaseLock();
    }, timeoutMs);
  }, [timeoutMs, releaseLock]);

  const onUserActivity = useCallback(() => {
    lastActiveTimeRef.current = Date.now();

    if (!sentinelRef.current || sentinelRef.current.released) {
      requestLock();
    }
    scheduleTimeout();
  }, [requestLock, scheduleTimeout]);

  useEffect(() => {
    // Try to acquire initial wake lock
    requestLock();
    scheduleTimeout();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastActiveTimeRef.current;
        if (elapsed < timeoutMs) {
          requestLock();
          scheduleTimeout();
        }
      } else {
        releaseLock();
      }
    };

    const handleActivity = () => {
      onUserActivity();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('keydown', handleActivity, { passive: true });
    window.addEventListener('touchstart', handleActivity, { passive: true });
    window.addEventListener('pointerdown', handleActivity, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      window.removeEventListener('pointerdown', handleActivity);
      releaseLock();
    };
  }, [timeoutMs, requestLock, releaseLock, scheduleTimeout, onUserActivity]);
}
