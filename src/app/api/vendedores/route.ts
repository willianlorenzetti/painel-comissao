import { NextRequest, NextResponse } from 'next/server';
import { getUsuario, podeVerTudo } from '@/lib/permissions';
import { isTelevendas } from '@/lib/commission';
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
  const setor = searchParams.get('setor');
  const empresa = searchParams.get('empresa');

  const dataInicio = mes ? `${ano}-${mes.padStart(2, '0')}-01` : `${ano}-01-01`;
  const dataFim = mes
    ? new Date(ano, parseInt(mes), 0).toISOString().split('T')[0]
    : `${ano}-12-31`;

  const verTudo = podeVerTudo(usuario.cargo);
  const userSetores = verTudo ? [] : usuario.setores;

  // Filtro de setor manual dentro dos setores permitidos
  if (setor && !verTudo && !usuario.setores.includes(setor)) {
    return NextResponse.json([]);
  }

  try {
    const [todasVendas, todosReceb] = await Promise.all([
      getVendas(ano),
      getRecebimentos(ano),
    ]);

    const vendas = filtrarVendas(todasVendas, {
      inicio: dataInicio,
      fim: dataFim,
      userSetores,
      setores: setor ? [setor] : [],
      empresa: empresa ?? undefined,
    }).filter(v => v.USU_NOME !== null);

    const recMap: Record<string, number> = {};
    filtrarReceb(todosReceb, { inicio: dataInicio, fim: dataFim }).forEach(r => {
      if (r.REP_NOME) recMap[r.REP_NOME] = (recMap[r.REP_NOME] ?? 0) + r.TOTAL;
    });

    // Agrupa por vendedor + setor (equivalente ao GROUP BY USU_NOME, RVS_NOME)
    const byKey = groupBy(vendas, v => `${v.USU_NOME}||${v.RVS_NOME ?? ''}`);

    const resultado = [...byKey.entries()]
      .map(([key, rows]) => {
        const [vendedor, setorV] = key.split('||');
        const datas = rows.map(r => r.PDV_DATA.getTime());
        return {
          vendedor,
          setor: setorV,
          empresa: rows[0].EMP,
          total_vendas: somarVendas(rows),
          total_qtde: rows.reduce((s, r) => s + r.QTDE, 0),
          total_registros: rows.length,
          primeira_venda: new Date(Math.min(...datas)),
          ultima_venda: new Date(Math.max(...datas)),
          valor_pa: rows.reduce((s, r) => {
            const isPA = r.SUBGRUPO === 'CHAVE' || ['PRODUÇÃO', 'DOVALE'].includes(r.GRUPO ?? '');
            return s + (isPA ? r.SUM : 0);
          }, 0),
          total_recebido: recMap[vendedor] ?? 0,
          is_televendas: isTelevendas(setorV),
        };
      })
      .sort((a, b) => b.total_vendas - a.total_vendas);

    const res = NextResponse.json(resultado);
    res.headers.set('Cache-Control', 'private, max-age=30, stale-while-revalidate=60');
    return res;
  } catch (error) {
    console.error('Erro ao buscar vendedores:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
