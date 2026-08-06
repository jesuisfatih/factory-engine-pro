import { useCallback, useEffect, useState } from 'react';

interface VersionManifest {
  buildId?: string;
}

export function useAppVersion() {
  const [remoteBuildId, setRemoteBuildId] = useState<string | null>(null);

  const check = useCallback(async () => {
    try {
      const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
      const response = await fetch(`${base}version.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' },
      });
      if (!response.ok) return;
      const manifest = await response.json() as VersionManifest;
      if (manifest.buildId && manifest.buildId !== __APP_BUILD_ID__) setRemoteBuildId(manifest.buildId);
    } catch {
      // Version checks must never interrupt staff work.
    }
  }, []);

  useEffect(() => {
    void check();
    const interval = window.setInterval(() => void check(), 60_000);
    const onFocus = () => void check();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [check]);

  const activate = useCallback(() => {
    if (!remoteBuildId) return;
    const url = new URL(window.location.href);
    url.searchParams.set('__build', remoteBuildId);
    window.location.replace(url.toString());
  }, [remoteBuildId]);

  return { updateAvailable: Boolean(remoteBuildId), activate };
}
