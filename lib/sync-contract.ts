export type SyncEntity = 'funcionario' | 'ferias' | 'utilizador';
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
