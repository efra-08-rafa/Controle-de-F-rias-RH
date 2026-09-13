import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/server-db';
import { exigirPapel, respostaAutorizacao } from '@/lib/server-auth';
export const runtime='nodejs';
export async function GET(){try{await exigirPapel('Administrador');const r=await dbQuery(`select a.id,a.entidade,a.entidade_id as "entidadeId",a.operacao,a.utilizador_id as "utilizadorId",a.dispositivo_id as "dispositivoId",a.origem,a.antes,a.depois,a.criado_em as "criadoEm" from auditoria a order by a.criado_em desc limit 500`);return NextResponse.json({ok:true,auditoria:r.rows});}catch(e){if(e instanceof Error&&['UNAUTHORIZED','FORBIDDEN'].includes(e.message))return respostaAutorizacao(e);console.error('GET /api/auditoria',e);return NextResponse.json({ok:false,erro:'Não foi possível carregar a auditoria.'},{status:500});}}
