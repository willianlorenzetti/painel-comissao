import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';
import { addSetoresGlobais } from '@/lib/setores';
import { ensureVendedorAtivoTable } from '@/lib/vendedorAtivoTable';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario || !['ADM', 'GESTOR'].includes(usuario.cargo)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  try {
    const pool = await getPool();
    await ensureVendedorAtivoTable();

    // All vendors from VendaPorSetor (same setor filter as filtros)
    const rVend = pool.request();
    const wVend = addSetoresGlobais(rVend, 'WHERE USU_NOME IS NOT NULL');
    const vendResult = await rVend.query(`
      SELECT DISTINCT USU_NOME as nome
      FROM [TI-COMERCIAL_45-VendaPorSetor]
      ${wVend}
      ORDER BY USU_NOME
    `);

    // Current status map
    const statusResult = await pool.request().query(`
      SELECT nome_vendedor, ativo FROM [TI-PAINELCOMISSAO_VENDEDOR_ATIVO]
    `);
    const statusMap: Record<string, boolean> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    statusResult.recordset.forEach((r: any) => {
      statusMap[r.nome_vendedor] = r.ativo === true || r.ativo === 1;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vendors = vendResult.recordset.map((r: any) => ({
      nome: r.nome as string,
      ativo: statusMap[r.nome] !== undefined ? statusMap[r.nome] : true,
    }));

    return NextResponse.json(vendors);
  } catch (err) {
    console.error('[vendedor-ativo GET]', err);
    return NextResponse.json({ error: 'Erro ao consultar banco' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario || !['ADM', 'GESTOR'].includes(usuario.cargo)) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const body = await req.json();
  const { nome_vendedor, ativo } = body;
  if (!nome_vendedor || typeof ativo !== 'boolean') {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  try {
    const pool = await getPool();
    await ensureVendedorAtivoTable();

    await pool
      .request()
      .input('nome', sql.VarChar(200), nome_vendedor)
      .input('ativo', sql.Bit, ativo ? 1 : 0)
      .query(`
        MERGE [TI-PAINELCOMISSAO_VENDEDOR_ATIVO] AS target
        USING (SELECT @nome AS nome_vendedor) AS source
          ON target.nome_vendedor = source.nome_vendedor
        WHEN MATCHED THEN
          UPDATE SET ativo = @ativo
        WHEN NOT MATCHED THEN
          INSERT (nome_vendedor, ativo) VALUES (@nome, @ativo);
      `);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[vendedor-ativo PUT]', err);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
}
