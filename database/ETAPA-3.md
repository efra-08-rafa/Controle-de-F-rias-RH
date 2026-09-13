# Etapa 3 — arquitetura local-first

## Estado atual

- 3.3 PostgreSQL + camada de acesso: preparado em `lib/server-db.ts`.
- 3.4 Funcionários: API protegida, CRUD e auditoria preparados.
- 3.5 Férias: API protegida de consulta, criação, alteração e remoção.
- 3.6 Utilizadores: API administrativa e hash de palavra-passe com scrypt; a autenticação inicial por variáveis de ambiente continua durante a transição.
- 3.7 SQLite: `better-sqlite3` + `database/sqlite-schema.sql` como banco local atual do software servidor/instalável.
- 3.8 Sincronização: contrato, fila/eventos, endpoint protegido e deteção de conflito por versão preparados.
- 3.9 Auditoria: registo de criação, alteração e remoção e API de consulta para Administrador.
- 3.10 Conflitos/recuperação: modelo de versões, operação idempotente e estados PROCESSADO/CONFLITO/ERRO preparados.

## Banco atual

`DATABASE_MODE=local` é o padrão. Os dados persistentes ficam em SQLite no caminho definido por `LOCAL_DATABASE_PATH`.

## Migração futura

Para PostgreSQL, mudar o modo para `postgres` e fornecer `DATABASE_URL` no ambiente do servidor. O código de negócio usa a camada `server-db` e não deve abrir uma ligação direta ao banco.

## Regras de segurança

- Nenhuma senha real ou chave é guardada no GitHub.
- O navegador não define permissões.
- APIs verificam sessão e papel no servidor.
- Palavras-passe do banco local são armazenadas apenas como hash.
- Operações de sincronização usam `operacaoId` para evitar processamento duplicado.
- Conflitos não sobrescrevem silenciosamente dados.

## Testes de aceitação da Etapa 3.10

1. Criar funcionário → deve persistir após reiniciar a aplicação.
2. Alterar funcionário → `versao` deve aumentar.
3. Remover funcionário → deve ficar inativo e gerar auditoria.
4. Registar férias → deve persistir no banco local e gerar auditoria.
5. Reenviar o mesmo `operacaoId` → não deve duplicar o evento.
6. Enviar versão local diferente da versão atual → deve retornar `CONFLITO`.
7. Falha de sincronização → deve retornar `ERRO` sem apagar a operação pendente.
8. Utilizador sem permissão → API deve retornar `403`.
9. Sem sessão → API deve retornar `401`.
10. Reiniciar o software → os dados locais devem continuar disponíveis.
