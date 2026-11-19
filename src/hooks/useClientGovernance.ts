import { useState, useEffect, useCallback } from 'react';
import { fetchClientPolicy } from '../api/governanceApi';
import type { ClientPolicyState } from '../model/governance';

interface UseClientGovernanceParams {
  enabled: boolean;
}

export function useClientGovernance({ enabled }: UseClientGovernanceParams) {
  const [clientPolicy, setClientPolicy] = useState<ClientPolicyState | null>(null);
  const [isLoadingPolicy, setIsLoadingPolicy] = useState<boolean>(false);

  const refreshClientPolicy = useCallback(async () => {
    if (!enabled) return;
    setIsLoadingPolicy(true);
    try {
      const policy = await fetchClientPolicy();
      if (policy) {
        setClientPolicy(policy);
      }
    } catch {
      // Keep prior policy state if transient network glitch occurs
    } finally {
      setIsLoadingPolicy(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refreshClientPolicy();
  }, [enabled, refreshClientPolicy]);

  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void refreshClientPolicy();
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [enabled, refreshClientPolicy]);

  return {
    clientPolicy,
    isLoadingPolicy,
    refreshClientPolicy,
  };
}
