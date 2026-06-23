import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario } from '@/lib/permissions';

const MESES_PT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const params = req.nextUrl.searchParams;
  const vendedor = params.get('vendedor') || '';
  const mes = parseInt(params.get('mes') || '0');
  const ano = parseInt(params.get('ano') || '0');

  if (!vendedor || !mes || !ano) {
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
    const pool = await getPool();
    const resultados = await Promise.all(
      periodos.map(async ({ ano: a2, mes: m2 }) => {
        const inicio = new Date(a2, m2 - 1, 1);
        const fim = new Date(a2, m2, 0); // último dia do mês
        const r = await pool
          .request()
          .input('vendedor', sql.VarChar, vendedor)
          .input('inicio', sql.Date, inicio)
          .input('fim', sql.Date, fim)
          .query(`
            SELECT ISNULL(SUM(TOTAL), 0) as total
            FROM [TI-FINANCEIRO_55-Recebimento]
            WHERE DATABAIXA >= @inicio AND DATABAIXA <= @fim AND REP_NOME = @vendedor
          `);
        return {
          ano: a2,
          mes: m2,
          label: `${MESES_PT[m2 - 1]}/${String(a2).slice(2)}`,
          total: Number(r.recordset[0]?.total ?? 0),
        };
      })
    );

    const media = resultados.reduce((s, r) => s + r.total, 0) / resultados.length;

    return NextResponse.json({
      media: Math.round(media * 100) / 100,
      meses: resultados,
    });
  } catch (err) {
    console.error('[recebimentos-media]', err);
    return NextResponse.json({ error: 'Erro ao consultar banco' }, { status: 500 });
  }
}
