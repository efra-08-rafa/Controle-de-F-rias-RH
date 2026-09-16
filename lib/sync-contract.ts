export type SyncEntity = 'departamento' | 'funcionario' | 'ferias';
export type SyncOperation = 'CREATE' | 'UPDATE' | 'DELETE';

export type SyncEnvelope = {
  operacaoId: string;
  dispositivoId: string;
  entidade: SyncEntity;
  entidadeId: string;
  operacao: SyncOperation;
  versaoLocal: number;
  criadoEm: string;
  payload: unknown;
};

export type SyncResult = {
  operacaoId: string;
  status: 'PROCESSADO' | 'CONFLITO' | 'ERRO';
  versaoServidor?: number;
  mensagem?: string;
};

export type SyncPullResult = {
  ok: boolean;
  eventos: Array<{
    id: string;
    entidade: SyncEntity;
    entidade_id: string;
    operacao: SyncOperation;
    antes?: unknown;
    depois?: unknown;
    criadoEm: string;
    dispositivoId?: string | null;
  }>;
  cursor: string;
};
