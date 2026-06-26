import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';
import { ensureFerrTables } from '@/lib/ferragens-tables';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  await getUsuario(email);

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get('ano') || String(new Date().getFullYear()));
  const mes = parseInt(searchParams.get('mes') || String(new Date().getMonth() + 1));

  try {
    await ensureFerrTables();
    const pool = await getPool();
    const result = await pool.request()
      .input('ano', sql.Int, ano)
      .input('mes', sql.Int, mes)
      .query(`
        SELECT TOP 1
          META1_VALOR as meta1_valor, META1_BONUS as meta1_bonus,
          META2_VALOR as meta2_valor, META2_BONUS as meta2_bonus,
          META3_VALOR as meta3_valor, META3_BONUS as meta3_bonus,
          METADESAFIO_VALOR as metadesafio_valor, METADESAFIO_BONUS as metadesafio_bonus
        FROM [TI-PAINELCOMISSAO_FERRAGENS_META_GRUPO]
        WHERE ANO = @ano AND MES = @mes
      `);
    return NextResponse.json(result.recordset[0] ?? null);
  } catch (e) {
    console.error('[ferragens/meta-grupo GET]', e);
    return NextResponse.json(null);
  }
}

export async function PUT(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario || !['ADM', 'GESTOR'].includes(usuario.cargo)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body: {
    ano: number; mes: number;
    meta1_valor: number; meta1_bonus: number;
    meta2_valor: number; meta2_bonus: number;
    meta3_valor: number; meta3_bonus: number;
    metadesafio_valor: number; metadesafio_bonus: number;
  } = await req.json();

  try {
    await ensureFerrTables();
    const pool = await getPool();
    await pool.request()
      .input('ano', sql.Int, body.ano)
      .input('mes', sql.Int, body.mes)
      .input('m1v', sql.Float, body.meta1_valor || 0)
      .input('m1b', sql.Float, body.meta1_bonus || 0)
      .input('m2v', sql.Float, body.meta2_valor || 0)
      .input('m2b', sql.Float, body.meta2_bonus || 0)
      .input('m3v', sql.Float, body.meta3_valor || 0)
      .input('m3b', sql.Float, body.meta3_bonus || 0)
      .input('mdv', sql.Float, body.metadesafio_valor || 0)
      .input('mdb', sql.Float, body.metadesafio_bonus || 0)
      .query(`
        MERGE [TI-PAINELCOMISSAO_FERRAGENS_META_GRUPO] AS t
        USING (SELECT @ano AS A, @mes AS M) AS s ON t.ANO=s.A AND t.MES=s.M
        WHEN MATCHED THEN UPDATE SET
          META1_VALOR=@m1v, META1_BONUS=@m1b,
          META2_VALOR=@m2v, META2_BONUS=@m2b,
          META3_VALOR=@m3v, META3_BONUS=@m3b,
          METADESAFIO_VALOR=@mdv, METADESAFIO_BONUS=@mdb
        WHEN NOT MATCHED THEN INSERT
          (ANO,MES,META1_VALOR,META1_BONUS,META2_VALOR,META2_BONUS,META3_VALOR,META3_BONUS,METADESAFIO_VALOR,METADESAFIO_BONUS)
        VALUES(@ano,@mes,@m1v,@m1b,@m2v,@m2b,@m3v,@m3b,@mdv,@mdb);
      `);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[ferragens/meta-grupo PUT]', e);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
