import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario, podeVerTudo } from '@/lib/permissions';
import { addSetoresGlobais } from '@/lib/setores';
import { calcularComissaoTelevendas, isTelevendas, type MetaConfig, type BonusConfig } from '@/lib/commission';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ nome: string }> }
) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { nome } = await params;
  const vendedor = decodeURIComponent(nome);

  if (usuario.cargo === 'VENDEDOR') {
    if (usuario.nome_vendedor !== vendedor) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
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

    const rResumo = pool.request()
      .input('vendedor', sql.VarChar, vendedor)
      .input('inicio', sql.Date, dataInicio)
      .input('fim', sql.Date, dataFim);
    const wResumo = addSetoresGlobais(rResumo, 'WHERE USU_NOME = @vendedor AND PDV_DATA >= @inicio AND PDV_DATA <= @fim');

    const rMensal = pool.request()
      .input('vendedor', sql.VarChar, vendedor)
      .input('inicio', sql.Date, `${ano}-01-01`)
      .input('fim', sql.Date, `${ano}-12-31`);
    const wMensal = addSetoresGlobais(rMensal, 'WHERE USU_NOME = @vendedor AND PDV_DATA >= @inicio AND PDV_DATA <= @fim');

    const rSubgrupo = pool.request()
      .input('vendedor', sql.VarChar, vendedor)
      .input('inicio', sql.Date, dataInicio)
      .input('fim', sql.Date, dataFim);
    const wSubgrupo = addSetoresGlobais(rSubgrupo, 'WHERE USU_NOME = @vendedor AND PDV_DATA >= @inicio AND PDV_DATA <= @fim');

    const rVendas = pool.request()
      .input('vendedor', sql.VarChar, vendedor)
      .input('inicio', sql.Date, dataInicio)
      .input('fim', sql.Date, dataFim);
    const wVendas = addSetoresGlobais(rVendas, 'WHERE USU_NOME = @vendedor AND PDV_DATA >= @inicio AND PDV_DATA <= @fim');

    const rPA = pool.request()
      .input('vendedor', sql.VarChar, vendedor)
      .input('inicio', sql.Date, dataInicio)
      .input('fim', sql.Date, dataFim);
    const wPA = addSetoresGlobais(rPA, 'WHERE USU_NOME = @vendedor AND PDV_DATA >= @inicio AND PDV_DATA <= @fim');

    const [resumo, mensal, porSubgrupo, vendas, paResult] = await Promise.all([
      rResumo.query(`
        SELECT USU_NOME as vendedor, RVS_NOME as setor, LTRIM(RTRIM(EMP)) as empresa,
               SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde, COUNT(*) as total_registros
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        ${wResumo}
        GROUP BY USU_NOME, RVS_NOME, LTRIM(RTRIM(EMP))
      `),

      rMensal.query(`
        SELECT MONTH(PDV_DATA) as mes, SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        ${wMensal}
        GROUP BY MONTH(PDV_DATA) ORDER BY mes
      `),

      rSubgrupo.query(`
        SELECT SUBGRUPO as subgrupo, SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        ${wSubgrupo}
        GROUP BY SUBGRUPO ORDER BY total_vendas DESC
      `),

      rVendas.query(`
        SELECT TOP 100 PDV_DATA as data, ETA_DESCRICAO as cliente, SUBGRUPO as subgrupo,
               FAMILIA as familia, QTDE as qtde, [SUM] as valor, LTRIM(RTRIM(EMP)) as empresa
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        ${wVendas}
        ORDER BY PDV_DATA DESC
      `),

      // Valor PA: CHAVE (SUBGRUPO='CHAVE') + FERRAGENS PA (GRUPO IN ('PRODUÇÃO','DOVALE'))
      rPA.query(`
        SELECT
          SUM(CASE WHEN SUBGRUPO = 'CHAVE' OR GRUPO IN ('PRODUÇÃO','DOVALE') THEN [SUM] ELSE 0 END) as valor_pa,
          SUM(CASE WHEN SUBGRUPO = 'CHAVE' THEN [SUM] ELSE 0 END) as valor_chave,
          SUM(CASE WHEN GRUPO IN ('PRODUÇÃO','DOVALE') AND SUBGRUPO != 'CHAVE' THEN [SUM] ELSE 0 END) as valor_ferragens_pa,
          SUM(CASE WHEN SUBGRUPO != 'CHAVE' AND (GRUPO IS NULL OR GRUPO NOT IN ('PRODUÇÃO','DOVALE')) THEN [SUM] ELSE 0 END) as valor_mercadoria
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        ${wPA}
      `),
    ]);

    // Permissão GESTOR
    if (!podeVerTudo(usuario.cargo) && usuario.cargo !== 'VENDEDOR') {
      const setorDoVendedor = resumo.recordset[0]?.setor;
      if (setorDoVendedor && !usuario.setores.includes(setorDoVendedor)) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
    }

    // Detecta se é setor Televendas
    const setor = resumo.recordset[0]?.setor as string ?? '';
    const is_televendas = isTelevendas(setor);

    const valor_pa = Number(paResult.recordset[0]?.valor_pa ?? 0);
    const valor_chave = Number(paResult.recordset[0]?.valor_chave ?? 0);
    const valor_ferragens_pa = Number(paResult.recordset[0]?.valor_ferragens_pa ?? 0);
    const valor_mercadoria = Number(paResult.recordset[0]?.valor_mercadoria ?? 0);

    // Garante que a coluna PERCENTUAL_SEM_META existe (cria se necessário)
    await pool.request().query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'TI-PAINELCOMISSAO_METAS' AND COLUMN_NAME = 'PERCENTUAL_SEM_META'
      )
      BEGIN
        ALTER TABLE [TI-PAINELCOMISSAO_METAS] ADD PERCENTUAL_SEM_META FLOAT DEFAULT 0;
      END
    `).catch(() => {});

    // Busca meta mensal
    let metaVendedor = { recordset: [] as Array<Record<string, unknown>> };
    if (mes) {
      metaVendedor = await pool
        .request()
        .input('nomeVend', sql.VarChar, vendedor)
        .input('anoMeta',  sql.Int,     parseInt(ano))
        .input('mesMeta',  sql.VarChar, mes)
        .query(`SELECT META1_VALOR as meta1_valor, META1_PERCENTUAL as meta1_percentual,
                       META2_VALOR as meta2_valor, META2_PERCENTUAL as meta2_percentual,
                       META3_VALOR as meta3_valor, META3_PERCENTUAL as meta3_percentual,
                       ISNULL(PERCENTUAL_SEM_META,0) as percentual_sem_meta
                FROM [TI-PAINELCOMISSAO_METAS]
                WHERE VENDEDOR=@nomeVend AND ANO=@anoMeta AND MES=@mesMeta`)
        .catch(() => ({ recordset: [] as Array<Record<string, unknown>> }));
    }
    if (!metaVendedor.recordset.length) {
      metaVendedor = await pool
        .request()
        .input('nomeVend', sql.VarChar, vendedor)
        .query('SELECT meta1_valor, meta1_percentual, meta2_valor, meta2_percentual, meta3_valor, meta3_percentual FROM VendedorMeta WHERE nome_vendedor=@nomeVend')
        .catch(() => ({ recordset: [] as Array<Record<string, unknown>> }));
    }

    // Busca config de bônus global (TI-PAINELCOMISSAO_BONUS_CONFIG)
    let bonusConfig: BonusConfig | null = null;
    if (is_televendas) {
      const bonusResult = await pool
        .request()
        .query(`SELECT TOP 1
                  BONUS1_VALOR as bonus1_valor, BONUS1_PERCENTUAL as bonus1_percentual,
                  BONUS2_VALOR as bonus2_valor, BONUS2_PERCENTUAL as bonus2_percentual,
                  BONUS3_VALOR as bonus3_valor, BONUS3_PERCENTUAL as bonus3_percentual,
                  BONUS4_VALOR as bonus4_valor, BONUS4_PERCENTUAL as bonus4_percentual,
                  BONUS5_VALOR as bonus5_valor, BONUS5_PERCENTUAL as bonus5_percentual
                FROM [TI-PAINELCOMISSAO_BONUS_CONFIG]`)
        .catch(() => ({ recordset: [] as Array<Record<string, unknown>> }));
      if (bonusResult.recordset.length) {
        bonusConfig = bonusResult.recordset[0] as unknown as BonusConfig;
      }
    }

    // Busca recebimentos do mês (TI-FINANCEIRO_55-Recebimento)
    let total_recebido = 0;
    if (is_televendas && mes) {
      const recResult = await pool
        .request()
        .input('nomeVend', sql.VarChar, vendedor)
        .input('inicio',   sql.Date,    dataInicio)
        .input('fim',      sql.Date,    dataFim)
        .query(`SELECT SUM(TOTAL) as total_recebido
                FROM [TI-FINANCEIRO_55-Recebimento]
                WHERE REP_NOME = @nomeVend AND DATABAIXA >= @inicio AND DATABAIXA <= @fim`)
        .catch((err) => {
          console.error('Recebimentos query error (verifique nome das colunas):', err?.message);
          return { recordset: [{ total_recebido: 0 }] };
        });
      total_recebido = Number(recResult.recordset[0]?.total_recebido ?? 0);
    }

    // Calcula comissão Televendas
    const metaRow = metaVendedor.recordset[0] as unknown as MetaConfig | null;
    const comissao_televendas = is_televendas
      ? calcularComissaoTelevendas(valor_pa, total_recebido, metaRow, bonusConfig)
      : null;

    return NextResponse.json({
      resumo: resumo.recordset,
      mensal: mensal.recordset,
      porSubgrupo: porSubgrupo.recordset,
      vendas: vendas.recordset,
      meta_vendedor: metaVendedor.recordset[0] || null,
      // Campos Televendas
      is_televendas,
      valor_pa,
      valor_chave,
      valor_ferragens_pa,
      valor_mercadoria,
      total_recebido,
      bonus_config: bonusConfig,
      comissao_televendas,
    });
  } catch (error) {
    console.error('Erro ao buscar vendedor:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
