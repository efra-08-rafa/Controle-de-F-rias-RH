const departamentos = [
  "Administração",
  "Serração",
  "Vendas",
  "Carpintaria",
  "Manutenção",
  "Mecânica",
  "Seguranças",
];

export default function Home() {
  return (
    <>
      <header className="header">
        <div className="container header-inner">
          <div className="brand">Controlo de Férias RH</div>
          <nav className="nav">
            <a href="/">Painel</a>
            <a href="/funcionarios">Funcionários</a>
            <a href="/ferias">Férias</a>
            <a href="/relatorios">Relatórios</a>
            <a href="/configuracoes">Configurações</a>
          </nav>
        </div>
      </header>

      <main>
        <div className="container">
          <section className="hero">
            <h1>Painel de Recursos Humanos</h1>
            <p>Base inicial para gestão de funcionários e controlo de férias.</p>
          </section>

          <section className="grid">
            <div className="card"><span className="card-label">Total de funcionários</span><span className="card-value">0</span></div>
            <div className="card"><span className="card-label">Em férias</span><span className="card-value">0</span></div>
            <div className="card"><span className="card-label">Férias próximas</span><span className="card-value">0</span></div>
            <div className="card"><span className="card-label">Férias vencidas</span><span className="card-value">0</span></div>
          </section>

          <section className="section">
            <h2>Departamentos</h2>
            <div className="department-list">
              {departamentos.map((departamento) => (
                <div className="department" key={departamento}>{departamento}</div>
              ))}
            </div>
          </section>
        </div>
      </main>
    </>
  );
}
