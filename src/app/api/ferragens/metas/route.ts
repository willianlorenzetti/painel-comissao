import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';
import { ensureFerrTables } from '@/lib/ferragens-tables';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

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
               META1_VALOR as meta1_valor, META1_PERCENTUAL as meta1_percentual,
               META2_VALOR as meta2_valor, META2_PERCENTUAL as meta2_percentual,
               META3_VALOR as meta3_valor, META3_PERCENTUAL as meta3_percentual,
               METADESAFIO_VALOR as metadesafio_valor, METADESAFIO_PERCENTUAL as metadesafio_percentual,
               PERCENTUAL_SEM_META as percentual_sem_meta
        FROM [TI-PAINELCOMISSAO_FERRAGENS_METAS]
        WHERE ANO = @ano AND MES = @mes
      `);
    return NextResponse.json(result.recordset);
  } catch (e) {
    console.error('[ferragens/metas GET]', e);
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
    meta1_valor: number; meta1_percentual: number;
    meta2_valor: number; meta2_percentual: number;
    meta3_valor: number; meta3_percentual: number;
    metadesafio_valor: number; metadesafio_percentual: number;
    percentual_sem_meta: number;
  }> = await req.json();

  try {
    await ensureFerrTables();
    const pool = await getPool();
    for (const row of body) {
      await pool.request()
        .input('vend', sql.VarChar, row.nome_vendedor)
        .input('ano', sql.Int, row.ano)
        .input('mes', sql.Int, row.mes)
        .input('m1v', sql.Float, row.meta1_valor || 0)
        .input('m1p', sql.Float, row.meta1_percentual || 0)
        .input('m2v', sql.Float, row.meta2_valor || 0)
        .input('m2p', sql.Float, row.meta2_percentual || 0)
        .input('m3v', sql.Float, row.meta3_valor || 0)
        .input('m3p', sql.Float, row.meta3_percentual || 0)
        .input('mdv', sql.Float, row.metadesafio_valor || 0)
        .input('mdp', sql.Float, row.metadesafio_percentual || 0)
        .input('psm', sql.Float, row.percentual_sem_meta || 0)
        .query(`
          MERGE [TI-PAINELCOMISSAO_FERRAGENS_METAS] AS t
          USING (SELECT @vend AS V, @ano AS A, @mes AS M) AS s ON t.VENDEDOR=s.V AND t.ANO=s.A AND t.MES=s.M
          WHEN MATCHED THEN UPDATE SET
            META1_VALOR=@m1v, META1_PERCENTUAL=@m1p,
            META2_VALOR=@m2v, META2_PERCENTUAL=@m2p,
            META3_VALOR=@m3v, META3_PERCENTUAL=@m3p,
            METADESAFIO_VALOR=@mdv, METADESAFIO_PERCENTUAL=@mdp,
            PERCENTUAL_SEM_META=@psm
          WHEN NOT MATCHED THEN INSERT
            (VENDEDOR,ANO,MES,META1_VALOR,META1_PERCENTUAL,META2_VALOR,META2_PERCENTUAL,
             META3_VALOR,META3_PERCENTUAL,METADESAFIO_VALOR,METADESAFIO_PERCENTUAL,PERCENTUAL_SEM_META)
          VALUES(@vend,@ano,@mes,@m1v,@m1p,@m2v,@m2p,@m3v,@m3p,@mdv,@mdp,@psm);
        `);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[ferragens/metas PUT]', e);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
