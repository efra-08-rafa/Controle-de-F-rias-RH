'use client';

import { FormEvent, useMemo, useState } from 'react';

const DEPARTAMENTOS = [
  'Administração',
  'Serração',
  'Vendas',
  'Carpintaria',
  'Manutenção',
  'Mecânica',
  'Seguranças',
];

type TipoContrato = 'Permanente' | 'Contratado';

type Funcionario = {
  processo: string;
  nome: string;
  contacto: string;
  departamento: string;
  tipoContrato: TipoContrato;
  admissao: string;
  fimContrato: string;
};

function calcularDireito(funcionario: Funcionario) {
  if (funcionario.tipoContrato === 'Permanente') return 30;

  if (!funcionario.admissao || !funcionario.fimContrato) return 0;

  const inicio = new Date(`${funcionario.admissao}T00:00:00`);
  const fim = new Date(`${funcionario.fimContrato}T00:00:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || fim < inicio) return 0;

  const meses =
    (fim.getFullYear() - inicio.getFullYear()) * 12 +
    (fim.getMonth() - inicio.getMonth()) +
    (fim.getDate() >= inicio.getDate() ? 0 : -1) +
    1;

  return Math.max(0, meses);
}

export default function FuncionariosPage() {
  const [funcionarios, setFuncionarios] = useState<Funcionario[]>([]);
  const [form, setForm] = useState<Funcionario>({
    processo: '',
    nome: '',
    contacto: '',
    departamento: 'Administração',
    tipoContrato: 'Permanente',
    admissao: '',
    fimContrato: '',
  });
  const [mensagem, setMensagem] = useState('');

  const total = funcionarios.length;
  const permanentes = useMemo(
    () => funcionarios.filter((item) => item.tipoContrato === 'Permanente').length,
    [funcionarios],
  );

  function atualizarCampo(campo: keyof Funcionario, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function adicionarFuncionario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.processo.trim() || !form.nome.trim() || !form.contacto.trim() || !form.admissao) {
      setMensagem('Preencha Número de processo, Nome, Contacto e Data de admissão.');
      return;
    }

    if (form.tipoContrato === 'Contratado' && !form.fimContrato) {
      setMensagem('Para contrato Contratado, informe a data de fim do contrato.');
      return;
    }

    if (funcionarios.some((item) => item.processo === form.processo.trim())) {
      setMensagem('Já existe um funcionário com este Número de processo.');
      return;
    }

    setFuncionarios((atuais) => [
      ...atuais,
      { ...form, processo: form.processo.trim(), nome: form.nome.trim() },
    ]);
    setMensagem('Funcionário adicionado com sucesso.');
    setForm((atual) => ({
      ...atual,
      processo: '',
      nome: '',
      contacto: '',
      admissao: '',
      fimContrato: '',
    }));
  }

  function removerFuncionario(processo: string) {
    setFuncionarios((atuais) => atuais.filter((item) => item.processo !== processo));
  }

  return (
    <main>
      <div className="container">
        <div className="hero">
          <h1>Funcionários</h1>
          <p>Cadastro central dos funcionários e cálculo automático do direito a férias.</p>
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="card"><span className="card-label">Total de funcionários</span><strong className="card-value">{total}</strong></div>
          <div className="card"><span className="card-label">Permanentes</span><strong className="card-value">{permanentes}</strong></div>
          <div className="card"><span className="card-label">Contratados</span><strong className="card-value">{total - permanentes}</strong></div>
        </div>

        <section className="section">
          <h2>Novo funcionário</h2>
          <form onSubmit={adicionarFuncionario} className="card employee-form">
            <div className="form-grid">
              <label>Número de processo<input value={form.processo} onChange={(e) => atualizarCampo('processo', e.target.value)} placeholder="Ex.: 0025" /></label>
              <label>Nome<input value={form.nome} onChange={(e) => atualizarCampo('nome', e.target.value)} placeholder="Nome completo" /></label>
              <label>Contacto<input value={form.contacto} onChange={(e) => atualizarCampo('contacto', e.target.value)} placeholder="Telefone" /></label>
              <label>Departamento<select value={form.departamento} onChange={(e) => atualizarCampo('departamento', e.target.value)}>{DEPARTAMENTOS.map((departamento) => <option key={departamento}>{departamento}</option>)}</select></label>
              <label>Tipo de contrato<select value={form.tipoContrato} onChange={(e) => atualizarCampo('tipoContrato', e.target.value as TipoContrato)}><option>Permanente</option><option>Contratado</option></select></label>
              <label>Data de admissão<input type="date" value={form.admissao} onChange={(e) => atualizarCampo('admissao', e.target.value)} /></label>
              <label>Fim do contrato<input type="date" value={form.fimContrato} onChange={(e) => atualizarCampo('fimContrato', e.target.value)} disabled={form.tipoContrato === 'Permanente'} /></label>
            </div>
            <button className="primary-button" type="submit">Adicionar funcionário</button>
            {mensagem && <p className="form-message">{mensagem}</p>}
          </form>
        </section>

        <section className="section">
          <h2>Registo de funcionários</h2>
          {funcionarios.length === 0 ? (
            <div className="card empty-state">Ainda não existem funcionários cadastrados.</div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Processo</th><th>Nome</th><th>Contacto</th><th>Departamento</th><th>Contrato</th><th>Direito de férias</th><th>Ações</th></tr></thead>
                <tbody>
                  {funcionarios.map((funcionario) => {
                    const direito = calcularDireito(funcionario);
                    return (
                      <tr key={funcionario.processo}>
                        <td>{funcionario.processo}</td>
                        <td><strong>{funcionario.nome}</strong></td>
                        <td>{funcionario.contacto}</td>
                        <td>{funcionario.departamento}</td>
                        <td>{funcionario.tipoContrato}</td>
                        <td><strong>{direito} dias</strong></td>
                        <td><button className="danger-button" type="button" onClick={() => removerFuncionario(funcionario.processo)}>Remover</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="section">
          <h2>Regra de férias</h2>
          <div className="department-list">
            <div className="department"><strong>Permanente</strong><br />30 dias de férias por ano.</div>
            <div className="department"><strong>Contratado</strong><br />1 dia de férias por cada mês de contrato.</div>
          </div>
        </section>
      </div>
    </main>
  );
}
