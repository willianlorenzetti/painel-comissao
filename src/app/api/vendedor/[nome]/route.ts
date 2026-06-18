import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nome: string }> }
) {
  const { nome } = await params;
  const vendedor = decodeURIComponent(nome);
  const { searchParams } = new URL(req.url);
  const ano = searchParams.get('ano') || new Date().getFullYear().toString();
  const mes = searchParams.get('mes');

  try {
    const pool = await getPool();

    const dataInicio = mes
      ? `${ano}-${mes.padStart(2, '0')}-01`
      : `${ano}-01-01`;
    const dataFim = mes
      ? new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0]
      : `${ano}-12-31`;

    const [resumo, mensal, porSubgrupo, vendas] = await Promise.all([
      pool
        .request()
        .input('vendedor', sql.VarChar, vendedor)
        .input('inicio', sql.Date, dataInicio)
        .input('fim', sql.Date, dataFim).query(`
          SELECT
            USU_NOME as vendedor,
            RVS_NOME as setor,
            LTRIM(RTRIM(EMP)) as empresa,
            SUM([SUM]) as total_vendas,
            SUM(QTDE) as total_qtde,
            COUNT(*) as total_registros
          FROM [TI-COMERCIAL_45-VendaPorSetor]
          WHERE USU_NOME = @vendedor
            AND PDV_DATA >= @inicio AND PDV_DATA <= @fim
          GROUP BY USU_NOME, RVS_NOME, LTRIM(RTRIM(EMP))
        `),

      pool
        .request()
        .input('vendedor', sql.VarChar, vendedor)
        .input('inicio', sql.Date, `${ano}-01-01`)
        .input('fim', sql.Date, `${ano}-12-31`).query(`
          SELECT
            MONTH(PDV_DATA) as mes,
            SUM([SUM]) as total_vendas,
            SUM(QTDE) as total_qtde
          FROM [TI-COMERCIAL_45-VendaPorSetor]
          WHERE USU_NOME = @vendedor
            AND PDV_DATA >= @inicio AND PDV_DATA <= @fim
          GROUP BY MONTH(PDV_DATA)
          ORDER BY mes
        `),

      pool
        .request()
        .input('vendedor', sql.VarChar, vendedor)
        .input('inicio', sql.Date, dataInicio)
        .input('fim', sql.Date, dataFim).query(`
          SELECT
            SUBGRUPO as subgrupo,
            SUM([SUM]) as total_vendas,
            SUM(QTDE) as total_qtde
          FROM [TI-COMERCIAL_45-VendaPorSetor]
          WHERE USU_NOME = @vendedor
            AND PDV_DATA >= @inicio AND PDV_DATA <= @fim
          GROUP BY SUBGRUPO
          ORDER BY total_vendas DESC
        `),

      pool
        .request()
        .input('vendedor', sql.VarChar, vendedor)
        .input('inicio', sql.Date, dataInicio)
        .input('fim', sql.Date, dataFim).query(`
          SELECT TOP 100
            PDV_DATA as data,
            ETA_DESCRICAO as cliente,
            SUBGRUPO as subgrupo,
            FAMILIA as familia,
            QTDE as qtde,
            [SUM] as valor,
            LTRIM(RTRIM(EMP)) as empresa
          FROM [TI-COMERCIAL_45-VendaPorSetor]
          WHERE USU_NOME = @vendedor
            AND PDV_DATA >= @inicio AND PDV_DATA <= @fim
          ORDER BY PDV_DATA DESC
        `),
    ]);

    return NextResponse.json({
      resumo: resumo.recordset,
      mensal: mensal.recordset,
      porSubgrupo: porSubgrupo.recordset,
      vendas: vendas.recordset,
    });
  } catch (error) {
    console.error('Erro ao buscar vendedor:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
