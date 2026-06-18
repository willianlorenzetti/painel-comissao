import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';

async function ensureTable() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='ComissaoConfig' AND xtype='U')
    CREATE TABLE ComissaoConfig (
      id INT IDENTITY(1,1) PRIMARY KEY,
      setor VARCHAR(200) NOT NULL,
      percentual DECIMAL(5,2) NOT NULL DEFAULT 0,
      meta_mensal DECIMAL(18,2) NOT NULL DEFAULT 0,
      ativo BIT NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT GETDATE(),
      atualizado_em DATETIME DEFAULT GETDATE()
    )
  `);
}

export async function GET() {
  try {
    await ensureTable();
    const pool = await getPool();
    const result = await pool
      .request()
      .query('SELECT * FROM ComissaoConfig ORDER BY setor');
    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error('Erro ao buscar comissões:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTable();
    const body = await req.json();
    const pool = await getPool();

    const existing = await pool
      .request()
      .input('setor', sql.VarChar, body.setor)
      .query('SELECT id FROM ComissaoConfig WHERE setor = @setor');

    if (existing.recordset.length > 0) {
      await pool
        .request()
        .input('setor', sql.VarChar, body.setor)
        .input('percentual', sql.Decimal(5, 2), body.percentual)
        .input('meta_mensal', sql.Decimal(18, 2), body.meta_mensal)
        .input('ativo', sql.Bit, body.ativo ? 1 : 0).query(`
          UPDATE ComissaoConfig
          SET percentual = @percentual,
              meta_mensal = @meta_mensal,
              ativo = @ativo,
              atualizado_em = GETDATE()
          WHERE setor = @setor
        `);
    } else {
      await pool
        .request()
        .input('setor', sql.VarChar, body.setor)
        .input('percentual', sql.Decimal(5, 2), body.percentual)
        .input('meta_mensal', sql.Decimal(18, 2), body.meta_mensal)
        .input('ativo', sql.Bit, body.ativo ? 1 : 0).query(`
          INSERT INTO ComissaoConfig (setor, percentual, meta_mensal, ativo)
          VALUES (@setor, @percentual, @meta_mensal, @ativo)
        `);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar comissão:', error);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
