import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario, podeVerTudo } from '@/lib/permissions';
import { calcularComissaoTelevendas, isTelevendas, type MetaConfig, type BonusConfig } from '@/lib/commission';
import { calcularComissaoFerragens, isFerragens, type FerrMetaConfig, type FerrBonusConfig, type FerrMetaGrupoConfig } from '@/lib/commission-ferragens';
import { ensureFerrTables } from '@/lib/ferragens-tables';
import {
  getVendas, getRecebimentos,
  filtrarVendas, filtrarReceb,
  somarVendas, somarReceb,
  groupBy,
} from '@/lib/dados-externos';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nome: string }> }
) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { nome } = await params;
  const vendedor = decodeURIComponent(nome).trim();

  if (usuario.cargo === 'VENDEDOR' && usuario.nome_vendedor !== vendedor) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get('ano') || new Date().getFullYear().toString());
  const mes = searchParams.get('mes');

  const dataInicio = mes ? `${ano}-${mes.padStart(2, '0')}-01` : `${ano}-01-01`;
  const dataFim = mes
    ? new Date(ano, parseInt(mes), 0).toISOString().split('T')[0]
    : `${ano}-12-31`;

  try {
    const [todasVendas, todosReceb] = await Promise.all([
      getVendas(ano),
      getRecebimentos(ano),
    ]);

    // Filtro base: só esse vendedor, aplicando SETORES_ATIVOS
    const fPeriodo = { inicio: dataInicio, fim: dataFim, userSetores: [], setores: [], vendedor };
    const fAno = { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, userSetores: [], setores: [], vendedor };

    const vendasPeriodo = filtrarVendas(todasVendas, fPeriodo);
    const vendasAno = filtrarVendas(todasVendas, fAno);

    // ── Resumo ─────────────────────────────────────────────────────────────
    const byResumo = groupBy(vendasPeriodo, v => `${v.USU_NOME}||${v.RVS_NOME ?? ''}||${v.EMP}`);
    const resumo = [...byResumo.entries()].map(([k, rows]) => {
      const [vend, setor, empresa] = k.split('||');
      return {
        vendedor: vend,
        setor,
        empresa,
        total_vendas: somarVendas(rows),
        total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
        total_registros: rows.length,
      };
    });

    // Permissão GESTOR: verifica se o setor do vendedor está nos setores do usuário
    if (!podeVerTudo(usuario.cargo) && usuario.cargo !== 'VENDEDOR') {
      const setorDoVendedor = resumo[0]?.setor;
      if (setorDoVendedor && !usuario.setores.includes(setorDoVendedor)) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
    }

    // ── Mensal (ano completo) ──────────────────────────────────────────────
    const byMes = groupBy(vendasAno, v => String(v.PDV_DATA.getMonth() + 1));
    const mensal = [...byMes.entries()]
      .map(([m, rows]) => ({
        mes: parseInt(m),
        total_vendas: somarVendas(rows),
        total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
      }))
      .sort((a, b) => a.mes - b.mes);

    // ── Por Subgrupo ───────────────────────────────────────────────────────
    const bySub = groupBy(vendasPeriodo, v => v.SUBGRUPO ?? '');
    const porSubgrupo = [...bySub.entries()]
      .map(([subgrupo, rows]) => ({
        subgrupo,
        total_vendas: somarVendas(rows),
        total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
      }))
      .sort((a, b) => b.total_vendas - a.total_vendas);

    // ── Vendas detalhadas (TOP 100) ────────────────────────────────────────
    const vendas = vendasPeriodo
      .sort((a, b) => b.PDV_DATA.getTime() - a.PDV_DATA.getTime())
      .slice(0, 100)
      .map(v => ({
        data: v.PDV_DATA,
        cliente: v.ETA_DESCRICAO,
        subgrupo: v.SUBGRUPO,
        familia: v.FAMILIA,
        qtde: v.QTDE,
        valor: v.SUM,
        empresa: v.EMP,
      }));

    // ── PA ─────────────────────────────────────────────────────────────────
    const valor_pa = vendasPeriodo.reduce((s, v) => {
      const isPA = v.SUBGRUPO === 'CHAVE' || ['PRODUÇÃO', 'DOVALE'].includes(v.GRUPO ?? '');
      return s + (isPA ? v.SUM : 0);
    }, 0);
    const valor_chave = vendasPeriodo.reduce((s, v) => s + (v.SUBGRUPO === 'CHAVE' ? v.SUM : 0), 0);
    const valor_ferragens_pa = vendasPeriodo.reduce((s, v) => {
      const isFerragens = ['PRODUÇÃO', 'DOVALE'].includes(v.GRUPO ?? '') && v.SUBGRUPO !== 'CHAVE';
      return s + (isFerragens ? v.SUM : 0);
    }, 0);
    const valor_mercadoria = vendasPeriodo.reduce((s, v) => {
      const isMerc = v.SUBGRUPO !== 'CHAVE' && !['PRODUÇÃO', 'DOVALE'].includes(v.GRUPO ?? '');
      return s + (isMerc ? v.SUM : 0);
    }, 0);

    // ── Setor ──────────────────────────────────────────────────────────────
    const setor = resumo[0]?.setor ?? '';
    const is_televendas = isTelevendas(setor);
    const is_ferragens = isFerragens(setor);

    const pool = await getPool();

    // Garante coluna PERCENTUAL_SEM_META
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'TI-PAINELCOMISSAO_METAS' AND COLUMN_NAME = 'PERCENTUAL_SEM_META'
      )
      BEGIN ALTER TABLE [TI-PAINELCOMISSAO_METAS] ADD PERCENTUAL_SEM_META FLOAT DEFAULT 0; END
    `).catch(() => {});

    // Meta mensal (SQL Server — configuração permanece lá)
    let metaVendedor = { recordset: [] as Array<Record<string, unknown>> };
    if (mes) {
      metaVendedor = await pool.request()
        .input('nomeVend', sql.VarChar, vendedor)
        .input('anoMeta', sql.Int, ano)
        .input('mesMeta', sql.VarChar, mes)
        .query(`SELECT META1_VALOR as meta1_valor, META1_PERCENTUAL as meta1_percentual,
                       META2_VALOR as meta2_valor, META2_PERCENTUAL as meta2_percentual,
                       META3_VALOR as meta3_valor, META3_PERCENTUAL as meta3_percentual,
                       ISNULL(PERCENTUAL_SEM_META,0) as percentual_sem_meta
                FROM [TI-PAINELCOMISSAO_METAS]
                WHERE VENDEDOR=@nomeVend AND ANO=@anoMeta AND MES=@mesMeta`)
        .catch(() => ({ recordset: [] as Array<Record<string, unknown>> }));
    }

    // Bônus (SQL Server)
    let bonusConfig: BonusConfig | null = null;
    if (is_televendas) {
      const bonusResult = await pool.request()
        .query(`SELECT TOP 1
                  BONUS1_VALOR as bonus1_valor, BONUS1_PERCENTUAL as bonus1_percentual,
                  BONUS2_VALOR as bonus2_valor, BONUS2_PERCENTUAL as bonus2_percentual,
                  BONUS3_VALOR as bonus3_valor, BONUS3_PERCENTUAL as bonus3_percentual,
                  BONUS4_VALOR as bonus4_valor, BONUS4_PERCENTUAL as bonus4_percentual,
                  BONUS5_VALOR as bonus5_valor, BONUS5_PERCENTUAL as bonus5_percentual
                FROM [TI-PAINELCOMISSAO_BONUS_CONFIG]`)
        .catch(() => ({ recordset: [] as Array<Record<string, unknown>> }));
      if (bonusResult.recordset.length) bonusConfig = bonusResult.recordset[0] as unknown as BonusConfig;
    }

    // Recebimentos do vendedor no período
    let total_recebido = 0;
    if ((is_televendas || is_ferragens) && mes) {
      total_recebido = somarReceb(
        filtrarReceb(todosReceb, { inicio: dataInicio, fim: dataFim, vendedor })
      );
    }

    const metaRow = metaVendedor.recordset[0] as unknown as MetaConfig | null;
    const comissao_televendas = is_televendas
      ? calcularComissaoTelevendas(valor_pa, total_recebido, metaRow, bonusConfig)
      : null;

    // ── Ferragens ─────────────────────────────────────────────────────────────
    let comissao_ferragens = null;
    let ferr_meta: FerrMetaConfig | null = null;
    let ferr_bonus: FerrBonusConfig | null = null;
    let ferr_meta_grupo: FerrMetaGrupoConfig | null = null;
    let vendas_setor_ferragens = 0;

    if (is_ferragens && mes) {
      try {
        await ensureFerrTables();
        const [fMetaRes, fBonusRes, fGrupoRes] = await Promise.all([
          pool.request()
            .input('fv', sql.VarChar, vendedor)
            .input('fa', sql.Int, ano)
            .input('fm', sql.Int, parseInt(mes))
            .query(`SELECT META1_VALOR as meta1_valor, META1_PERCENTUAL as meta1_percentual,
                           META2_VALOR as meta2_valor, META2_PERCENTUAL as meta2_percentual,
                           META3_VALOR as meta3_valor, META3_PERCENTUAL as meta3_percentual,
                           METADESAFIO_VALOR as metadesafio_valor, METADESAFIO_PERCENTUAL as metadesafio_percentual,
                           PERCENTUAL_SEM_META as percentual_sem_meta
                    FROM [TI-PAINELCOMISSAO_FERRAGENS_METAS]
                    WHERE VENDEDOR=@fv AND ANO=@fa AND MES=@fm`),
          pool.request()
            .input('fv', sql.VarChar, vendedor)
            .input('fa', sql.Int, ano)
            .input('fm', sql.Int, parseInt(mes))
            .query(`SELECT BONUS1_VALOR as bonus1_valor, BONUS2_VALOR as bonus2_valor,
                           BONUS3_VALOR as bonus3_valor, BONUSDESAFIO_VALOR as bonusdesafio_valor
                    FROM [TI-PAINELCOMISSAO_FERRAGENS_BONUS]
                    WHERE VENDEDOR=@fv AND ANO=@fa AND MES=@fm`),
          pool.request()
            .input('fa', sql.Int, ano)
            .input('fm', sql.Int, parseInt(mes))
            .query(`SELECT TOP 1
                           META1_VALOR as meta1_valor, META1_BONUS as meta1_bonus,
                           META2_VALOR as meta2_valor, META2_BONUS as meta2_bonus,
                           META3_VALOR as meta3_valor, META3_BONUS as meta3_bonus,
                           METADESAFIO_VALOR as metadesafio_valor, METADESAFIO_BONUS as metadesafio_bonus
                    FROM [TI-PAINELCOMISSAO_FERRAGENS_META_GRUPO]
                    WHERE ANO=@fa AND MES=@fm`),
        ]).catch(() => [{ recordset: [] }, { recordset: [] }, { recordset: [] }]) as [
          { recordset: Record<string,unknown>[] },
          { recordset: Record<string,unknown>[] },
          { recordset: Record<string,unknown>[] }
        ];

        if (fMetaRes.recordset.length) ferr_meta = fMetaRes.recordset[0] as unknown as FerrMetaConfig;
        if (fBonusRes.recordset.length) ferr_bonus = fBonusRes.recordset[0] as unknown as FerrBonusConfig;
        if (fGrupoRes.recordset.length) ferr_meta_grupo = fGrupoRes.recordset[0] as unknown as FerrMetaGrupoConfig;

        // Total vendas setor FERRAGENS no período
        const vendasFerragens = filtrarVendas(todasVendas, {
          inicio: dataInicio, fim: dataFim, userSetores: [], setores: ['FERRAGENS'],
        });
        vendas_setor_ferragens = vendasFerragens.reduce((s, v) => s + v.SUM, 0);

        // Total vendas do vendedor (geral, não só PA)
        const vendas_total_vendedor = vendasPeriodo.reduce((s, v) => s + v.SUM, 0);

        comissao_ferragens = calcularComissaoFerragens(
          vendas_total_vendedor, total_recebido,
          ferr_meta, ferr_bonus,
          vendas_setor_ferragens, ferr_meta_grupo,
        );
      } catch (e) {
        console.error('[vendedor ferragens]', e);
      }
    }

    return NextResponse.json({
      resumo,
      mensal,
      porSubgrupo,
      vendas,
      meta_vendedor: metaVendedor.recordset[0] || null,
      is_televendas,
      is_ferragens,
      valor_pa,
      valor_chave,
      valor_ferragens_pa,
      valor_mercadoria,
      total_recebido,
      bonus_config: bonusConfig,
      comissao_televendas,
      comissao_ferragens,
      ferr_meta,
      ferr_bonus,
      ferr_meta_grupo,
      vendas_setor_ferragens,
    });
  } catch (error) {
    console.error('Erro ao buscar vendedor:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
