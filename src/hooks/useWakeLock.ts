import { useEffect, useRef, useCallback } from 'react';
import { ScreenWakeLockPolicy } from '@/types';

export interface UseWakeLockOptions {
  policy?: ScreenWakeLockPolicy;
}

export function useWakeLock(policy: ScreenWakeLockPolicy = 'always') {
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
    if (policy === 'off') return;
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
  }, [policy]);

  const scheduleTimeout = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (policy === '5-min') {
      timerRef.current = setTimeout(() => {
        releaseLock();
      }, 5 * 60 * 1000);
    }
  }, [policy, releaseLock]);

  const onUserActivity = useCallback(() => {
    lastActiveTimeRef.current = Date.now();
    if (policy === 'off') return;

    if (!sentinelRef.current || sentinelRef.current.released) {
      requestLock();
    }
    scheduleTimeout();
  }, [policy, requestLock, scheduleTimeout]);

  useEffect(() => {
    if (policy === 'off') {
      releaseLock();
      return;
    }

    // Try to acquire initial wake lock
    requestLock();
    scheduleTimeout();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (policy === 'always') {
          requestLock();
        } else if (policy === '5-min') {
          const elapsed = Date.now() - lastActiveTimeRef.current;
          if (elapsed < 5 * 60 * 1000) {
            requestLock();
            scheduleTimeout();
          }
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
  }, [policy, requestLock, releaseLock, scheduleTimeout, onUserActivity]);
}
