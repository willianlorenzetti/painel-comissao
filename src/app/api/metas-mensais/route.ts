import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';

async function ensureTable() {
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='VendedorMetaMensal' AND xtype='U')
    BEGIN
      CREATE TABLE VendedorMetaMensal (
        id INT IDENTITY(1,1) PRIMARY KEY,
        nome_vendedor VARCHAR(200) NOT NULL,
        ano INT NOT NULL,
        mes INT NOT NULL,
        meta1_valor      DECIMAL(18,2) NOT NULL DEFAULT 0,
        meta1_percentual DECIMAL(5,2)  NOT NULL DEFAULT 0,
        meta2_valor      DECIMAL(18,2) NOT NULL DEFAULT 0,
        meta2_percentual DECIMAL(5,2)  NOT NULL DEFAULT 0,
        meta3_valor      DECIMAL(18,2) NOT NULL DEFAULT 0,
        meta3_percentual DECIMAL(5,2)  NOT NULL DEFAULT 0,
        criado_em DATETIME DEFAULT GETDATE(),
        atualizado_em DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_VendedorMetaMensal UNIQUE (nome_vendedor, ano, mes)
      )
    END
  `);
}

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const ano = searchParams.get('ano');
  const mes = searchParams.get('mes');

  try {
    await ensureTable();
    const pool = await getPool();
    const r = pool.request();
    let where = 'WHERE 1=1';
    if (ano) { r.input('ano', sql.Int, parseInt(ano)); where += ' AND ano = @ano'; }
    if (mes) { r.input('mes', sql.Int, parseInt(mes)); where += ' AND mes = @mes'; }
    const result = await r.query(`SELECT * FROM VendedorMetaMensal ${where} ORDER BY nome_vendedor`);
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
    await ensureTable();
    const metas: {
      nome_vendedor: string; ano: number; mes: number;
      meta1_valor: number; meta1_percentual: number;
      meta2_valor: number; meta2_percentual: number;
      meta3_valor: number; meta3_percentual: number;
    }[] = await req.json();

    const pool = await getPool();
    for (const m of metas) {
      const existing = await pool.request()
        .input('nome', sql.VarChar, m.nome_vendedor)
        .input('ano', sql.Int, m.ano)
        .input('mes', sql.Int, m.mes)
        .query('SELECT id FROM VendedorMetaMensal WHERE nome_vendedor=@nome AND ano=@ano AND mes=@mes');

      if (existing.recordset.length > 0) {
        await pool.request()
          .input('nome', sql.VarChar, m.nome_vendedor)
          .input('ano',  sql.Int, m.ano)
          .input('mes',  sql.Int, m.mes)
          .input('m1v',  sql.Decimal(18,2), m.meta1_valor)
          .input('m1p',  sql.Decimal(5,2),  m.meta1_percentual)
          .input('m2v',  sql.Decimal(18,2), m.meta2_valor)
          .input('m2p',  sql.Decimal(5,2),  m.meta2_percentual)
          .input('m3v',  sql.Decimal(18,2), m.meta3_valor)
          .input('m3p',  sql.Decimal(5,2),  m.meta3_percentual)
          .query(`
            UPDATE VendedorMetaMensal
            SET meta1_valor=@m1v, meta1_percentual=@m1p,
                meta2_valor=@m2v, meta2_percentual=@m2p,
                meta3_valor=@m3v, meta3_percentual=@m3p,
                atualizado_em=GETDATE()
            WHERE nome_vendedor=@nome AND ano=@ano AND mes=@mes
          `);
      } else {
        await pool.request()
          .input('nome', sql.VarChar, m.nome_vendedor)
          .input('ano',  sql.Int, m.ano)
          .input('mes',  sql.Int, m.mes)
          .input('m1v',  sql.Decimal(18,2), m.meta1_valor)
          .input('m1p',  sql.Decimal(5,2),  m.meta1_percentual)
          .input('m2v',  sql.Decimal(18,2), m.meta2_valor)
          .input('m2p',  sql.Decimal(5,2),  m.meta2_percentual)
          .input('m3v',  sql.Decimal(18,2), m.meta3_valor)
          .input('m3p',  sql.Decimal(5,2),  m.meta3_percentual)
          .query(`
            INSERT INTO VendedorMetaMensal
              (nome_vendedor,ano,mes,meta1_valor,meta1_percentual,meta2_valor,meta2_percentual,meta3_valor,meta3_percentual)
            VALUES (@nome,@ano,@mes,@m1v,@m1p,@m2v,@m2p,@m3v,@m3p)
          `);
      }
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro ao salvar metas mensais:', error);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
