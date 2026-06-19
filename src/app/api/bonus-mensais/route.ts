import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';

const TABELA = '[TI-PAINELCOMISSAO_BONUS]';

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
    if (ano)  { r.input('ano', sql.Int,     parseInt(ano)); where += ' AND ANO = @ano'; }
    if (mes)  { r.input('mes', sql.VarChar,  mes);           where += ' AND MES = @mes'; }
    const result = await r.query(`
      SELECT VENDEDOR as nome_vendedor, ANO as ano, MES as mes,
             BONUS1_VALOR as bonus1_valor, BONUS1_PERCENTUAL as bonus1_percentual,
             BONUS2_VALOR as bonus2_valor, BONUS2_PERCENTUAL as bonus2_percentual,
             BONUS3_VALOR as bonus3_valor, BONUS3_PERCENTUAL as bonus3_percentual,
             BONUS4_VALOR as bonus4_valor, BONUS4_PERCENTUAL as bonus4_percentual,
             BONUS5_VALOR as bonus5_valor, BONUS5_PERCENTUAL as bonus5_percentual
      FROM ${TABELA} ${where} ORDER BY VENDEDOR
    `);
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error('Erro ao buscar bonus:', error);
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
    const items: {
      nome_vendedor: string; ano: number; mes: number;
      bonus1_valor: number; bonus1_percentual: number;
      bonus2_valor: number; bonus2_percentual: number;
      bonus3_valor: number; bonus3_percentual: number;
      bonus4_valor: number; bonus4_percentual: number;
      bonus5_valor: number; bonus5_percentual: number;
    }[] = await req.json();

    const pool = await getPool();
    for (const b of items) {
      const mesStr = String(b.mes);
      const exists = await pool.request()
        .input('nome', sql.VarChar, b.nome_vendedor)
        .input('ano',  sql.Int,     b.ano)
        .input('mes',  sql.VarChar, mesStr)
        .query(`SELECT ID FROM ${TABELA} WHERE VENDEDOR=@nome AND ANO=@ano AND MES=@mes`);

      const r = pool.request()
        .input('nome', sql.VarChar, b.nome_vendedor)
        .input('ano',  sql.Int,     b.ano)
        .input('mes',  sql.VarChar, mesStr)
        .input('b1v',  sql.Float, b.bonus1_valor) .input('b1p', sql.Float, b.bonus1_percentual)
        .input('b2v',  sql.Float, b.bonus2_valor) .input('b2p', sql.Float, b.bonus2_percentual)
        .input('b3v',  sql.Float, b.bonus3_valor) .input('b3p', sql.Float, b.bonus3_percentual)
        .input('b4v',  sql.Float, b.bonus4_valor) .input('b4p', sql.Float, b.bonus4_percentual)
        .input('b5v',  sql.Float, b.bonus5_valor) .input('b5p', sql.Float, b.bonus5_percentual);

      if (exists.recordset.length > 0) {
        await r.query(`
          UPDATE ${TABELA}
          SET BONUS1_VALOR=@b1v,BONUS1_PERCENTUAL=@b1p,
              BONUS2_VALOR=@b2v,BONUS2_PERCENTUAL=@b2p,
              BONUS3_VALOR=@b3v,BONUS3_PERCENTUAL=@b3p,
              BONUS4_VALOR=@b4v,BONUS4_PERCENTUAL=@b4p,
              BONUS5_VALOR=@b5v,BONUS5_PERCENTUAL=@b5p
          WHERE VENDEDOR=@nome AND ANO=@ano AND MES=@mes
        `);
      } else {
        await r.query(`
          INSERT INTO ${TABELA}
            (VENDEDOR,ANO,MES,BONUS1_VALOR,BONUS1_PERCENTUAL,BONUS2_VALOR,BONUS2_PERCENTUAL,
             BONUS3_VALOR,BONUS3_PERCENTUAL,BONUS4_VALOR,BONUS4_PERCENTUAL,BONUS5_VALOR,BONUS5_PERCENTUAL)
          VALUES(@nome,@ano,@mes,@b1v,@b1p,@b2v,@b2p,@b3v,@b3p,@b4v,@b4p,@b5v,@b5p)
        `);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar bonus:', error);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
