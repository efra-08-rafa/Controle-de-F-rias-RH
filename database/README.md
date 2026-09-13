# Arquitetura de dados

O sistema foi preparado para funcionar em dois modos:

- **Online:** PostgreSQL central através de API segura.
- **Offline:** SQLite local no software instalável.
- **Sincronização:** alterações offline entram numa fila e são enviadas ao servidor quando a ligação regressa.
- **Autorização:** quando existe conexão, a API valida a sessão e a permissão no servidor antes de aceitar alterações.
- **Auditoria:** criação, alteração, eliminação e sincronização ficam registadas.

## Regras de sincronização

1. Cada registro possui um identificador estável.
2. Cada alteração possui uma versão.
3. Cada operação de sincronização possui um `operacao_id` único para impedir duplicações.
4. O servidor é a fonte de verdade no modo online.
5. Conflitos não devem ser apagados automaticamente; ficam registados como `CONFLITO` para tratamento controlado.
6. O banco local nunca deve guardar palavras-passe.

## Compatibilidade futura

A aplicação deve comunicar com o banco através de uma camada de serviço/API. Assim, se a empresa já possuir SQL Server, MySQL, Oracle ou outro PostgreSQL, podemos criar um adaptador sem alterar as páginas da aplicação.
