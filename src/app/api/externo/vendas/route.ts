import { NextRequest, NextResponse } from 'next/server';
import { getUsuario } from '@/lib/permissions';
import { queryFirebird } from '@/lib/firebird';
import { queryMySQL } from '@/lib/mysql-ext';
import { fbSJC, fbSPM, fbLockeyMG, fbLockey, myLockeyRS, myNiteroi } from '@/lib/db-externas';

// Firebird vendas — emp literal (SJC, SPM, LOCKEY MG)
function fbVendas(emp: string) {
  return `
    select '${emp}' as emp,ped.pdv_data, ea.eta_descricao, r.rep_nome usu_nome,g.nome grupo, pn.nome subgrupo, pg.nome as familia ,sum(i.pvi_quantidade) qtde, rs.rvs_nome,
    (SUM((COALESCE(i.PVI_TOTALITEM,0) +
    COALESCE(i.PVI_SUBSTICMS,0) +
    COALESCE(i.pvi_vl_fcp_st,0)+
    COALESCE(i.PVI_IPIVALOR,0)))) as total
    from pedidos_vendas ped
    inner join pedidos_vendas_itens i on i.pvi_numero = ped.pdv_numero
    inner join produtos p on p.pro_codigo = i.pvi_pro_codigo
    inner join clientes c on c.cli_codigo = ped.pdv_cli_codigo
    inner join filiais f on f.fil_codigo = ped.emp_fil_codigo
    left join entidades_atividades ea on ea.eta_codigo = c.cli_eta_codigo
    left join representantes r on r.rep_codigo = ped.pdv_rep_codigo
    inner join representantes_supervisores rs on rs.rvs_codigo = r.rep_rvs_codigo
    left join produtos_nivel2 pn on pn.codigo = p.pro_nivel2
    left join produtos_nivel1 g on g.codigo = p.pro_nivel1
    left join produtos_nivel3 pg on pg.codigo = p.pro_nivel3
    where ped.pdv_data > DATEADD(MONTH, -4, current_date)
    and ped.pdv_psi_codigo not in ('CC')
    and ped.pdv_tve_codigo not in ('6','7','26', '34')
    and c.cli_codigo not in ('44274','98030','49268')
    group by emp,ped.pdv_data, ea.eta_descricao, usu_nome,grupo, pn.nome, familia, rs.rvs_nome
  `;
}

// Firebird vendas — Lockey SP (11) + FAST (12), mesma base
const FB_VENDAS_LOCKEY = `
  select CASE WHEN ped.emp_fil_codigo = '11' THEN 'Lockey SP' WHEN ped.emp_fil_codigo = '12' THEN 'FAST' END as emp,ped.pdv_data, ea.eta_descricao, r.rep_nome usu_nome,g.nome grupo, pn.nome subgrupo, pg.nome as familia ,sum(i.pvi_quantidade) qtde, rs.rvs_nome,
  (SUM((COALESCE(i.PVI_TOTALITEM,0) +
  COALESCE(i.PVI_SUBSTICMS,0) +
  COALESCE(i.pvi_vl_fcp_st,0)+
  COALESCE(i.PVI_IPIVALOR,0)))) as total
  from pedidos_vendas ped
  inner join pedidos_vendas_itens i on i.pvi_numero = ped.pdv_numero
  inner join produtos p on p.pro_codigo = i.pvi_pro_codigo
  inner join clientes c on c.cli_codigo = ped.pdv_cli_codigo
  inner join filiais f on f.fil_codigo = ped.emp_fil_codigo
  left join entidades_atividades ea on ea.eta_codigo = c.cli_eta_codigo
  left join representantes r on r.rep_codigo = ped.pdv_rep_codigo
  inner join representantes_supervisores rs on rs.rvs_codigo = r.rep_rvs_codigo
  left join produtos_nivel2 pn on pn.codigo = p.pro_nivel2
  left join produtos_nivel1 g on g.codigo = p.pro_nivel1
  left join produtos_nivel3 pg on pg.codigo = p.pro_nivel3
  where ped.pdv_data > DATEADD(MONTH, -4, current_date)
  and ped.pdv_psi_codigo not in ('CC')
  and ped.pdv_tve_codigo not in ('6','7','26', '34')
  and c.cli_codigo not in ('44274','98030','49268')
  and ped.emp_fil_codigo in ('11','12')
  group by emp,ped.pdv_data, ea.eta_descricao, usu_nome,grupo, pn.nome, familia, rs.rvs_nome
`;

// MySQL vendas — Lockey RS e Niterói (mesma estrutura SAS)
function mysqlVendas(emp: string) {
  return `
    select '${emp}' as emp, o.\`Data\` as pdv_data,o.NomeVendedor as usu_nome, v.departamento as eta_descricao, p.Grupo as grupo, v.departamento as rvs_nome,
    p.subGrupo as subgrupo, p.fabricante as familia, sum(i.Qtd) qtde, sum(i.Total) as total
    from orcamentoitens i
    inner join orcamento o on i.Numero = o.IdPedido
    inner join pacad p on p.codigopro = i.CodigoVenda
    inner join vendedores v on v.codid = o.vendedor
    where o.\`Data\` >= DATE_SUB(CURDATE(), INTERVAL 4 MONTH)
    and o.Orcamento = 'PEDIDO'
    and o.wsalt not in ('2')
    and o.idFormaPagamento not in ('26')
    group by 1,2,3,4,5,6,7,8
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
    queryFirebird(fbSJC, fbVendas('SJC')),
    queryFirebird(fbSPM, fbVendas('SPM')),
    queryFirebird(fbLockeyMG, fbVendas('LOCKEY MG')),
    queryFirebird(fbLockey, FB_VENDAS_LOCKEY),
    queryMySQL(myLockeyRS, mysqlVendas('LOCKEY RS')),
    queryMySQL(myNiteroi, mysqlVendas('NITEROI')),
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
