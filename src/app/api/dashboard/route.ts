import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';

export async function GET(req: NextRequest) {
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

    const [totalAno, totalMes, topVendedores, porSetor, porEmpresa, tendencia] =
      await Promise.all([
        pool
          .request()
          .input('inicio', sql.Date, `${ano}-01-01`)
          .input('fim', sql.Date, `${ano}-12-31`).query(`
            SELECT
              COUNT(DISTINCT USU_NOME) as total_vendedores,
              COUNT(DISTINCT RVS_NOME) as total_setores,
              SUM([SUM]) as total_vendas,
              SUM(QTDE) as total_qtde
            FROM [TI-COMERCIAL_45-VendaPorSetor]
            WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim
          `),

        pool
          .request()
          .input('inicio', sql.Date, dataInicio)
          .input('fim', sql.Date, dataFim).query(`
            SELECT SUM([SUM]) as total_mes
            FROM [TI-COMERCIAL_45-VendaPorSetor]
            WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim
          `),

        pool
          .request()
          .input('inicio', sql.Date, dataInicio)
          .input('fim', sql.Date, dataFim).query(`
            SELECT TOP 10
              USU_NOME as vendedor,
              RVS_NOME as setor,
              EMP as empresa,
              SUM([SUM]) as total_vendas,
              SUM(QTDE) as total_qtde,
              COUNT(*) as total_registros
            FROM [TI-COMERCIAL_45-VendaPorSetor]
            WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim
              AND USU_NOME IS NOT NULL
            GROUP BY USU_NOME, RVS_NOME, EMP
            ORDER BY total_vendas DESC
          `),

        pool
          .request()
          .input('inicio', sql.Date, dataInicio)
          .input('fim', sql.Date, dataFim).query(`
            SELECT
              RVS_NOME as setor,
              SUM([SUM]) as total_vendas,
              SUM(QTDE) as total_qtde,
              COUNT(*) as total_registros
            FROM [TI-COMERCIAL_45-VendaPorSetor]
            WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim
              AND RVS_NOME IS NOT NULL
            GROUP BY RVS_NOME
            ORDER BY total_vendas DESC
          `),

        pool
          .request()
          .input('inicio', sql.Date, `${ano}-01-01`)
          .input('fim', sql.Date, `${ano}-12-31`).query(`
            SELECT
              LTRIM(RTRIM(EMP)) as empresa,
              SUM([SUM]) as total_vendas,
              SUM(QTDE) as total_qtde
            FROM [TI-COMERCIAL_45-VendaPorSetor]
            WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim
            GROUP BY LTRIM(RTRIM(EMP))
            ORDER BY total_vendas DESC
          `),

        pool
          .request()
          .input('inicio', sql.Date, `${ano}-01-01`)
          .input('fim', sql.Date, `${ano}-12-31`).query(`
            SELECT
              YEAR(PDV_DATA) as ano,
              MONTH(PDV_DATA) as mes,
              SUM([SUM]) as total_vendas,
              SUM(QTDE) as total_qtde
            FROM [TI-COMERCIAL_45-VendaPorSetor]
            WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim
            GROUP BY YEAR(PDV_DATA), MONTH(PDV_DATA)
            ORDER BY ano, mes
          `),
      ]);

    return NextResponse.json({
      total_vendas: totalAno.recordset[0]?.total_vendas || 0,
      total_vendas_mes: totalMes.recordset[0]?.total_mes || 0,
      total_vendedores: totalAno.recordset[0]?.total_vendedores || 0,
      total_setores: totalAno.recordset[0]?.total_setores || 0,
      top_vendedores: topVendedores.recordset,
      vendas_por_setor: porSetor.recordset,
      vendas_por_empresa: porEmpresa.recordset,
      tendencia_mensal: tendencia.recordset,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    return NextResponse.json(
      { error: 'Erro ao buscar dados' },
      { status: 500 }
    );
  }
}
