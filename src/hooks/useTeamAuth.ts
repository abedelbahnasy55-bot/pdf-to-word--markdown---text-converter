import { useState, useEffect, useCallback } from 'react';
import { fetchTeamAuthStatus } from '../api/teamAuthApi';
import type { TeamAuthStatusState } from '../model/auth';

function detectAdminModeFromUrl(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    return params.get('admin') === '1' || window.location.hash === '#admin';
  } catch {
    return false;
  }
}

export function useTeamAuth(onAfterExitAdmin?: () => void) {
  const [isAdminMode, setIsAdminMode] = useState<boolean>(() => detectAdminModeFromUrl());
  const [authStatus, setAuthStatus] = useState<TeamAuthStatusState | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  useEffect(() => {
    const syncAdminFromUrl = () => {
      setIsAdminMode(detectAdminModeFromUrl());
    };
    window.addEventListener('popstate', syncAdminFromUrl);
    window.addEventListener('hashchange', syncAdminFromUrl);
    return () => {
      window.removeEventListener('popstate', syncAdminFromUrl);
      window.removeEventListener('hashchange', syncAdminFromUrl);
    };
  }, []);

  const handleExitAdminMode = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('admin');
      if (url.hash === '#admin') {
        url.hash = '';
      }
      window.history.pushState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
    setIsAdminMode(false);
    onAfterExitAdmin?.();
  }, [onAfterExitAdmin]);

  const refreshAuthStatus = useCallback(async () => {
    try {
      const status = await fetchTeamAuthStatus();
      if (status) {
        setAuthStatus(status);
      }
    } catch {
      // Keep prior state or allow offline work without blocking
    } finally {
      setIsCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    void refreshAuthStatus();
  }, [refreshAuthStatus]);

  const isTeamAccessAllowed =
    !isCheckingAuth && (!authStatus?.lockEnabled || Boolean(authStatus?.authenticated));

  return {
    isAdminMode,
    authStatus,
    isCheckingAuth,
    isTeamAccessAllowed,
    refreshAuthStatus,
    handleExitAdminMode,
  };
}
