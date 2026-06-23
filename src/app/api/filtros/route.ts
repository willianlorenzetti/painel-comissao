import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { getUsuario, podeVerTudo, buildSetorFilter } from '@/lib/permissions';
import { addSetoresGlobais } from '@/lib/setores';
import { ensureVendedorAtivoTable } from '@/lib/vendedorAtivoTable';

const FILTRAR_INATIVOS = `AND USU_NOME NOT IN (
  SELECT nome_vendedor FROM [TI-PAINELCOMISSAO_VENDEDOR_ATIVO] WHERE ativo = 0
)`;

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  try {
    const pool = await getPool();
    await ensureVendedorAtivoTable();
    const verTudo = podeVerTudo(usuario.cargo);

    if (usuario.cargo === 'VENDEDOR') {
      // Vendedor só vê o próprio nome
      return NextResponse.json({
        vendedores: usuario.nome_vendedor ? [usuario.nome_vendedor] : [],
        setores: [],
        empresas: [],
      });
    }

    if (verTudo) {
      const rVend = pool.request();
      const wVend = addSetoresGlobais(rVend, `WHERE USU_NOME IS NOT NULL ${FILTRAR_INATIVOS}`);

      const rSet = pool.request();
      const wSet = addSetoresGlobais(rSet, 'WHERE RVS_NOME IS NOT NULL');

      const rEmp = pool.request();
      const wEmp = addSetoresGlobais(rEmp, 'WHERE EMP IS NOT NULL');

      const [vendedores, setores, empresas] = await Promise.all([
        rVend.query(`
          SELECT DISTINCT USU_NOME as nome FROM [TI-COMERCIAL_45-VendaPorSetor]
          ${wVend} ORDER BY USU_NOME
        `),
        rSet.query(`
          SELECT DISTINCT RVS_NOME as nome FROM [TI-COMERCIAL_45-VendaPorSetor]
          ${wSet} ORDER BY RVS_NOME
        `),
        rEmp.query(`
          SELECT DISTINCT LTRIM(RTRIM(EMP)) as nome FROM [TI-COMERCIAL_45-VendaPorSetor]
          ${wEmp} ORDER BY LTRIM(RTRIM(EMP))
        `),
      ]);
      return NextResponse.json({
        vendedores: vendedores.recordset.map((r) => r.nome),
        setores: setores.recordset.map((r) => r.nome),
        empresas: empresas.recordset.map((r) => r.nome),
      });
    }

    // GESTOR: filtrado pelos seus setores (dentro dos setores globais)
    const rVend = pool.request();
    let wVend = addSetoresGlobais(rVend, `WHERE USU_NOME IS NOT NULL ${FILTRAR_INATIVOS}`);
    wVend = buildSetorFilter(rVend, usuario.setores, wVend);

    const rEmp = pool.request();
    let wEmp = addSetoresGlobais(rEmp, 'WHERE EMP IS NOT NULL');
    wEmp = buildSetorFilter(rEmp, usuario.setores, wEmp);

    const [vendedores, empresas] = await Promise.all([
      rVend.query(`
        SELECT DISTINCT USU_NOME as nome FROM [TI-COMERCIAL_45-VendaPorSetor]
        ${wVend} ORDER BY USU_NOME
      `),
      rEmp.query(`
        SELECT DISTINCT LTRIM(RTRIM(EMP)) as nome FROM [TI-COMERCIAL_45-VendaPorSetor]
        ${wEmp} ORDER BY LTRIM(RTRIM(EMP))
      `),
    ]);

    const setoresFiltrados = usuario.setores;

    return NextResponse.json({
      vendedores: vendedores.recordset.map((r) => r.nome),
      setores: setoresFiltrados,
      empresas: empresas.recordset.map((r) => r.nome),
    });
  } catch (error) {
    console.error('Erro ao buscar filtros:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
