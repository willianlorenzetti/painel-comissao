import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUsuario, podeVerTudo } from '@/lib/permissions';
import { SETORES_ATIVOS } from '@/lib/setores';
import { getVendas, filtrarVendas } from '@/lib/dados-externos';
import { ensureVendedorAtivoTable } from '@/lib/vendedorAtivoTable';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  if (usuario.cargo === 'VENDEDOR') {
    return NextResponse.json({
      vendedores: usuario.nome_vendedor ? [usuario.nome_vendedor] : [],
      setores: [],
      empresas: [],
    });
  }

  try {
    const ano = new Date().getFullYear();
    const verTudo = podeVerTudo(usuario.cargo);

    // Lê todos os vendedores do ano dos bancos externos
    const todasVendas = await getVendas(ano);

    // Aplica filtro de setores do usuário (GESTOR só vê seus setores)
    const userSetores = verTudo ? [] : usuario.setores;
    const setorFiltro = req.nextUrl.searchParams.get('setor');
    const vendas = filtrarVendas(todasVendas, {
      inicio: `${ano}-01-01`,
      fim: `${ano}-12-31`,
      userSetores,
      setores: setorFiltro ? [setorFiltro] : [],
    });

    // Vendedores inativos (ainda vem do SQL Server)
    let inativosSet = new Set<string>();
    try {
      await ensureVendedorAtivoTable();
      const pool = await getPool();
      const res = await pool.request().query(
        `SELECT nome_vendedor FROM [TI-PAINELCOMISSAO_VENDEDOR_ATIVO] WHERE ativo = 0`
      );
      inativosSet = new Set(res.recordset.map((r: { nome_vendedor: string }) => r.nome_vendedor));
    } catch { /* se falhar, não filtra inativos */ }

    const vendedores = [...new Set(
      vendas.filter(v => v.USU_NOME && !inativosSet.has(v.USU_NOME)).map(v => v.USU_NOME!)
    )].sort();

    const setores = verTudo
      ? [...SETORES_ATIVOS]
      : usuario.setores.filter(s => (SETORES_ATIVOS as readonly string[]).includes(s));

    const empresas = [...new Set(vendas.map(v => v.EMP).filter(Boolean))].sort();

    const res = NextResponse.json({ vendedores, setores, empresas });
    res.headers.set('Cache-Control', 'private, max-age=60, stale-while-revalidate=120');
    return res;
  } catch (error) {
    console.error('Erro ao buscar filtros:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
