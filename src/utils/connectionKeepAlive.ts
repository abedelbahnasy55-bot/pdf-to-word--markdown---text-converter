import { useEffect, useRef, useState } from 'react';
import { AUTH_REQUIRED_EVENT, apiFetch } from './apiClient';

interface KeepAliveOptions {
  enabled: boolean;
  onWakeSync?: () => void | Promise<void>;
  onAuthRequired?: () => void;
}

/**
 * Keeps long-idle sessions warm via quiet periodic /api/ping while visible,
 * automatically re-syncs state when returning from tab sleep/suspend without triggering browser reloads.
 */
export function useConnectionKeepAlive({
  enabled,
  onWakeSync,
  onAuthRequired,
}: KeepAliveOptions) {
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isOffline, setIsOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  const lastActivityRef = useRef<number>(Date.now());
  const wakeCallbackRef = useRef(onWakeSync);
  const authCallbackRef = useRef(onAuthRequired);

  useEffect(() => {
    wakeCallbackRef.current = onWakeSync;
    authCallbackRef.current = onAuthRequired;
  }, [onWakeSync, onAuthRequired]);

  useEffect(() => {
    const handleAuthRequired = () => {
      authCallbackRef.current?.();
    };
    window.addEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
    return () => window.removeEventListener(AUTH_REQUIRED_EVENT, handleAuthRequired);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let disposed = false;

    const pingServer = async (triggerWakeCallbacks: boolean) => {
      if (disposed) return;
      try {
        if (triggerWakeCallbacks) setIsReconnecting(true);
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 8000);
        const res = await apiFetch(
          '/api/ping',
          { method: 'GET', cache: 'no-store', signal: controller.signal },
          { transientRetries: 2 }
        );
        clearTimeout(timer);
        if (!disposed && res.ok) {
          setIsOffline(false);
          lastActivityRef.current = Date.now();
          if (triggerWakeCallbacks && wakeCallbackRef.current) {
            await Promise.resolve(wakeCallbackRef.current());
          }
        }
      } catch {
        if (!disposed && typeof navigator !== 'undefined' && !navigator.onLine) {
          setIsOffline(true);
        }
      } finally {
        if (!disposed) setIsReconnecting(false);
      }
    };

    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void pingServer(false);
      }
    }, 25_000);

    const handleWake = () => {
      if (document.visibilityState === 'hidden') return;
      const idleGapMs = Date.now() - lastActivityRef.current;
      lastActivityRef.current = Date.now();
      if (idleGapMs > 20_000) {
        void pingServer(true);
      }
    };

    const handleOnline = () => {
      setIsOffline(false);
      void pingServer(true);
    };

    const handleOffline = () => {
      setIsOffline(true);
    };

    const handlePageShow = (ev: PageTransitionEvent) => {
      if (ev.persisted) {
        void pingServer(true);
      }
    };

    document.addEventListener('visibilitychange', handleWake);
    window.addEventListener('focus', handleWake);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      disposed = true;
      clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleWake);
      window.removeEventListener('focus', handleWake);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [enabled]);

  return {
    isReconnecting,
    isOffline,
  };
}
