import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';

const TABELA = '[TI-PAINELCOMISSAO_METAS]';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const ano = searchParams.get('ano');
  const mes = searchParams.get('mes');

  try {
    const pool = await getPool();
    const r = pool.request();
    let where = 'WHERE 1=1';
    if (ano) { r.input('ano', sql.Int, parseInt(ano)); where += ' AND ANO = @ano'; }
    if (mes) { r.input('mes', sql.VarChar, mes); where += ' AND MES = @mes'; }
    const result = await r.query(
      `SELECT VENDEDOR as nome_vendedor, ANO as ano, MES as mes,
              META1_VALOR as meta1_valor, META1_PERCENTUAL as meta1_percentual,
              META2_VALOR as meta2_valor, META2_PERCENTUAL as meta2_percentual,
              META3_VALOR as meta3_valor, META3_PERCENTUAL as meta3_percentual
       FROM ${TABELA} ${where} ORDER BY VENDEDOR`
    );
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error('Erro ao buscar metas mensais:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario || !['ADM', 'GESTOR'].includes(usuario.cargo)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const metas: {
      nome_vendedor: string; ano: number; mes: number;
      meta1_valor: number; meta1_percentual: number;
      meta2_valor: number; meta2_percentual: number;
      meta3_valor: number; meta3_percentual: number;
    }[] = await req.json();

    const pool = await getPool();
    for (const m of metas) {
      const mesStr = String(m.mes);
      const existing = await pool.request()
        .input('nome', sql.VarChar, m.nome_vendedor)
        .input('ano',  sql.Int,     m.ano)
        .input('mes',  sql.VarChar, mesStr)
        .query(`SELECT ID FROM ${TABELA} WHERE VENDEDOR=@nome AND ANO=@ano AND MES=@mes`);

      if (existing.recordset.length > 0) {
        await pool.request()
          .input('nome', sql.VarChar,  m.nome_vendedor)
          .input('ano',  sql.Int,      m.ano)
          .input('mes',  sql.VarChar,  mesStr)
          .input('m1v',  sql.Float,    m.meta1_valor)
          .input('m1p',  sql.Float,    m.meta1_percentual)
          .input('m2v',  sql.Float,    m.meta2_valor)
          .input('m2p',  sql.Float,    m.meta2_percentual)
          .input('m3v',  sql.Float,    m.meta3_valor)
          .input('m3p',  sql.Float,    m.meta3_percentual)
          .query(`
            UPDATE ${TABELA}
            SET META1_VALOR=@m1v, META1_PERCENTUAL=@m1p,
                META2_VALOR=@m2v, META2_PERCENTUAL=@m2p,
                META3_VALOR=@m3v, META3_PERCENTUAL=@m3p
            WHERE VENDEDOR=@nome AND ANO=@ano AND MES=@mes
          `);
      } else {
        await pool.request()
          .input('nome', sql.VarChar,  m.nome_vendedor)
          .input('ano',  sql.Int,      m.ano)
          .input('mes',  sql.VarChar,  mesStr)
          .input('m1v',  sql.Float,    m.meta1_valor)
          .input('m1p',  sql.Float,    m.meta1_percentual)
          .input('m2v',  sql.Float,    m.meta2_valor)
          .input('m2p',  sql.Float,    m.meta2_percentual)
          .input('m3v',  sql.Float,    m.meta3_valor)
          .input('m3p',  sql.Float,    m.meta3_percentual)
          .query(`
            INSERT INTO ${TABELA}
              (VENDEDOR, ANO, MES, META1_VALOR, META1_PERCENTUAL, META2_VALOR, META2_PERCENTUAL, META3_VALOR, META3_PERCENTUAL)
            VALUES (@nome, @ano, @mes, @m1v, @m1p, @m2v, @m2p, @m3v, @m3p)
          `);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar metas mensais:', error);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
