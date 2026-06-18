'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import KPICard from '@/components/ui/KPICard';
import { formatBRL, formatDate, formatNumber, MESES, CORES_GRAFICO } from '@/lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import { DollarSign, TrendingUp, ShoppingBag, ChevronDown, User } from 'lucide-react';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

interface VendedorData {
  resumo: Array<{ vendedor: string; setor: string; empresa: string; total_vendas: number; total_qtde: number; total_registros: number }>;
  mensal: Array<{ mes: number; total_vendas: number; total_qtde: number }>;
  porSubgrupo: Array<{ subgrupo: string; total_vendas: number; total_qtde: number }>;
  vendas: Array<{ data: string; cliente: string; subgrupo: string; familia: string; qtde: number; valor: number; empresa: string }>;
}

interface ComissaoConfig {
  setor: string;
  percentual: number;
  meta_mensal: number;
}

export default function VendedorPage() {
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedorSel, setVendedorSel] = useState('');
  const [ano, setAno] = useState(ANO_ATUAL);
  const [mes, setMes] = useState<number | null>(null);
  const [data, setData] = useState<VendedorData | null>(null);
  const [comissoes, setComissoes] = useState<ComissaoConfig[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/filtros')
      .then((r) => r.json())
      .then((d) => {
        setVendedores(d.vendedores || []);
        if (d.vendedores?.length) setVendedorSel(d.vendedores[0]);
      });
    fetch('/api/comissao')
      .then((r) => r.json())
      .then(setComissoes)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!vendedorSel) return;
    setLoading(true);
    const params = new URLSearchParams({ ano: ano.toString() });
    if (mes) params.set('mes', mes.toString());
    fetch(`/api/vendedor/${encodeURIComponent(vendedorSel)}?${params}`)
      .then((r) => r.json())
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [vendedorSel, ano, mes]);

  const totalVendas = data?.resumo.reduce((s, r) => s + r.total_vendas, 0) || 0;
  const totalQtde = data?.resumo.reduce((s, r) => s + r.total_qtde, 0) || 0;

  const setor = data?.resumo[0]?.setor || '';
  const comissaoConfig = comissoes.find((c) => c.setor === setor);
  const comissaoValor = comissaoConfig ? (totalVendas * comissaoConfig.percentual) / 100 : null;
  const metaMensal = comissaoConfig?.meta_mensal || 0;
  const pctMeta = metaMensal > 0 ? Math.min((totalVendas / metaMensal) * 100, 100) : 0;

  const mensalGrafico = MESES.map((nome, i) => {
    const found = data?.mensal.find((m) => m.mes === i + 1);
    return { name: nome, Vendas: found?.total_vendas || 0 };
  });

  const subgrupoGrafico = data?.porSubgrupo.slice(0, 6).map((s) => ({
    name: s.subgrupo || 'Outros',
    Vendas: s.total_vendas,
  })) || [];

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>
              Painel do Vendedor
            </h1>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Suas vendas e comissões em tempo real
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Selecionar vendedor */}
            <div className="relative">
              <select
                value={vendedorSel}
                onChange={(e) => setVendedorSel(e.target.value)}
                className="appearance-none rounded-lg pl-8 pr-8 py-2 text-sm font-medium cursor-pointer max-w-xs"
                style={{ background: '#00205C', border: 'none', color: '#FFD700' }}
              >
                {vendedores.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <User size={14} className="absolute left-2.5 top-3 pointer-events-none" style={{ color: '#FFD700' }} />
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#FFD700' }} />
            </div>

            <div className="relative">
              <select
                value={mes || ''}
                onChange={(e) => setMes(e.target.value ? parseInt(e.target.value) : null)}
                className="appearance-none rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer"
                style={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#00205C' }}
              >
                <option value="">Todos os meses</option>
                {MESES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
            </div>

            <div className="relative">
              <select
                value={ano}
                onChange={(e) => setAno(parseInt(e.target.value))}
                className="appearance-none rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer"
                style={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#00205C' }}
              >
                {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
            </div>
          </div>
        </div>

        {/* Vendedor Info Card */}
        {data?.resumo[0] && (
          <div
            className="rounded-xl p-4 flex items-center gap-4"
            style={{ background: '#0a1628', border: '1px solid #1a3a6e' }}
          >
            <div
              className="flex items-center justify-center rounded-full shrink-0"
              style={{ width: 48, height: 48, background: '#FFD700' }}
            >
              <User size={24} color="#00205C" />
            </div>
            <div>
              <p className="font-bold text-white">{data.resumo[0].vendedor}</p>
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                {data.resumo[0].setor} &bull; {data.resumo[0].empresa}
              </p>
            </div>
            {comissaoConfig && (
              <div className="ml-auto text-right">
                <p className="text-xs" style={{ color: '#94a3b8' }}>Taxa de comissão</p>
                <p className="text-lg font-bold" style={{ color: '#FFD700' }}>
                  {comissaoConfig.percentual}%
                </p>
              </div>
            )}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            title="Total Vendido"
            value={loading ? '...' : formatBRL(totalVendas)}
            subtitle={mes ? MESES[mes - 1] : `Ano ${ano}`}
            icon={<DollarSign size={18} />}
            accent
          />
          <KPICard
            title="Comissão Estimada"
            value={loading ? '...' : comissaoValor !== null ? formatBRL(comissaoValor) : 'Não configurada'}
            subtitle={comissaoConfig ? `${comissaoConfig.percentual}% sobre vendas` : 'Configure em Configuração'}
            icon={<TrendingUp size={18} />}
          />
          <KPICard
            title="Qtd. Itens Vendidos"
            value={loading ? '...' : formatNumber(totalQtde)}
            subtitle="Total de unidades"
            icon={<ShoppingBag size={18} />}
          />
          <div
            className="rounded-xl p-5 shadow-sm flex flex-col gap-3"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <div className="flex items-start justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                Atingimento de Meta
              </p>
              <span className="text-xs font-bold" style={{ color: '#00205C' }}>
                {pctMeta.toFixed(1)}%
              </span>
            </div>
            <div className="space-y-1">
              <div className="h-3 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${pctMeta}%`,
                    background: pctMeta >= 100 ? '#16a34a' : pctMeta >= 70 ? '#FFD700' : '#00205C',
                  }}
                />
              </div>
              <p className="text-xs" style={{ color: '#94a3b8' }}>
                {metaMensal > 0 ? `Meta: ${formatBRL(metaMensal)}` : 'Meta não configurada'}
              </p>
            </div>
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className="rounded-xl p-5 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>
              Evolução Mensal — {ano}
            </h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>Carregando...</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={mensalGrafico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(v) => [formatBRL(Number(v)), 'Vendas']}
                    contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8, color: '#fff' }}
                  />
                  <Line type="monotone" dataKey="Vendas" stroke="#FFD700" strokeWidth={2.5}
                    dot={{ fill: '#00205C', r: 3 }} activeDot={{ r: 5, fill: '#FFD700' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div
            className="rounded-xl p-5 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>
              Vendas por Produto
            </h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>Carregando...</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={subgrupoGrafico} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={100} />
                  <Tooltip
                    formatter={(v) => [formatBRL(Number(v)), 'Vendas']}
                    contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8, color: '#fff' }}
                  />
                  <Bar dataKey="Vendas" radius={[0, 4, 4, 0]}>
                    {subgrupoGrafico.map((_, i) => (
                      <rect key={i} fill={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Tabela de vendas */}
        <div
          className="rounded-xl shadow-sm overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#00205C' }}>
              Histórico de Vendas (últimos 100 registros)
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Data', 'Cliente', 'Produto', 'Família', 'Qtde', 'Valor', 'Empresa'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 font-semibold" style={{ color: '#64748b' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8" style={{ color: '#94a3b8' }}>
                      Carregando...
                    </td>
                  </tr>
                ) : data?.vendas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8" style={{ color: '#94a3b8' }}>
                      Nenhuma venda encontrada
                    </td>
                  </tr>
                ) : (
                  data?.vendas.map((v, i) => (
                    <tr
                      key={i}
                      style={{ borderTop: '1px solid #f1f5f9' }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
                    >
                      <td className="px-4 py-2.5" style={{ color: '#64748b' }}>{formatDate(v.data)}</td>
                      <td className="px-4 py-2.5 max-w-[180px] truncate" style={{ color: '#0a1628' }}>{v.cliente}</td>
                      <td className="px-4 py-2.5" style={{ color: '#0a1628' }}>{v.subgrupo}</td>
                      <td className="px-4 py-2.5" style={{ color: '#64748b' }}>{v.familia}</td>
                      <td className="px-4 py-2.5 text-right" style={{ color: '#0a1628' }}>{formatNumber(v.qtde)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold" style={{ color: '#00205C' }}>{formatBRL(v.valor)}</td>
                      <td className="px-4 py-2.5" style={{ color: '#64748b' }}>{v.empresa}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
