import { NextRequest, NextResponse } from 'next/server';
import { getUsuario } from '@/lib/permissions';
import { queryFirebird } from '@/lib/firebird';
import { queryMySQL } from '@/lib/mysql-ext';
import { fbSJC, fbSPM, fbLockeyMG, fbLockey, myLockeyRS, myNiteroi } from '@/lib/db-externas';

// Firebird recebimentos — emp literal (SJC, SPM, LOCKEY MG)
function fbRecebimentos(emp: string) {
  return `
    select '${emp}' as emp, r.rec_numero, b.rbx_dataliberacao as rec_data, r.rec_pedido, r.rec_vencimento, r.rec_valorpago,rep.rep_nome,
    c.cli_nome ,e.eta_descricao ,b.rbx_datapagamento as databaixa,rep.rep_obs1 ,sum(b.rbx_valorbasecomissao) as total
    from receber_titulos r
    inner join receber_baixas b on b.rbx_rec_id = r.rec_id
    inner join representantes rep on rep.rep_codigo = r.rec_rep_codigo
    inner join clientes c on c.cli_codigo = r.rec_cli_codigo
    left join entidades_atividades e on e.eta_codigo = c.cli_eta_codigo
    where b.rbx_dataliberacao > DATEADD(MONTH, -4, current_date)
    and b.rbx_valorbasecomissao > 0
    group by emp, r.rec_numero, rec_data, r.rec_pedido, r.rec_vencimento, r.rec_valorpago,rep.rep_nome, e.eta_descricao ,c.cli_nome,b.rbx_datapagamento, rep.rep_obs1
  `;
}

// Firebird recebimentos — Lockey SP (11) + FAST (12), mesma base
const FB_RECEB_LOCKEY = `
  select CASE WHEN r.rec_fil_codigo = '11' THEN 'LOCKEY SP' WHEN r.rec_fil_codigo = '12' THEN 'FAST' END as emp, r.rec_numero, b.rbx_dataliberacao as rec_data, r.rec_pedido, r.rec_vencimento, r.rec_valorpago,rep.rep_nome,
  c.cli_nome ,e.eta_descricao ,b.rbx_datapagamento as databaixa,rep.rep_obs1 ,sum(b.rbx_valorbasecomissao) as total
  from receber_titulos r
  inner join receber_baixas b on b.rbx_rec_id = r.rec_id
  inner join representantes rep on rep.rep_codigo = r.rec_rep_codigo
  inner join clientes c on c.cli_codigo = r.rec_cli_codigo
  left join entidades_atividades e on e.eta_codigo = c.cli_eta_codigo
  where b.rbx_dataliberacao > DATEADD(MONTH, -4, current_date)
  and b.rbx_valorbasecomissao > 0
  and r.rec_fil_codigo in ('11','12')
  group by emp, r.rec_numero, rec_data, r.rec_pedido, r.rec_vencimento, r.rec_valorpago,rep.rep_nome, e.eta_descricao ,c.cli_nome,b.rbx_datapagamento, rep.rep_obs1
`;

// MySQL recebimentos — Lockey RS e Niterói (mesma estrutura SAS)
function mysqlRecebimentos(emp: string) {
  return `
    select '${emp}' as emp,c.Titulo as rec_numero ,c.Emissao as rec_data,c.Vencimento as rec_vencimento, c.ValorPago as rec_valorpago,v.nomevende as rep_nome, c.NomeDevedor as cli_nome,'ATACADO' as eta_descricao, c.DataBaixa, sum(c.ValorPago) as total
    from contasreceber c
    inner join vendedores v on v.CodId = c.IdVendedor
    where c.DataBaixa >= DATE_SUB(CURDATE(), INTERVAL 4 MONTH)
    group by 1,2,3,4,5,6,7,8,9
  `;
}

const LABELS = ['SJC', 'SPM', 'LOCKEY MG', 'LOCKEY SP/FAST', 'LOCKEY RS', 'NITEROI'];

export async function GET(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const usuario = await getUsuario(email);
  if (!usuario) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  if (usuario.cargo === 'VENDEDOR') {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
  }

  const results = await Promise.allSettled([
    queryFirebird(fbSJC, fbRecebimentos('SJC')),
    queryFirebird(fbSPM, fbRecebimentos('SPM')),
    queryFirebird(fbLockeyMG, fbRecebimentos('LOCKEY MG')),
    queryFirebird(fbLockey, FB_RECEB_LOCKEY),
    queryMySQL(myLockeyRS, mysqlRecebimentos('LOCKEY RS')),
    queryMySQL(myNiteroi, mysqlRecebimentos('NITEROI')),
  ]);

  const data: Record<string, unknown>[] = [];
  const erros: string[] = [];

  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      data.push(...r.value);
    } else {
      erros.push(`${LABELS[i]}: ${(r.reason as Error)?.message ?? String(r.reason)}`);
    }
  });

  return NextResponse.json({ data, erros });
}
