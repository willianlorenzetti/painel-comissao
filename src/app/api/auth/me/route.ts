import { NextRequest, NextResponse } from 'next/server';
import { getUsuario } from '@/lib/permissions';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  try {
    const usuario = await getUsuario(email);
    if (!usuario) {
      return NextResponse.json({ error: 'Usuário sem permissão neste painel' }, { status: 403 });
    }
    return NextResponse.json(usuario);
  } catch (error) {
    console.error('Erro ao buscar usuário:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
