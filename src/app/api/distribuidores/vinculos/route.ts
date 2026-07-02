import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';
import { ensureDistTables } from '@/lib/distribuidores-tables';
import { invalidarCacheVinculos } from '@/lib/dados-externos';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    await ensureDistTables();
    const pool = await getPool();
    const result = await pool.request().query(
      `SELECT VENDEDOR_VINCULADO as vendedor_vinculado, VENDEDOR_PRINCIPAL as vendedor_principal
       FROM [TI-PAINELCOMISSAO_DISTRIBUIDORES_VINCULOS]`
    );
    return NextResponse.json(result.recordset);
  } catch (e) {
    console.error('[distribuidores/vinculos GET]', e);
    return NextResponse.json({ error: 'Erro ao buscar' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario || !['ADM', 'GESTOR'].includes(usuario.cargo)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body: Array<{ vendedor_vinculado: string; vendedor_principal: string }> = await req.json();

  try {
    await ensureDistTables();
    const pool = await getPool();
    await pool.request().query(`DELETE FROM [TI-PAINELCOMISSAO_DISTRIBUIDORES_VINCULOS]`);
    for (const row of body) {
      const vinculado = row.vendedor_vinculado?.trim().toUpperCase();
      const principal = row.vendedor_principal?.trim().toUpperCase();
      if (!vinculado || !principal || vinculado === principal) continue;
      await pool.request()
        .input('vv', sql.VarChar, vinculado)
        .input('vp', sql.VarChar, principal)
        .query(`INSERT INTO [TI-PAINELCOMISSAO_DISTRIBUIDORES_VINCULOS] (VENDEDOR_VINCULADO, VENDEDOR_PRINCIPAL) VALUES (@vv, @vp)`);
    }
    invalidarCacheVinculos();
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[distribuidores/vinculos PUT]', e);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
