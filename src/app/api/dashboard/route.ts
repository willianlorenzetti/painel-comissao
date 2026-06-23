import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario, podeVerTudo, buildSetorFilter } from '@/lib/permissions';
import { addSetoresGlobais } from '@/lib/setores';
import { calcularComissaoTelevendas, MetaConfig, BonusConfig } from '@/lib/commission';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  // Vendedor não acessa o dashboard geral
  if (usuario.cargo === 'VENDEDOR') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ano = searchParams.get('ano') || new Date().getFullYear().toString();
  const mes = searchParams.get('mes');

  try {
    const pool = await getPool();

    const dataInicio = mes ? `${ano}-${mes.padStart(2, '0')}-01` : `${ano}-01-01`;
    const dataFim = mes
      ? new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0]
      : `${ano}-12-31`;

    const verTudo = podeVerTudo(usuario.cargo);
    const setores = verTudo ? [] : usuario.setores;

    const baseWhere = 'WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim';
    const baseWhereAno = 'WHERE PDV_DATA >= @inicioAno AND PDV_DATA <= @fimAno';

    const [totalAno, totalMes, topVendedores, porSetor, porEmpresa, tendencia] =
      await Promise.all([
        (() => {
          const r = pool.request()
            .input('inicioAno', sql.Date, `${ano}-01-01`)
            .input('fimAno', sql.Date, `${ano}-12-31`);
          let w = buildSetorFilter(r, setores, baseWhereAno);
          w = addSetoresGlobais(r, w);
          return r.query(`
            SELECT COUNT(DISTINCT CASE WHEN [SUM] > 0 THEN USU_NOME END) as total_vendedores,
                   COUNT(DISTINCT RVS_NOME) as total_setores,
                   SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde
            FROM [TI-COMERCIAL_45-VendaPorSetor] ${w}
          `);
        })(),

        (() => {
          const r = pool.request()
            .input('inicio', sql.Date, dataInicio)
            .input('fim', sql.Date, dataFim);
          let w = buildSetorFilter(r, setores, baseWhere);
          w = addSetoresGlobais(r, w);
          return r.query(`
            SELECT SUM([SUM]) as total_mes
            FROM [TI-COMERCIAL_45-VendaPorSetor] ${w}
          `);
        })(),

        (() => {
          const r = pool.request()
            .input('inicio', sql.Date, dataInicio)
            .input('fim', sql.Date, dataFim);
          let w = buildSetorFilter(r, setores, `${baseWhere} AND USU_NOME IS NOT NULL`);
          w = addSetoresGlobais(r, w);
          return r.query(`
            SELECT TOP 10 USU_NOME as vendedor, RVS_NOME as setor, EMP as empresa,
                   SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde, COUNT(*) as total_registros
            FROM [TI-COMERCIAL_45-VendaPorSetor] ${w}
            GROUP BY USU_NOME, RVS_NOME, EMP ORDER BY total_vendas DESC
          `);
        })(),

        (() => {
          const r = pool.request()
            .input('inicio', sql.Date, dataInicio)
            .input('fim', sql.Date, dataFim);
          let w = buildSetorFilter(r, setores, `${baseWhere} AND RVS_NOME IS NOT NULL`);
          w = addSetoresGlobais(r, w);
          return r.query(`
            SELECT RVS_NOME as setor, SUM([SUM]) as total_vendas,
                   SUM(QTDE) as total_qtde, COUNT(*) as total_registros
            FROM [TI-COMERCIAL_45-VendaPorSetor] ${w}
            GROUP BY RVS_NOME ORDER BY total_vendas DESC
          `);
        })(),

        (() => {
          const r = pool.request()
            .input('inicioAno', sql.Date, `${ano}-01-01`)
            .input('fimAno', sql.Date, `${ano}-12-31`);
          let w = buildSetorFilter(r, setores, baseWhereAno);
          w = addSetoresGlobais(r, w);
          return r.query(`
            SELECT LTRIM(RTRIM(EMP)) as empresa, SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde
            FROM [TI-COMERCIAL_45-VendaPorSetor] ${w}
            GROUP BY LTRIM(RTRIM(EMP)) ORDER BY total_vendas DESC
          `);
        })(),

        (() => {
          const r = pool.request()
            .input('inicioAno', sql.Date, `${ano}-01-01`)
            .input('fimAno', sql.Date, `${ano}-12-31`);
          let w = buildSetorFilter(r, setores, baseWhereAno);
          w = addSetoresGlobais(r, w);
          return r.query(`
            SELECT YEAR(PDV_DATA) as ano, MONTH(PDV_DATA) as mes,
                   SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde
            FROM [TI-COMERCIAL_45-VendaPorSetor] ${w}
            GROUP BY YEAR(PDV_DATA), MONTH(PDV_DATA) ORDER BY ano, mes
          `);
        })(),
      ]);

    // ── Comissão Televendas (só quando mês específico selecionado) ──
    let total_pa_televendas = 0;
    let total_recebimentos_televendas = 0;
    let total_comissao_televendas = 0;

    if (mes) {
      try {
        const [paResult, recResult, metaResult, bonusResult] = await Promise.all([
          pool.request()
            .input('paInicio', sql.Date, dataInicio)
            .input('paFim', sql.Date, dataFim)
            .query(`
              SELECT USU_NOME as vendedor, SUM([SUM]) as valor_pa
              FROM [TI-COMERCIAL_45-VendaPorSetor]
              WHERE PDV_DATA >= @paInicio AND PDV_DATA <= @paFim
                AND RVS_NOME IN ('TELEVENDAS','TELEVENDAS MG')
                AND USU_NOME IS NOT NULL
              GROUP BY USU_NOME
            `),
          pool.request()
            .input('recInicio', sql.Date, dataInicio)
            .input('recFim', sql.Date, dataFim)
            .query(`
              SELECT REP_NOME as vendedor, SUM(TOTAL) as total_recebido
              FROM [TI-FINANCEIRO_55-Recebimento]
              WHERE DATABAIXA >= @recInicio AND DATABAIXA <= @recFim
                AND REP_NOME IN (
                  SELECT DISTINCT USU_NOME FROM [TI-COMERCIAL_45-VendaPorSetor]
                  WHERE RVS_NOME IN ('TELEVENDAS','TELEVENDAS MG') AND USU_NOME IS NOT NULL
                )
              GROUP BY REP_NOME
            `),
          pool.request()
            .input('metaAno', sql.Int, parseInt(ano))
            .input('metaMes', sql.VarChar, mes)
            .query(`
              SELECT VENDEDOR as nome_vendedor,
                     META1_VALOR as meta1_valor, META1_PERCENTUAL as meta1_percentual,
                     META2_VALOR as meta2_valor, META2_PERCENTUAL as meta2_percentual,
                     META3_VALOR as meta3_valor, META3_PERCENTUAL as meta3_percentual,
                     ISNULL(PERCENTUAL_SEM_META, 0) as percentual_sem_meta
              FROM [TI-PAINELCOMISSAO_METAS]
              WHERE ANO = @metaAno AND MES = @metaMes
            `),
          pool.request().query(`
            SELECT TOP 1
                   BONUS1_VALOR as bonus1_valor, BONUS1_PERCENTUAL as bonus1_percentual,
                   BONUS2_VALOR as bonus2_valor, BONUS2_PERCENTUAL as bonus2_percentual,
                   BONUS3_VALOR as bonus3_valor, BONUS3_PERCENTUAL as bonus3_percentual,
                   BONUS4_VALOR as bonus4_valor, BONUS4_PERCENTUAL as bonus4_percentual,
                   BONUS5_VALOR as bonus5_valor, BONUS5_PERCENTUAL as bonus5_percentual
            FROM [TI-PAINELCOMISSAO_BONUS_CONFIG]
          `),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const paMap: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paResult.recordset.forEach((r: any) => { paMap[r.vendedor] = Number(r.valor_pa); });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const recMap: Record<string, number> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recResult.recordset.forEach((r: any) => { recMap[r.vendedor] = Number(r.total_recebido); });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metaMap: Record<string, MetaConfig> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metaResult.recordset.forEach((r: any) => {
          metaMap[r.nome_vendedor] = {
            meta1_valor: r.meta1_valor, meta1_percentual: r.meta1_percentual,
            meta2_valor: r.meta2_valor, meta2_percentual: r.meta2_percentual,
            meta3_valor: r.meta3_valor, meta3_percentual: r.meta3_percentual,
            percentual_sem_meta: r.percentual_sem_meta,
          };
        });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bonusRow = bonusResult.recordset[0] as any | null;
        const bonus: BonusConfig | null = bonusRow ? {
          bonus1_valor: bonusRow.bonus1_valor, bonus1_percentual: bonusRow.bonus1_percentual,
          bonus2_valor: bonusRow.bonus2_valor, bonus2_percentual: bonusRow.bonus2_percentual,
          bonus3_valor: bonusRow.bonus3_valor, bonus3_percentual: bonusRow.bonus3_percentual,
          bonus4_valor: bonusRow.bonus4_valor, bonus4_percentual: bonusRow.bonus4_percentual,
          bonus5_valor: bonusRow.bonus5_valor, bonus5_percentual: bonusRow.bonus5_percentual,
        } : null;

        const allVendors = new Set([...Object.keys(paMap), ...Object.keys(recMap)]);
        for (const vendedor of allVendors) {
          const pa = paMap[vendedor] || 0;
          const rec = recMap[vendedor] || 0;
          total_pa_televendas += pa;
          total_recebimentos_televendas += rec;
          const meta = metaMap[vendedor] || null;
          if (meta) {
            const c = calcularComissaoTelevendas(pa, rec, meta, bonus);
            total_comissao_televendas += c.comissao_total;
          }
        }
      } catch (commErr) {
        console.error('[dashboard] comissão Televendas falhou:', commErr);
      }
    }

    return NextResponse.json({
      total_vendas: totalAno.recordset[0]?.total_vendas || 0,
      total_vendas_mes: totalMes.recordset[0]?.total_mes || 0,
      total_vendedores: totalAno.recordset[0]?.total_vendedores || 0,
      total_setores: totalAno.recordset[0]?.total_setores || 0,
      top_vendedores: topVendedores.recordset,
      vendas_por_setor: porSetor.recordset,
      vendas_por_empresa: porEmpresa.recordset,
      tendencia_mensal: tendencia.recordset,
      total_pa_televendas,
      total_recebimentos_televendas,
      total_comissao_televendas,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
