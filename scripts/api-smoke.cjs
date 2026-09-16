const base = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000';
const admin = { id: process.env.ADMIN_USER_ID || 'ekimane', password: process.env.ADMIN_PASSWORD || '2026' };
const outro = { id: process.env.OUTRO_USER_ID || 'ifloma', password: process.env.OUTRO_PASSWORD || '0000' };

function assert(condition, message) { if (!condition) throw new Error(message); }
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, options);
  const text = await response.text();
  let body = null; try { body = text ? JSON.parse(text) : null; } catch {}
  return { response, body };
}
function cookieFrom(response) {
  const cookies = response.headers.getSetCookie?.() || [];
  return cookies.map(value => value.split(';', 1)[0]).join('; ');
}

async function login(credentials) {
  const { response, body } = await request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(credentials) });
  assert(response.ok && body?.ok, `Login falhou: ${response.status} ${JSON.stringify(body)}`);
  return cookieFrom(response);
}

(async () => {
  const cookie = await login(admin);
  const auth = { headers: { cookie } };

  const departments = await request('/api/departamentos', auth);
  assert(departments.response.ok && Array.isArray(departments.body?.departamentos), 'GET departamentos falhou.');
  assert(departments.body.departamentos.length >= 1, 'Não existem departamentos iniciais.');
  const department = departments.body.departamentos[0];

  const processNumber = `CI-${Date.now()}`;
  const employee = await request('/api/funcionarios', { method: 'POST', ...auth, headers: { ...auth.headers, 'content-type': 'application/json' }, body: JSON.stringify({ processo: processNumber, nome: 'Funcionário CI', nuit: '999999999', bi: 'CI-TEST', contacto: '840000000', departamentoId: department.id, tipoContrato: 'Permanente', admissao: '2026-01-01', fimContrato: null }) });
  assert(employee.response.status === 201 && employee.body?.funcionario?.id, `POST funcionário falhou: ${employee.response.status} ${JSON.stringify(employee.body)}`);

  const vacation = await request('/api/ferias', { method: 'POST', ...auth, headers: { ...auth.headers, 'content-type': 'application/json' }, body: JSON.stringify({ funcionarioId: employee.body.funcionario.id, inicio: '2026-09-20', dias: 5 }) });
  assert(vacation.response.status === 201 && vacation.body?.ferias?.fim === '2026-09-24', `Cálculo de férias falhou: ${vacation.response.status} ${JSON.stringify(vacation.body)}`);

  const listed = await request('/api/funcionarios', auth);
  assert(listed.response.ok && listed.body.funcionarios.some(x => x.processo === processNumber && x.nuit === '999999999' && x.bi === 'CI-TEST'), 'Funcionário não foi persistido corretamente.');

  const outroCookie = await login(outro);
  const forbidden = await request('/api/funcionarios', { headers: { cookie: outroCookie } });
  assert(forbidden.response.status === 403, `Permissão de Outro deveria ser 403, recebeu ${forbidden.response.status}.`);

  console.log('API smoke test: OK');
})().catch(error => { console.error(`API smoke test: FALHOU — ${error.message}`); process.exit(1); });
