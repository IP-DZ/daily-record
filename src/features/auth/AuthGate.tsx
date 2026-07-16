import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AuthUser } from '@daily-record/contracts';

import type { AuthPort } from '../../platform/auth';
import { AuthPage, safeAuthMessage } from './AuthPage';

interface AuthGateProps {
  auth: AuthPort;
  children: ReactNode | ((user: AuthUser) => ReactNode);
  onSignedOut?: (user: AuthUser) => void | Promise<void>;
}

export function AuthGate({ auth, children, onSignedOut }: AuthGateProps) {
  const [session, setSession] = useState<{
    auth: AuthPort;
    user: AuthUser | null;
    isRestoring: boolean;
  }>({ auth, user: null, isRestoring: true });
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cleanupFailedFor, setCleanupFailedFor] = useState<AuthPort | null>(null);
  const restore = useRef<{ auth: AuthPort; promise: Promise<AuthUser | null> } | null>(null);
  const signOutPending = useRef<AuthPort | null>(null);
  const cleanupTarget = useRef<{ auth: AuthPort; user: AuthUser } | null>(null);
  const cleanupPending = useRef<{ auth: AuthPort; user: AuthUser } | null>(null);
  const mounted = useRef(false);
  const currentAuth = useRef(auth);
  const currentOnSignedOut = useRef(onSignedOut);
  currentAuth.current = auth;
  currentOnSignedOut.current = onSignedOut;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setSession({ auth, user: null, isRestoring: true });
    setIsSigningOut(false);
    setErrorMessage(null);
    setCleanupFailedFor(null);
    signOutPending.current = null;
    cleanupTarget.current = null;
    cleanupPending.current = null;
    if (restore.current?.auth !== auth) {
      restore.current = { auth, promise: auth.currentUser() };
    }
    void restore.current.promise
      .then((currentUser) => {
        if (active && mounted.current && currentAuth.current === auth) {
          setSession({ auth, user: currentUser, isRestoring: false });
        }
      })
      .catch((error: unknown) => {
        if (active && mounted.current && currentAuth.current === auth) {
          setSession({ auth, user: null, isRestoring: false });
          setErrorMessage(safeAuthMessage(error));
        }
      });
    return () => {
      active = false;
    };
  }, [auth]);

  function cleanLocalDraft(target: { auth: AuthPort; user: AuthUser }) {
    if (cleanupPending.current === target) return;
    const cleanup = currentOnSignedOut.current;
    if (cleanup === undefined) {
      cleanupTarget.current = null;
      setCleanupFailedFor(null);
      return;
    }

    cleanupTarget.current = target;
    cleanupPending.current = target;
    setCleanupFailedFor(null);
    void Promise.resolve()
      .then(() => cleanup(target.user))
      .then(() => {
        if (
          mounted.current
          && currentAuth.current === target.auth
          && cleanupTarget.current === target
        ) {
          cleanupTarget.current = null;
          setCleanupFailedFor(null);
        }
      })
      .catch(() => {
        if (
          mounted.current
          && currentAuth.current === target.auth
          && cleanupTarget.current === target
        ) {
          setCleanupFailedFor(target.auth);
        }
      })
      .finally(() => {
        if (cleanupPending.current === target) cleanupPending.current = null;
      });
  }

  async function signOut() {
    if (signOutPending.current === auth) return;
    const operationAuth = auth;
    signOutPending.current = operationAuth;
    setIsSigningOut(true);
    setErrorMessage(null);
    const signedOutUser = session.auth === operationAuth ? session.user : null;
    try {
      await auth.signOut();
      if (mounted.current && currentAuth.current === operationAuth) {
        setSession({ auth: operationAuth, user: null, isRestoring: false });
        setIsSigningOut(false);
        if (signedOutUser !== null) {
          cleanLocalDraft({ auth: operationAuth, user: signedOutUser });
        }
      }
    } catch (error) {
      if (mounted.current && currentAuth.current === operationAuth) {
        setErrorMessage(safeAuthMessage(error));
      }
    } finally {
      if (signOutPending.current === operationAuth) signOutPending.current = null;
      if (mounted.current && currentAuth.current === operationAuth) {
        setIsSigningOut(false);
      }
    }
  }

  const isCurrentSession = session.auth === auth;
  if (!isCurrentSession || session.isRestoring) {
    return <main className="auth-loading" role="status">正在恢复登录状态…</main>;
  }

  if (session.user === null) {
    return (
      <>
        <AuthPage
          auth={auth}
          initialError={errorMessage}
          onAuthenticated={(authenticatedUser) => {
            setErrorMessage(null);
            if (currentAuth.current === auth) {
              setSession({ auth, user: authenticatedUser, isRestoring: false });
            }
          }}
        />
        {cleanupFailedFor === auth && (
          <aside className="auth-cleanup-notice">
            <p role="alert">已退出，但本机草稿清理失败。可重试清理，不会重新登录。</p>
            <button
              type="button"
              onClick={() => {
                const target = cleanupTarget.current;
                if (target !== null && target.auth === auth) cleanLocalDraft(target);
              }}
            >
              重试清理本机草稿
            </button>
          </aside>
        )}
      </>
    );
  }

  return (
    <>
      <div className="auth-session-bar">
        <button type="button" disabled={isSigningOut} onClick={() => void signOut()}>
          {isSigningOut ? '正在退出…' : '退出登录'}
        </button>
        {errorMessage && <p className="auth-error" role="alert">{errorMessage}</p>}
      </div>
      {typeof children === 'function' ? children(session.user) : children}
    </>
  );
}
