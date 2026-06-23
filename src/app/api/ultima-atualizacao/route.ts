import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';
import { addSetoresGlobais } from '@/lib/setores';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const pool = await getPool();
    const r = pool.request();
    const w = addSetoresGlobais(r, 'WHERE PDV_DATA IS NOT NULL');
    const result = await r.query(`
      SELECT MAX(PDV_DATA) as ultima_atualizacao
      FROM [TI-COMERCIAL_45-VendaPorSetor]
      ${w}
    `);
    return NextResponse.json({
      ultima_atualizacao: result.recordset[0]?.ultima_atualizacao ?? null,
    });
  } catch (err) {
    console.error('[ultima-atualizacao]', err);
    return NextResponse.json({ ultima_atualizacao: null });
  }
}
