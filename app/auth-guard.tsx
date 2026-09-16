'use client';

import { useEffect } from 'react';

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    let ativo = true;
    const sincronizar = async () => {
      if (!ativo || !navigator.onLine) return;
      try {
        await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' });
      } catch {}
    };
    sincronizar();
    window.addEventListener('online', sincronizar);
    const intervalo = window.setInterval(sincronizar, 60_000);
    return () => { ativo = false; window.removeEventListener('online', sincronizar); window.clearInterval(intervalo); };
  }, []);

  return <>{children}</>;
}
