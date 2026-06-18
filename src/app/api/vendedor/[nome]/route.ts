import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario, podeVerTudo } from '@/lib/permissions';
import { addSetoresGlobais } from '@/lib/setores';

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

  // VENDEDOR só pode ver os próprios dados
  if (usuario.cargo === 'VENDEDOR') {
    if (usuario.nome_vendedor !== vendedor) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }
  }

  // GESTOR só pode ver vendedores dos seus setores — verificação feita após buscar o resumo
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

    const [resumo, mensal, porSubgrupo, vendas] = await Promise.all([
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
    ]);

    // GESTOR: valida que o vendedor pertence a um dos seus setores
    if (!podeVerTudo(usuario.cargo) && usuario.cargo !== 'VENDEDOR') {
      const setorDoVendedor = resumo.recordset[0]?.setor;
      if (setorDoVendedor && !usuario.setores.includes(setorDoVendedor)) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
    }

    // Busca meta mensal primeiro; fallback para meta fixa
    let metaVendedor = { recordset: [] as Array<Record<string,unknown>> };
    if (mes) {
      metaVendedor = await pool
        .request()
        .input('nomeVend', sql.VarChar, vendedor)
        .input('anoMeta', sql.Int, parseInt(ano))
        .input('mesMeta', sql.Int, parseInt(mes))
        .query('SELECT meta1_valor, meta1_percentual, meta2_valor, meta2_percentual, meta3_valor, meta3_percentual FROM VendedorMetaMensal WHERE nome_vendedor=@nomeVend AND ano=@anoMeta AND mes=@mesMeta')
        .catch(() => ({ recordset: [] as Array<Record<string,unknown>> }));
    }
    if (!metaVendedor.recordset.length) {
      metaVendedor = await pool
        .request()
        .input('nomeVend', sql.VarChar, vendedor)
        .query('SELECT meta1_valor, meta1_percentual, meta2_valor, meta2_percentual, meta3_valor, meta3_percentual FROM VendedorMeta WHERE nome_vendedor=@nomeVend')
        .catch(() => ({ recordset: [] as Array<Record<string,unknown>> }));
    }

    return NextResponse.json({
      resumo: resumo.recordset,
      mensal: mensal.recordset,
      porSubgrupo: porSubgrupo.recordset,
      vendas: vendas.recordset,
      meta_vendedor: metaVendedor.recordset[0] || null,
    });
  } catch (error) {
    console.error('Erro ao buscar vendedor:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
