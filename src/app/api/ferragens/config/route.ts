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

    const [metasResult, bonusResult, grupoResult] = await Promise.all([
      pool.request()
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
        `),
      pool.request()
        .input('ano', sql.Int, ano)
        .input('mes', sql.Int, mes)
        .query(`
          SELECT VENDEDOR as nome_vendedor,
                 BONUS1_VALOR as bonus1_valor, BONUS2_VALOR as bonus2_valor,
                 BONUS3_VALOR as bonus3_valor, BONUSDESAFIO_VALOR as bonusdesafio_valor
          FROM [TI-PAINELCOMISSAO_FERRAGENS_BONUS]
          WHERE ANO = @ano AND MES = @mes
        `),
      pool.request()
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
        `),
    ]);

    const res = NextResponse.json({
      metas: metasResult.recordset,
      bonus: bonusResult.recordset,
      metaGrupo: grupoResult.recordset[0] ?? null,
    });
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
    return res;
  } catch (e) {
    console.error('[ferragens/config GET]', e);
    return NextResponse.json({ error: 'Erro ao buscar' }, { status: 500 });
  }
}
