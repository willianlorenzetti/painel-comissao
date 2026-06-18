import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario, podeVerTudo, buildSetorFilter } from '@/lib/permissions';
import { addSetoresGlobais } from '@/lib/setores';

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  if (usuario.cargo === 'VENDEDOR') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const ano = searchParams.get('ano') || new Date().getFullYear().toString();
  const mes = searchParams.get('mes');
  const setor = searchParams.get('setor');
  const empresa = searchParams.get('empresa');

  try {
    const pool = await getPool();

    const dataInicio = mes ? `${ano}-${mes.padStart(2, '0')}-01` : `${ano}-01-01`;
    const dataFim = mes
      ? new Date(parseInt(ano), parseInt(mes), 0).toISOString().split('T')[0]
      : `${ano}-12-31`;

    const request = pool
      .request()
      .input('inicio', sql.Date, dataInicio)
      .input('fim', sql.Date, dataFim);

    let where = 'WHERE PDV_DATA >= @inicio AND PDV_DATA <= @fim AND USU_NOME IS NOT NULL';
    where = addSetoresGlobais(request, where);

    // Filtro de setor por permissão (GESTOR vê só os seus)
    const verTudo = podeVerTudo(usuario.cargo);
    if (!verTudo) {
      where = buildSetorFilter(request, usuario.setores, where);
    }

    // Filtro manual do usuário (apenas dentro dos setores permitidos)
    if (setor) {
      if (!verTudo && !usuario.setores.includes(setor)) {
        return NextResponse.json([], );
      }
      request.input('setor', sql.VarChar, setor);
      where += ' AND RVS_NOME = @setor';
    }
    if (empresa) {
      request.input('empresa', sql.VarChar, empresa);
      where += ' AND LTRIM(RTRIM(EMP)) = @empresa';
    }

    const result = await request.query(`
      SELECT USU_NOME as vendedor, RVS_NOME as setor,
             MIN(LTRIM(RTRIM(EMP))) as empresa,
             SUM([SUM]) as total_vendas, SUM(QTDE) as total_qtde,
             COUNT(*) as total_registros,
             MIN(PDV_DATA) as primeira_venda, MAX(PDV_DATA) as ultima_venda
      FROM [TI-COMERCIAL_45-VendaPorSetor]
      ${where}
      GROUP BY USU_NOME, RVS_NOME
      ORDER BY total_vendas DESC
    `);

    return NextResponse.json(result.recordset);
  } catch (error) {
    console.error('Erro ao buscar vendedores:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
