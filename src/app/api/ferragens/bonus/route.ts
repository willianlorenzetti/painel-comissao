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
        SELECT VENDEDOR as nome_vendedor,
               BONUS1_VALOR as bonus1_valor, BONUS2_VALOR as bonus2_valor,
               BONUS3_VALOR as bonus3_valor, BONUSDESAFIO_VALOR as bonusdesafio_valor
        FROM [TI-PAINELCOMISSAO_FERRAGENS_BONUS]
        WHERE ANO = @ano AND MES = @mes
      `);
    return NextResponse.json(result.recordset);
  } catch (e) {
    console.error('[ferragens/bonus GET]', e);
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

  const body: Array<{
    nome_vendedor: string; ano: number; mes: number;
    bonus1_valor: number; bonus2_valor: number; bonus3_valor: number; bonusdesafio_valor: number;
  }> = await req.json();

  try {
    await ensureFerrTables();
    const pool = await getPool();
    for (const row of body) {
      await pool.request()
        .input('vend', sql.VarChar, row.nome_vendedor)
        .input('ano', sql.Int, row.ano)
        .input('mes', sql.Int, row.mes)
        .input('b1', sql.Float, row.bonus1_valor || 0)
        .input('b2', sql.Float, row.bonus2_valor || 0)
        .input('b3', sql.Float, row.bonus3_valor || 0)
        .input('bd', sql.Float, row.bonusdesafio_valor || 0)
        .query(`
          MERGE [TI-PAINELCOMISSAO_FERRAGENS_BONUS] AS t
          USING (SELECT @vend AS V, @ano AS A, @mes AS M) AS s ON t.VENDEDOR=s.V AND t.ANO=s.A AND t.MES=s.M
          WHEN MATCHED THEN UPDATE SET BONUS1_VALOR=@b1,BONUS2_VALOR=@b2,BONUS3_VALOR=@b3,BONUSDESAFIO_VALOR=@bd
          WHEN NOT MATCHED THEN INSERT (VENDEDOR,ANO,MES,BONUS1_VALOR,BONUS2_VALOR,BONUS3_VALOR,BONUSDESAFIO_VALOR)
          VALUES(@vend,@ano,@mes,@b1,@b2,@b3,@bd);
        `);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[ferragens/bonus PUT]', e);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
