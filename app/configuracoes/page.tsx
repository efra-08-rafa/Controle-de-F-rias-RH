import Link from 'next/link';

const itens = [
  {
    titulo: 'Utilizadores e acessos',
    descricao: 'Gerir contas, papéis e acessos ao sistema.',
    href: '/configuracoes/utilizadores',
  },
  {
    titulo: 'Departamentos',
    descricao: 'Consultar departamentos e a distribuição dos funcionários.',
    href: '/departamentos',
  },
  {
    titulo: 'Relatórios',
    descricao: 'Consultar saldos, férias utilizadas e informação anual.',
    href: '/relatorios',
  },
];

export default function ConfiguracoesPage() {
  return (
    <main>
      <div className="container" style={{ paddingTop: 24, paddingBottom: 40 }}>
        <h1>Configurações</h1>
        <p style={{ marginTop: 8, color: '#475569' }}>
          Gestão administrativa do sistema de controlo de férias.
        </p>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16,
            marginTop: 24,
          }}
        >
          {itens.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'block',
                padding: 20,
                border: '1px solid #cbd5e1',
                borderRadius: 12,
                background: '#fff',
                color: '#111827',
                textDecoration: 'none',
              }}
            >
              <strong style={{ display: 'block', fontSize: 18 }}>{item.titulo}</strong>
              <span style={{ display: 'block', marginTop: 8, color: '#475569' }}>{item.descricao}</span>
              <span style={{ display: 'inline-block', marginTop: 14, fontWeight: 700 }}>Abrir →</span>
            </Link>
          ))}
        </section>

        <section
          style={{
            marginTop: 24,
            padding: 20,
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            background: '#f8fafc',
          }}
        >
          <h2 style={{ margin: 0, fontSize: 20 }}>Estado do sistema</h2>
          <p style={{ margin: '10px 0 0', color: '#334155' }}>
            Os dados principais são geridos através das APIs do sistema e do banco local SQLite.
            A autenticação, permissões e auditoria são controladas no servidor.
          </p>
        </section>
      </div>
    </main>
  );
}
