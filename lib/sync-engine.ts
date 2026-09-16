import { adicionarFilaSincronizacao, listarFilaSincronizacao, removerDaFila, atualizarTentativa } from './offline-db';

const SYNC_API = '/api/sync';

export async function registarAlteracaoOffline(entity: 'funcionario' | 'ferias' | 'utilizador', operation: 'create' | 'update' | 'delete', entityId: string, payload: unknown) {
  await adicionarFilaSincronizacao({ entity, operation, entityId, payload });
}

export async function sincronizarAgora() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { ok: false, sincronizados: 0, pendentes: 0, motivo: 'offline' as const };
  const fila = await listarFilaSincronizacao();
  let sincronizados = 0;
  let conflitos = 0;
  for (const item of fila) {
    try {
      const evento = {
        operacaoId: item.id,
        dispositivoId: `web-${crypto.randomUUID()}`,
        entidade: item.entity,
        entidadeId: item.entityId,
        operacao: item.operation.toUpperCase(),
        versaoLocal: 1,
        payload: item.payload,
      };
      const resposta = await fetch(SYNC_API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ eventos: [evento] }) });
      const dados = await resposta.json().catch(() => null);
      if (!resposta.ok) throw new Error(dados?.erro || `Sincronização recusada (${resposta.status}).`);
      const resultado = dados?.resultados?.[0];
      if (resultado?.status === 'CONFLITO') { conflitos += 1; await atualizarTentativa(item.id, 'Conflito de versão no servidor.'); continue; }
      if (resultado?.status !== 'PROCESSADO') throw new Error(resultado?.mensagem || 'O servidor não confirmou a sincronização.');
      await removerDaFila(item.id);
      sincronizados += 1;
    } catch (error) {
      await atualizarTentativa(item.id, error instanceof Error ? error.message : 'Erro desconhecido');
    }
  }
  return { ok: true, sincronizados, conflitos, pendentes: fila.length - sincronizados };
}

export function iniciarSincronizacaoAutomatica() {
  if (typeof window === 'undefined') return () => undefined;
  const sincronizar = () => { void sincronizarAgora(); };
  window.addEventListener('online', sincronizar);
  const intervalo = window.setInterval(sincronizar, 60_000);
  sincronizar();
  return () => { window.removeEventListener('online', sincronizar); window.clearInterval(intervalo); };
}
