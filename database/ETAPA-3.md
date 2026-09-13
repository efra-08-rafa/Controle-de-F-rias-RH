# Etapa 3 — arquitetura local-first

## Estado atual

- 3.3 PostgreSQL + camada de acesso: preparado em `lib/server-db.ts`.
- 3.4 Funcionários: API protegida, CRUD, SQLite e auditoria.
- 3.5 Férias: API protegida de consulta, criação, alteração e remoção.
- 3.6 Utilizadores: API administrativa e passwords armazenadas como hash scrypt.
- 3.7 SQLite: `better-sqlite3` + `database/sqlite-schema.sql` como banco local do software servidor/instalável.
- 3.8 Sincronização: o `/api/sync` agora aplica CREATE, UPDATE e DELETE ao banco, verifica versões, é idempotente e grava conflitos.
- 3.9 Auditoria: operações CRUD e sincronizações ficam registadas.
- 3.10 Conflitos/recuperação: existem versões, `operacaoId`, estados PROCESSADO/CONFLITO/ERRO e tabela de conflitos.

## Banco atual

`DATABASE_MODE=local` é o padrão. Os dados persistentes ficam em SQLite no caminho definido por `LOCAL_DATABASE_PATH`.

## Sincronização real

Cada evento enviado para `/api/sync` é validado, verificado contra a versão do servidor e, quando compatível, aplicado numa transação. `CREATE` cria o registo, `UPDATE` atualiza e incrementa a versão, e `DELETE` remove/desativa conforme a entidade. O mesmo `operacaoId` não é aplicado duas vezes. Conflitos ficam registados em `sincronizacao_conflitos` e não sobrescrevem silenciosamente o servidor.

## Migração futura

Para PostgreSQL, mudar o modo para `postgres` e fornecer `DATABASE_URL` no ambiente do servidor. O código de negócio usa a camada `server-db` e não deve abrir uma ligação direta ao banco.

## Regras de segurança

- Nenhuma senha real ou chave é guardada no GitHub.
- O navegador não define permissões.
- APIs verificam sessão e papel no servidor.
- Passwords do banco local são armazenadas apenas como hash.
- Operações de sincronização usam `operacaoId` para evitar processamento duplicado.
- Conflitos não sobrescrevem silenciosamente dados.

## Testes de aceitação da Etapa 3.10

1. Criar funcionário → persistência após reiniciar: **a executar pelo CI/aplicação**.
2. Alterar funcionário → `versao` deve aumentar: **a executar pelo CI/aplicação**.
3. Remover funcionário → deve ficar inativo e gerar auditoria: **a executar pelo CI/aplicação**.
4. Registar férias → persistência e auditoria: **a executar pelo CI/aplicação**.
5. Reenviar o mesmo `operacaoId` → não deve duplicar o evento: **a executar pelo CI/aplicação**.
6. Versão local diferente → deve retornar `CONFLITO`: **implementado; teste de integração pendente**.
7. Falha de sincronização → deve retornar `ERRO` sem apagar a operação pendente: **implementado no contrato; teste de integração pendente**.
8. Utilizador sem permissão → API deve retornar `403`: **implementado; teste de integração pendente**.
9. Sem sessão → API deve retornar `401`: **implementado; teste de integração pendente**.
10. Reiniciar software → dados locais continuam disponíveis: **a validar no ambiente instalável**.

O repositório possui `.github/workflows/ci.yml` para executar `npm ci` e `npm run build` automaticamente em `main` e em pull requests.
