'use client';

import { useEffect, useMemo, useState } from 'react';

type HistoricoFerias = {
  inicio: string;
  fim: string;
  dias: number;
  estado: string;
};

type Funcionario = {
  processo: string;
  nome: string;
  contacto: string;
  departamento: string;
  tipoContrato: 'Permanente' | 'Contratado';
  admissao: string;
  fimContrato: string;
  diasUtilizados: number;
  inicioFerias: string;
  fimFerias: string;
  historico: HistoricoFerias[];
};

const CHAVE_STORAGE = 'controle-ferias-rh-funcionarios';

function calcularDireito(funcionario: Funcionario) {
  if (funcionario.tipoContrato === 'Permanente') return 30;
  if (!funcionario.admissao || !funcionario.fimContrato) return 0;

  const inicio = new Date(`${funcionario.admissao}T00:00:00`);
  const fim = new Date(`${funcionario.fimContrato}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim < inicio) return 0;

  const meses = (fim.getFullYear() - inicio.getFullYear()) * 12 + (fim.getMonth() - inicio.getMonth());
  return Math.max(0, meses + 1);
}

function calcularDias(inicio: string, fim: string) {
  if (!inicio || !fim) return 0;
  const dataInicio = new Date(`${inicio}T00:00:00`);
  const dataFim = new Date(`${fim}T00:00:00`);
  if (Number.isNaN(dataInicio.getTime()) || Number.isNaN(dataFim.getTime()) || dataFim < dataInicio) return 0;
  return Math.floor((dataFim.getTime() - dataInicio.getTime()) / 86400000) + 1;
}

function formatarData(data: string) {
  if (!data) return '—';
  const [ano, mes, dia] = data.split('-');
  return `${dia}/${mes}/${ano}`;
}

function calcularEstado(inicio: string, fim: string) {
  if (!inicio || !fim) return 'Disponível';
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioData = new Date(`${inicio}T00:00:00`);
  const fimData = new Date(`${fim}T00:00:00`);

  if (fimData < hoje) return 'Férias terminadas';
  if (hoje >= inicioData && hoje <= fimData) return 'Em férias';

  const limite = new Date(hoje);
  limite.setDate(limite.getDate() + 7);
  if (inicioData > hoje && inicioData <= limite) return 'Férias próximas';
  return 'Disponível';
}

export default function FeriasPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [processoSelecionado, setProcessoSelecionado] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  useEffect(() => {
    try {
      const dados = localStorage.getItem(CHAVE_STORAGE);
      if (dados) setFuncionarios(JSON.parse(dados));
    } catch {
      setErro('Não foi possível carregar os funcionários guardados neste navegador.');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(CHAVE_STORAGE, JSON.stringify(funcionarios));
  }, [funcionarios]);

  const funcionario = useMemo(
    () => funcionarios.find((item) => item.processo === processoSelecionado),
    [funcionarios, processoSelecionado]
  );

  const direito = funcionario ? calcularDireito(funcionario) : 0;
  const utilizados = funcionario?.diasUtilizados ?? 0;
  const restantes = Math.max(0, direito - utilizados);
  const dias = calcularDias(inicio, fim);
  const estadoPreview = calcularEstado(inicio, fim);

  function registarFerias() {
    setMensagem('');
    setErro('');

    if (!funcionario) {
      setErro('Selecione um funcionário.');
      return;
    }
    if (!inicio || !fim) {
      setErro('Informe a data de início e a data de fim das férias.');
      return;
    }
    if (new Date(`${fim}T00:00:00`) < new Date(`${inicio}T00:00:00`)) {
      setErro('A data de fim não pode ser anterior à data de início.');
      return;
    }
    if (dias <= 0) {
      setErro('O período de férias é inválido.');
      return;
    }
    if (dias > restantes) {
      setErro(`O funcionário tem apenas ${restantes} dia(s) restante(s).`);
      return;
    }

    const novoHistorico: HistoricoFerias = {
      inicio,
      fim,
      dias,
      estado: estadoPreview,
    };

    setFuncionarios((lista) =>
      lista.map((item) => {
        if (item.processo !== funcionario.processo) return item;
        return {
          ...item,
          diasUtilizados: item.diasUtilizados + dias,
          inicioFerias: inicio,
          fimFerias: fim,
          historico: [...(item.historico || []), novoHistorico],
        };
      })
    );

    setInicio('');
    setFim('');
    setMensagem(`Férias registadas para ${funcionario.nome}. ${dias} dia(s) adicionados ao histórico.`);
  }

  return (
    <main>
      <div className="container">
        <section className="hero">
          <h1>Controle de Férias</h1>
          <p>Registe férias, acompanhe dias utilizados e consulte o histórico de cada funcionário.</p>
        </section>

        <section className="section card">
          <h2>Registar férias</h2>
          <div className="form-grid">
            <label>
              Funcionário
              <select value={processoSelecionado} onChange={(e) => { setProcessoSelecionado(e.target.value); setMensagem(''); setErro(''); }}>
                <option value="">Selecione o funcionário</option>
                {funcionarios.map((item) => (
                  <option key={item.processo} value={item.processo}>
                    {item.processo} — {item.nome}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Início das férias
              <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </label>

            <label>
              Fim das férias
              <input type="date" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} />
            </label>
          </div>

          {funcionario && (
            <div className="grid" style={{ marginTop: 20 }}>
              <div className="card"><span className="card-label">Departamento</span><strong className="card-value" style={{ fontSize: 20 }}>{funcionario.departamento}</strong></div>
              <div className="card"><span className="card-label">Tipo de contrato</span><strong className="card-value" style={{ fontSize: 20 }}>{funcionario.tipoContrato}</strong></div>
              <div className="card"><span className="card-label">Direito anual/contrato</span><strong className="card-value">{direito} <small>dias</small></strong></div>
              <div className="card"><span className="card-label">Dias restantes</span><strong className="card-value">{restantes} <small>dias</small></strong></div>
            </div>
          )}

          <div className="card" style={{ marginTop: 16, background: '#f8fafc' }}>
            <strong>Resumo do novo período</strong>
            <p style={{ marginBottom: 6 }}>Dias de férias: <strong>{dias}</strong></p>
            <p style={{ margin: 0 }}>Estado previsto: <strong>{estadoPreview}</strong></p>
          </div>

          {erro && <p className="form-message" style={{ color: '#dc2626' }}>{erro}</p>}
          {mensagem && <p className="form-message">{mensagem}</p>}

          <button className="primary-button" type="button" onClick={registarFerias} disabled={funcionarios.length === 0}>
            Registar férias
          </button>

          {funcionarios.length === 0 && (
            <p className="empty-state">Ainda não existem funcionários cadastrados. Cadastre primeiro um funcionário em Funcionários.</p>
          )}
        </section>

        <section className="section">
          <h2>Resumo dos funcionários</h2>
          {funcionarios.length === 0 ? (
            <p className="empty-state">Nenhum funcionário disponível.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Processo</th>
                    <th>Nome</th>
                    <th>Departamento</th>
                    <th>Direito</th>
                    <th>Utilizados</th>
                    <th>Restantes</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionarios.map((item) => {
                    const direitoItem = calcularDireito(item);
                    const restantesItem = Math.max(0, direitoItem - item.diasUtilizados);
                    const estadoItem = calcularEstado(item.inicioFerias, item.fimFerias);
                    return (
                      <tr key={item.processo}>
                        <td>{item.processo}</td>
                        <td>{item.nome}</td>
                        <td>{item.departamento}</td>
                        <td>{direitoItem} dias</td>
                        <td>{item.diasUtilizados} dias</td>
                        <td>{restantesItem} dias</td>
                        <td>{estadoItem}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="section">
          <h2>Histórico de férias</h2>
          {funcionarios.filter((item) => item.historico?.length).length === 0 ? (
            <p className="empty-state">O histórico aparecerá aqui quando houver férias registadas.</p>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Processo</th>
                    <th>Funcionário</th>
                    <th>Período</th>
                    <th>Dias</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {funcionarios.flatMap((item) =>
                    (item.historico || []).map((registro, index) => (
                      <tr key={`${item.processo}-${index}-${registro.inicio}`}>
                        <td>{item.processo}</td>
                        <td>{item.nome}</td>
                        <td>{formatarData(registro.inicio)} — {formatarData(registro.fim)}</td>
                        <td>{registro.dias}</td>
                        <td>{calcularEstado(registro.inicio, registro.fim)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="section card">
          <h2>Regras de férias</h2>
          <p><strong>Permanente:</strong> 30 dias de férias por ano.</p>
          <p><strong>Contratado:</strong> 1 dia de férias por cada mês de contrato.</p>
          <p style={{ marginBottom: 0 }}>O sistema calcula os dias do período automaticamente e impede o registo acima do saldo disponível.</p>
        </section>
      </div>
    </main>
  );
}
