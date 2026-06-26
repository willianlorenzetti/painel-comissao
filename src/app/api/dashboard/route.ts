import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario, podeVerTudo } from '@/lib/permissions';
import { calcularComissaoTelevendas, MetaConfig, BonusConfig } from '@/lib/commission';
import {
  getVendas, getRecebimentos,
  filtrarVendas, filtrarReceb,
  somarVendas, somarReceb,
  groupBy,
} from '@/lib/dados-externos';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  if (usuario.cargo === 'VENDEDOR') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get('ano') || new Date().getFullYear().toString());
  const mes = searchParams.get('mes');

  const dataInicio = mes ? `${ano}-${mes.padStart(2, '0')}-01` : `${ano}-01-01`;
  const dataFim = mes
    ? new Date(ano, parseInt(mes), 0).toISOString().split('T')[0]
    : `${ano}-12-31`;

  const verTudo = podeVerTudo(usuario.cargo);
  const userSetores = verTudo ? [] : usuario.setores;

  try {
    const [todasVendas, todosReceb] = await Promise.all([
      getVendas(ano),
      getRecebimentos(ano),
    ]);

    const fBase = { userSetores, setores: [], inicio: `${ano}-01-01`, fim: `${ano}-12-31` };
    const fPeriodo = { userSetores, setores: [], inicio: dataInicio, fim: dataFim };

    const vendasAno = filtrarVendas(todasVendas, fBase);
    const vendasPeriodo = filtrarVendas(todasVendas, fPeriodo);

    // ── Total Ano ──────────────────────────────────────────────────────────
    const total_vendas = somarVendas(vendasAno);
    const total_vendedores = new Set(vendasAno.filter(v => v.SUM > 0 && v.USU_NOME).map(v => v.USU_NOME)).size;
    const total_setores = new Set(vendasAno.filter(v => v.RVS_NOME).map(v => v.RVS_NOME)).size;

    // ── Total Mês / Período ────────────────────────────────────────────────
    const total_vendas_mes = somarVendas(vendasPeriodo);

    // ── Top 10 vendedores (período) ────────────────────────────────────────
    const byVend = groupBy(vendasPeriodo.filter(v => v.USU_NOME), v => `${v.USU_NOME}||${v.RVS_NOME}||${v.EMP}`);
    const top_vendedores = [...byVend.entries()]
      .map(([k, rows]) => {
        const [vendedor, setor, empresa] = k.split('||');
        return {
          vendedor,
          setor,
          empresa,
          total_vendas: somarVendas(rows),
          total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
          total_registros: rows.length,
        };
      })
      .sort((a, b) => b.total_vendas - a.total_vendas)
      .slice(0, 10);

    // ── Vendas por setor (período) ─────────────────────────────────────────
    const bySetor = groupBy(vendasPeriodo.filter(v => v.RVS_NOME), v => v.RVS_NOME!);
    const vendas_por_setor = [...bySetor.entries()]
      .map(([setor, rows]) => ({
        setor,
        total_vendas: somarVendas(rows),
        total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
        total_registros: rows.length,
      }))
      .sort((a, b) => b.total_vendas - a.total_vendas);

    // ── Vendas por empresa (ano) ───────────────────────────────────────────
    const byEmp = groupBy(vendasAno, v => v.EMP);
    const vendas_por_empresa = [...byEmp.entries()]
      .map(([empresa, rows]) => ({
        empresa,
        total_vendas: somarVendas(rows),
        total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
      }))
      .sort((a, b) => b.total_vendas - a.total_vendas);

    // ── Tendência mensal (ano) ─────────────────────────────────────────────
    const byMes = groupBy(vendasAno, v => {
      const m = v.PDV_DATA.getMonth() + 1;
      return `${ano}-${String(m).padStart(2, '0')}`;
    });
    const tendencia_mensal = [...byMes.entries()]
      .map(([key, rows]) => {
        const m = parseInt(key.split('-')[1]);
        return {
          ano,
          mes: m,
          total_vendas: somarVendas(rows),
          total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
        };
      })
      .sort((a, b) => a.mes - b.mes);

    // ── Comissão Televendas (só quando mês selecionado) ────────────────────
    let total_pa_televendas = 0;
    let total_recebimentos_televendas = 0;
    let total_comissao_televendas = 0;

    if (mes) {
      try {
        const pool = await getPool();

        const televendasSetores = ['TELEVENDAS', 'TELEVENDAS MG'];

        // PA = vendas televendas no período
        const vendasTv = filtrarVendas(todasVendas, { ...fPeriodo, setores: televendasSetores });
        const paMap: Record<string, number> = {};
        vendasTv.filter(v => v.USU_NOME).forEach(v => {
          paMap[v.USU_NOME!] = (paMap[v.USU_NOME!] ?? 0) + v.SUM;
        });

        // Vendedores televendas
        const vendedoresTv = Object.keys(paMap);

        // Recebimentos televendas no período
        const recebTv = filtrarReceb(todosReceb, { inicio: dataInicio, fim: dataFim });
        const recMap: Record<string, number> = {};
        recebTv
          .filter(r => r.REP_NOME && vendedoresTv.includes(r.REP_NOME))
          .forEach(r => { recMap[r.REP_NOME!] = (recMap[r.REP_NOME!] ?? 0) + r.TOTAL; });

        // Metas e bônus do SQL Server (configuração permanece lá)
        const [metaResult, bonusResult] = await Promise.all([
          pool.request()
            .input('metaAno', sql.Int, ano)
            .input('metaMes', sql.VarChar, mes)
            .query(`
              SELECT VENDEDOR as nome_vendedor,
                     META1_VALOR as meta1_valor, META1_PERCENTUAL as meta1_percentual,
                     META2_VALOR as meta2_valor, META2_PERCENTUAL as meta2_percentual,
                     META3_VALOR as meta3_valor, META3_PERCENTUAL as meta3_percentual,
                     ISNULL(PERCENTUAL_SEM_META,0) as percentual_sem_meta
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
      total_vendas,
      total_vendas_mes,
      total_vendedores,
      total_setores,
      top_vendedores,
      vendas_por_setor,
      vendas_por_empresa,
      tendencia_mensal,
      total_pa_televendas,
      total_recebimentos_televendas,
      total_comissao_televendas,
    });
  } catch (error) {
    console.error('Erro ao buscar dashboard:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}

