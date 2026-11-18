import { useEffect, useState } from 'react';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
] as const;

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({ prompt: 'select_account' });

// Strict security policy: keep OAuth access token in memory ONLY (never localStorage/sessionStorage).
let cachedAccessToken: string | null = null;
let isSigningIn = false;
let currentUserState: User | null = null;

type AuthListener = () => void;
const listeners = new Set<AuthListener>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

onAuthStateChanged(auth, (user) => {
  currentUserState = user;
  if (!user && !isSigningIn) {
    cachedAccessToken = null;
  }
  notifyListeners();
});

export function initAuth(
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) {
  return onAuthStateChanged(auth, (user) => {
    currentUserState = user;
    if (user && cachedAccessToken) {
      onAuthSuccess?.(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (!user) cachedAccessToken = null;
      onAuthFailure?.();
    }
  });
}

export async function googleSignIn(): Promise<{ user: User; accessToken: string }> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('تعذر استلام رمز الوصول من حساب Google. يرجى الموافقة على الصلاحيات المطلوبة.');
    }
    cachedAccessToken = credential.accessToken;
    currentUserState = result.user;
    notifyListeners();
    return { user: result.user, accessToken: cachedAccessToken };
  } finally {
    isSigningIn = false;
  }
}

export async function getAccessToken(): Promise<string | null> {
  return cachedAccessToken;
}

export function clearExpiredAccessToken(): void {
  cachedAccessToken = null;
  notifyListeners();
}

export async function logoutGoogleWorkspace(): Promise<void> {
  cachedAccessToken = null;
  currentUserState = null;
  await auth.signOut();
  notifyListeners();
}

export interface WorkspaceAuthSnapshot {
  user: User | null;
  hasToken: boolean;
  needsAuth: boolean;
}

export function useWorkspaceAuth(): WorkspaceAuthSnapshot & {
  signIn: () => Promise<{ user: User; accessToken: string }>;
  signOut: () => Promise<void>;
  markTokenExpired: () => void;
  isSigningIn: boolean;
  authError: string | null;
  clearAuthError: () => void;
} {
  const [snapshot, setSnapshot] = useState<WorkspaceAuthSnapshot>(() => ({
    user: currentUserState,
    hasToken: Boolean(cachedAccessToken),
    needsAuth: !cachedAccessToken,
  }));
  const [signingInState, setSigningInState] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const update = () => {
      setSnapshot({
        user: currentUserState,
        hasToken: Boolean(cachedAccessToken),
        needsAuth: !cachedAccessToken,
      });
    };
    listeners.add(update);
    update();
    return () => {
      listeners.delete(update);
    };
  }, []);

  const signIn = async () => {
    setSigningInState(true);
    setAuthError(null);
    try {
      return await googleSignIn();
    } catch (err: any) {
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('تم إغلاق نافذة تسجيل الدخول قبل إتمام الربط.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('حظر المتصفح النافذة المنبثقة. اسمح بالنوافذ المنبثقة لهذا الموقع وأعد المحاولة.');
      } else {
        setAuthError(err?.message || 'تعذر تسجيل الدخول بحساب Google.');
      }
      throw err;
    } finally {
      setSigningInState(false);
    }
  };

  const signOut = async () => {
    setAuthError(null);
    await logoutGoogleWorkspace();
  };

  return {
    ...snapshot,
    signIn,
    signOut,
    markTokenExpired: clearExpiredAccessToken,
    isSigningIn: signingInState,
    authError,
    clearAuthError: () => setAuthError(null),
  };
}
