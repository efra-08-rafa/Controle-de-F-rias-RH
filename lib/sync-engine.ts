import { adicionarFilaSincronizacao, listarFilaSincronizacao, removerDaFila, atualizarTentativa } from './offline-db';

const SYNC_API = '/api/sync';

export async function registarAlteracaoOffline(
  entity: 'funcionario' | 'ferias' | 'utilizador',
  operation: 'create' | 'update' | 'delete',
  entityId: string,
  payload: unknown,
) {
  await adicionarFilaSincronizacao({ entity, operation, entityId, payload });
}

export async function sincronizarAgora() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, sincronizados: 0, motivo: 'offline' as const };
  }

  const fila = await listarFilaSincronizacao();
  let sincronizados = 0;

  for (const item of fila) {
    try {
      const resposta = await fetch(SYNC_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item),
      });

      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => null);
        throw new Error(dados?.erro || `Sincronização recusada (${resposta.status}).`);
      }

      await removerDaFila(item.id);
      sincronizados += 1;
    } catch (error) {
      await atualizarTentativa(item.id, error instanceof Error ? error.message : 'Erro desconhecido');
    }
  }

  return { ok: true, sincronizados, pendentes: fila.length - sincronizados };
}

export function iniciarSincronizacaoAutomatica() {
  if (typeof window === 'undefined') return () => undefined;

  const sincronizar = () => { void sincronizarAgora(); };
  window.addEventListener('online', sincronizar);
  const intervalo = window.setInterval(sincronizar, 60_000);
  sincronizar();

  return () => {
    window.removeEventListener('online', sincronizar);
    window.clearInterval(intervalo);
  };
}
