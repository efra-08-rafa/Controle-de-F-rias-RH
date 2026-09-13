import 'use client';

export type SyncOperation = 'create' | 'update' | 'delete';
export type SyncEntity = 'funcionario' | 'ferias' | 'utilizador';

export type PendingSync = {
  id: string;
  entity: SyncEntity;
  operation: SyncOperation;
  entityId: string;
  payload: unknown;
  createdAt: string;
  attempts: number;
  lastError?: string;
};

const DB_NAME = 'controle-ferias-rh-local';
const DB_VERSION = 1;
const STORE_DATA = 'dados';
const STORE_SYNC = 'fila-sincronizacao';

function openDb(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.reject(new Error('IndexedDB não está disponível neste dispositivo.'));
  }

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_DATA)) {
        db.createObjectStore(STORE_DATA, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_SYNC)) {
        db.createObjectStore(STORE_SYNC, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Não foi possível abrir o banco local.'));
  });
}

export async function guardarLocal<T>(key: string, value: T) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readwrite');
    tx.objectStore(STORE_DATA).put({ key, value, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function lerLocal<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readonly');
    const request = tx.objectStore(STORE_DATA).get(key);
    request.onsuccess = () => resolve(request.result?.value ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function apagarLocal(key: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_DATA, 'readwrite');
    tx.objectStore(STORE_DATA).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function adicionarFilaSincronizacao(item: Omit<PendingSync, 'id' | 'createdAt' | 'attempts'>) {
  const db = await openDb();
  const registro: PendingSync = {
    ...item,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempts: 0,
  };

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC, 'readwrite');
    tx.objectStore(STORE_SYNC).put(registro);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function listarFilaSincronizacao(): Promise<PendingSync[]> {
  const db = await openDb();
  return new Promise<PendingSync[]>((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC, 'readonly');
    const request = tx.objectStore(STORE_SYNC).getAll();
    request.onsuccess = () => resolve(request.result as PendingSync[]);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

export async function removerDaFila(id: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC, 'readwrite');
    tx.objectStore(STORE_SYNC).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function atualizarTentativa(id: string, error: string) {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_SYNC, 'readwrite');
    const store = tx.objectStore(STORE_SYNC);
    const request = store.get(id);
    request.onsuccess = () => {
      const atual = request.result as PendingSync | undefined;
      if (atual) store.put({ ...atual, attempts: atual.attempts + 1, lastError: error });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
