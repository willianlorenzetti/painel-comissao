import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';

const TABELA = '[TI-PAINELCOMISSAO_BONUS_CONFIG]';

let _tabelaEnsured = false;

const VAZIO = {
  bonus1_valor: 0, bonus1_percentual: 0,
  bonus2_valor: 0, bonus2_percentual: 0,
  bonus3_valor: 0, bonus3_percentual: 0,
  bonus4_valor: 0, bonus4_percentual: 0,
  bonus5_valor: 0, bonus5_percentual: 0,
};

async function garantirTabela(pool: Awaited<ReturnType<typeof getPool>>) {
  if (_tabelaEnsured) return;
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'TI-PAINELCOMISSAO_BONUS_CONFIG')
    BEGIN
      CREATE TABLE ${TABELA} (
        ID INT IDENTITY(1,1) PRIMARY KEY,
        BONUS1_VALOR FLOAT DEFAULT 0, BONUS1_PERCENTUAL FLOAT DEFAULT 0,
        BONUS2_VALOR FLOAT DEFAULT 0, BONUS2_PERCENTUAL FLOAT DEFAULT 0,
        BONUS3_VALOR FLOAT DEFAULT 0, BONUS3_PERCENTUAL FLOAT DEFAULT 0,
        BONUS4_VALOR FLOAT DEFAULT 0, BONUS4_PERCENTUAL FLOAT DEFAULT 0,
        BONUS5_VALOR FLOAT DEFAULT 0, BONUS5_PERCENTUAL FLOAT DEFAULT 0
      );
      INSERT INTO ${TABELA}
        (BONUS1_VALOR,BONUS1_PERCENTUAL,BONUS2_VALOR,BONUS2_PERCENTUAL,BONUS3_VALOR,BONUS3_PERCENTUAL,
         BONUS4_VALOR,BONUS4_PERCENTUAL,BONUS5_VALOR,BONUS5_PERCENTUAL)
      VALUES (0,0,0,0,0,0,0,0,0,0);
    END
  `);
  _tabelaEnsured = true;
}

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const pool = await getPool();
    await garantirTabela(pool);
    const result = await pool.request().query(`
      SELECT TOP 1
        BONUS1_VALOR as bonus1_valor, BONUS1_PERCENTUAL as bonus1_percentual,
        BONUS2_VALOR as bonus2_valor, BONUS2_PERCENTUAL as bonus2_percentual,
        BONUS3_VALOR as bonus3_valor, BONUS3_PERCENTUAL as bonus3_percentual,
        BONUS4_VALOR as bonus4_valor, BONUS4_PERCENTUAL as bonus4_percentual,
        BONUS5_VALOR as bonus5_valor, BONUS5_PERCENTUAL as bonus5_percentual
      FROM ${TABELA}
    `);
    const res = NextResponse.json(result.recordset[0] ?? VAZIO);
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
    return res;
  } catch (error) {
    console.error('Erro ao buscar bonus config:', error);
    return NextResponse.json(VAZIO);
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
    const b: typeof VAZIO = await req.json();
    const pool = await getPool();
    await garantirTabela(pool);

    const exists = await pool.request().query(`SELECT TOP 1 ID FROM ${TABELA}`);

    const r = pool.request()
      .input('b1v', sql.Float, b.bonus1_valor) .input('b1p', sql.Float, b.bonus1_percentual)
      .input('b2v', sql.Float, b.bonus2_valor) .input('b2p', sql.Float, b.bonus2_percentual)
      .input('b3v', sql.Float, b.bonus3_valor) .input('b3p', sql.Float, b.bonus3_percentual)
      .input('b4v', sql.Float, b.bonus4_valor) .input('b4p', sql.Float, b.bonus4_percentual)
      .input('b5v', sql.Float, b.bonus5_valor) .input('b5p', sql.Float, b.bonus5_percentual);

    if (exists.recordset.length > 0) {
      await r.query(`
        UPDATE ${TABELA} SET
          BONUS1_VALOR=@b1v, BONUS1_PERCENTUAL=@b1p,
          BONUS2_VALOR=@b2v, BONUS2_PERCENTUAL=@b2p,
          BONUS3_VALOR=@b3v, BONUS3_PERCENTUAL=@b3p,
          BONUS4_VALOR=@b4v, BONUS4_PERCENTUAL=@b4p,
          BONUS5_VALOR=@b5v, BONUS5_PERCENTUAL=@b5p
        WHERE ID = (SELECT TOP 1 ID FROM ${TABELA})
      `);
    } else {
      await r.query(`
        INSERT INTO ${TABELA}
          (BONUS1_VALOR,BONUS1_PERCENTUAL,BONUS2_VALOR,BONUS2_PERCENTUAL,BONUS3_VALOR,BONUS3_PERCENTUAL,
           BONUS4_VALOR,BONUS4_PERCENTUAL,BONUS5_VALOR,BONUS5_PERCENTUAL)
        VALUES (@b1v,@b1p,@b2v,@b2p,@b3v,@b3p,@b4v,@b4p,@b5v,@b5p)
      `);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar bonus config:', error);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
