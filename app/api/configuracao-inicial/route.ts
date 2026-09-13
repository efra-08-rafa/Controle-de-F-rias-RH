import { NextResponse } from 'next/server';
import { criarConfiguracaoInicial, utilizadoresConfigurados, type Papel } from '@/lib/server-auth';

export async function GET(){
  try { return NextResponse.json({ configurado: await utilizadoresConfigurados() }); }
  catch { return NextResponse.json({ configurado:false, erro:'Não foi possível verificar a configuração.' },{status:500}); }
}

export async function POST(request:Request){
  try {
    const body=await request.json();
    const contas=Array.isArray(body?.contas)?body.contas:[];
    await criarConfiguracaoInicial(contas.map((c:Record<string,unknown>)=>({login:String(c.login||''),nome:String(c.nome||''),papel:String(c.papel||'') as Papel,password:String(c.password||'')})));
    return NextResponse.json({ok:true});
  } catch(error) {
    const message=error instanceof Error?error.message:'';
    const status=message==='JA_CONFIGURADO'?409:400;
    return NextResponse.json({ok:false,erro:message==='JA_CONFIGURADO'?'A configuração inicial já foi concluída.':'Dados inválidos para a configuração inicial.'},{status});
  }
}
