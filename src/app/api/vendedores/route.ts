import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const ano = searchParams.get('ano') || new Date().getFullYear().toString();
  const mes = searchParams.get('mes');
  const setor = searchParams.get('setor');
  const empresa = searchParams.get('empresa');

  try {
    const pool = await getPool();

    const dataInicio = mes
      ? `${ano}-${mes.padStart(2, '0')}-01`
      : `${ano}-01-01`;
    const dataFim = mes
      ? new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0]
      : `${ano}-12-31`;

    const request = pool
      .request()
      .input('inicio', sql.Date, dataInicio)
      .input('fim', sql.Date, dataFim);

    let where = 'WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim AND USU_NOME IS NOT NULL';
    if (setor) {
      request.input('setor', sql.VarChar, setor);
      where += ' AND RVS_NOME = @setor';
    }
    if (empresa) {
      request.input('empresa', sql.VarChar, empresa);
      where += ' AND LTRIM(RTRIM(EMP)) = @empresa';
    }

    const result = await request.query(`
      SELECT
        USU_NOME as vendedor,
        RVS_NOME as setor,
        LTRIM(RTRIM(EMP)) as empresa,
        SUM([SUM]) as total_vendas,
        SUM(QTDE) as total_qtde,
        COUNT(*) as total_registros,
        MIN(PDV_DATA) as primeira_venda,
        MAX(PDV_DATA) as ultima_venda
      FROM [TI-COMERCIAL_45-VendaPorSetor]
      ${where}
      GROUP BY USU_NOME, RVS_NOME, LTRIM(RTRIM(EMP))
      ORDER BY total_vendas DESC
    `);

    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error('Erro ao buscar vendedores:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
