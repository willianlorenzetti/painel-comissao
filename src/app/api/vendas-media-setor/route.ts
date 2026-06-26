import { NextRequest, NextResponse } from 'next/server';
import { getUsuario } from '@/lib/permissions';
import { getVendas, filtrarVendas, somarVendas } from '@/lib/dados-externos';

const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const setor = params.get('setor') || '';
  const mes = parseInt(params.get('mes') || '0');
  const ano = parseInt(params.get('ano') || '0');

  if (!setor || !mes || !ano) {
    return NextResponse.json({ error: 'Parâmetros inválidos' }, { status: 400 });
  }

  // Últimos 3 meses completos antes de (mes, ano)
  const periodos: { ano: number; mes: number }[] = [];
  let m = mes - 1, a = ano;
  for (let i = 0; i < 3; i++) {
    if (m === 0) { m = 12; a--; }
    periodos.unshift({ ano: a, mes: m });
    m--;
  }

  try {
    const anosNecessarios = [...new Set(periodos.map(p => p.ano))];
    const vendasPorAno = await Promise.all(anosNecessarios.map(a2 => getVendas(a2)));
    const todasVendas = vendasPorAno.flat();

    const resultados = periodos.map(({ ano: a2, mes: m2 }) => {
      const ultimoDia = new Date(a2, m2, 0).getDate();
      const inicio = `${a2}-${String(m2).padStart(2, '0')}-01`;
      const fim = `${a2}-${String(m2).padStart(2, '0')}-${String(ultimoDia).padStart(2, '0')}`;

      const rows = filtrarVendas(todasVendas, {
        inicio, fim,
        setores: [setor.toUpperCase()],
        userSetores: [],
      });

      return {
        ano: a2,
        mes: m2,
        label: `${MESES_PT[m2 - 1]}/${String(a2).slice(2)}`,
        total: somarVendas(rows),
      };
    });

    const media = resultados.reduce((s, r) => s + r.total, 0) / resultados.length;

    return NextResponse.json({
      media: Math.round(media * 100) / 100,
      meses: resultados,
    });
  } catch (err) {
    console.error('[vendas-media-setor]', err);
    return NextResponse.json({ error: 'Erro ao consultar dados' }, { status: 500 });
  }
}
