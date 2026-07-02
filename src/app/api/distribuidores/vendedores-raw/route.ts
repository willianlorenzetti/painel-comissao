import { NextRequest, NextResponse } from 'next/server';
import { getUsuario } from '@/lib/permissions';
import { getDistribuidoresNomesRaw } from '@/lib/dados-externos';

// Lista bruta dos representantes Distribuidores (sem aplicar vínculo), usada só na
// tela de Configuração para montar os pares vinculado → principal.
export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const vendedores = await getDistribuidoresNomesRaw();
    return NextResponse.json({ vendedores });
  } catch (e) {
    console.error('[distribuidores/vendedores-raw GET]', e);
    return NextResponse.json({ error: 'Erro ao buscar' }, { status: 500 });
  }
}
