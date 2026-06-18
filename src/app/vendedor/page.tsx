'use client';

import { useEffect, useState, useRef } from 'react';
import AppShell from '@/components/layout/AppShell';
import KPICard from '@/components/ui/KPICard';
import { formatBRL, formatNumber, MESES, CORES_GRAFICO } from '@/lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line, Cell,
} from 'recharts';
import { DollarSign, TrendingUp, ChevronDown, Search, User } from 'lucide-react';
import { useUser } from '@/components/providers/UserProvider';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

interface VendedorData {
  resumo: Array<{ vendedor: string; setor: string; empresa: string; total_vendas: number }>;
  mensal: Array<{ mes: number; total_vendas: number }>;
  porSubgrupo: Array<{ subgrupo: string; total_vendas: number }>;
  meta_vendedor?: {
    meta1_valor: number; meta1_percentual: number;
    meta2_valor: number; meta2_percentual: number;
    meta3_valor: number; meta3_percentual: number;
  } | null;
}

interface ComissaoConfig { setor: string; percentual: number; meta_mensal: number; }

const CORES_FAIXA = [
  { bg: '#eff6ff', fill: '#3b82f6', text: '#1e40af', bar: '#dbeafe' },
  { bg: '#f0fdf4', fill: '#16a34a', text: '#065f46', bar: '#d1fae5' },
  { bg: '#fffbeb', fill: '#f59e0b', text: '#92400e', bar: '#fef3c7' },
];

export default function VendedorPage() {
  const usuario = useUser();
  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedorSel, setVendedorSel] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [ano, setAno] = useState(ANO_ATUAL);
  const [mes, setMes] = useState<number | null>(new Date().getMonth() + 1);
  const [data, setData] = useState<VendedorData | null>(null);
  const [comissoes, setComissoes] = useState<ComissaoConfig[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isVendedor = usuario && usuario !== 'loading' && usuario.cargo === 'VENDEDOR';

  useEffect(() => {
    fetch('/api/filtros')
      .then((r) => r.json())
      .then((d) => {
        setVendedores(d.vendedores || []);
        if (d.vendedores?.length) {
          setVendedorSel(d.vendedores[0]);
          setBusca(d.vendedores[0]);
        }
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

  // Fecha dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        inputRef.current && !inputRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setAberto(false);
        setBusca(vendedorSel);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [vendedorSel]);

  const selecionar = (v: string) => {
    setVendedorSel(v);
    setBusca(v);
    setAberto(false);
  };

  const vendedoresFiltrados = vendedores.filter((v) =>
    v.toLowerCase().includes(busca.toLowerCase())
  );

  const totalVendas = data?.resumo.reduce((s, r) => s + r.total_vendas, 0) || 0;
  const setor = data?.resumo[0]?.setor || '';
  const metaIndividual = data?.meta_vendedor;
  const comissaoConfigSetor = comissoes.find((c) => c.setor === setor);

  type FaixaMeta = { valor: number; percentual: number; label: string };
  const faixas: FaixaMeta[] = metaIndividual
    ? [
        { valor: metaIndividual.meta1_valor, percentual: metaIndividual.meta1_percentual, label: 'Meta 1' },
        { valor: metaIndividual.meta2_valor, percentual: metaIndividual.meta2_percentual, label: 'Meta 2' },
        { valor: metaIndividual.meta3_valor, percentual: metaIndividual.meta3_percentual, label: 'Meta 3' },
      ]
    : comissaoConfigSetor
    ? [{ valor: comissaoConfigSetor.meta_mensal, percentual: comissaoConfigSetor.percentual, label: 'Meta' }]
    : [];

  const faixaAtingida = [...faixas].reverse().find((f) => f.valor > 0 && totalVendas >= f.valor) || null;
  const comissaoValor = faixaAtingida ? (totalVendas * faixaAtingida.percentual) / 100 : null;

  const mensalGrafico = MESES.map((nome, i) => {
    const found = data?.mensal.find((m) => m.mes === i + 1);
    return { name: nome, Vendas: found?.total_vendas || 0 };
  });

  const subgrupoGrafico = data?.porSubgrupo.slice(0, 8).map((s) => ({
    name: s.subgrupo || 'Outros',
    Vendas: s.total_vendas,
  })) || [];

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>Painel do Vendedor</h1>
            <p className="text-sm" style={{ color: '#64748b' }}>Suas vendas e comissões em tempo real</p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Slicer de vendedor */}
            {!isVendedor && (
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-2.5 pointer-events-none z-10" style={{ color: '#FFD700' }} />
                <input
                  ref={inputRef}
                  type="text"
                  value={busca}
                  onChange={(e) => { setBusca(e.target.value); setAberto(true); }}
                  onFocus={() => { setBusca(''); setAberto(true); }}
                  placeholder="Buscar vendedor..."
                  className="rounded-lg pl-8 pr-3 py-2 text-sm font-medium w-64 outline-none"
                  style={{ background: '#00205C', border: 'none', color: '#FFD700' }}
                />
                {aberto && vendedoresFiltrados.length > 0 && (
                  <div
                    ref={dropdownRef}
                    className="absolute top-full left-0 mt-1 w-full rounded-lg z-50 overflow-hidden"
                    style={{
                      background: '#0a1628',
                      border: '1px solid #1a3a6e',
                      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                      maxHeight: 240,
                      overflowY: 'auto',
                    }}
                  >
                    {vendedoresFiltrados.map((v) => (
                      <button
                        key={v}
                        onMouseDown={() => selecionar(v)}
                        className="w-full text-left px-3 py-2.5 text-xs transition-colors"
                        style={{
                          color: vendedorSel === v ? '#FFD700' : '#cbd5e1',
                          background: vendedorSel === v ? '#1a3a6e' : 'transparent',
                          borderBottom: '1px solid #1a3a6e20',
                        }}
                        onMouseEnter={(e) => { if (vendedorSel !== v) (e.currentTarget as HTMLElement).style.background = '#1a3a6e'; }}
                        onMouseLeave={(e) => { if (vendedorSel !== v) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="relative">
              <select
                value={mes || ''}
                onChange={(e) => setMes(e.target.value ? parseInt(e.target.value) : null)}
                className="appearance-none rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer"
                style={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#00205C' }}
              >
                <option value="">Todos os meses</option>
                {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
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
                {data.resumo[0].setor}
              </p>
            </div>
            {faixaAtingida && (
              <div className="ml-auto text-right">
                <p className="text-xs" style={{ color: '#94a3b8' }}>{faixaAtingida.label} atingida</p>
                <p className="text-lg font-bold" style={{ color: '#FFD700' }}>{faixaAtingida.percentual}%</p>
              </div>
            )}
          </div>
        )}

        {/* KPI + Metas */}
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
            subtitle={faixaAtingida ? `${faixaAtingida.percentual}% — ${faixaAtingida.label}` : faixas.length ? 'Nenhuma meta atingida' : 'Configure em Configuração'}
            icon={<TrendingUp size={18} />}
          />
          <div
            className="col-span-2 rounded-xl p-5 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: '#64748b' }}>
              Faixas de Meta
            </p>
            {faixas.length === 0 ? (
              <p className="text-sm" style={{ color: '#94a3b8' }}>Meta não configurada</p>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${faixas.length}, 1fr)` }}>
                {faixas.map((f, i) => {
                  const pct = f.valor > 0 ? Math.min((totalVendas / f.valor) * 100, 100) : 0;
                  const atingida = f.valor > 0 && totalVendas >= f.valor;
                  const cor = CORES_FAIXA[i] || CORES_FAIXA[0];
                  return (
                    <div key={i} className="rounded-lg p-3" style={{ background: cor.bg, border: `1px solid ${cor.bar}` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold" style={{ color: cor.text }}>
                          {f.label}{atingida && <span className="ml-1">✓</span>}
                        </span>
                        <span className="text-xs font-bold" style={{ color: cor.text }}>{f.percentual}%</span>
                      </div>
                      <p className="text-xs mb-2" style={{ color: cor.text }}>
                        {f.valor > 0 ? formatBRL(f.valor) : '—'}
                      </p>
                      <div className="h-2 rounded-full overflow-hidden" style={{ background: cor.bar }}>
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: cor.fill }} />
                      </div>
                      <p className="text-xs mt-1 text-right" style={{ color: cor.text }}>
                        {formatNumber(Math.round(pct))}%
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Gráficos */}
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-xl p-5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>Evolução Mensal — {ano}</h2>
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
                    contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: '#ffffff' }}
                    itemStyle={{ color: '#FFD700' }}
                  />
                  <Line type="monotone" dataKey="Vendas" stroke="#FFD700" strokeWidth={2.5}
                    dot={{ fill: '#00205C', r: 3 }} activeDot={{ r: 5, fill: '#FFD700' }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl p-5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>Vendas por Subgrupo</h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>Carregando...</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={subgrupoGrafico} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis type="number" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} width={110} />
                  <Tooltip
                    formatter={(v) => [formatBRL(Number(v)), 'Vendas']}
                    contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8 }}
                    labelStyle={{ color: '#ffffff' }}
                    itemStyle={{ color: '#FFD700' }}
                  />
                  <Bar dataKey="Vendas" radius={[0, 4, 4, 0]}>
                    {subgrupoGrafico.map((_, i) => (
                      <Cell key={i} fill={CORES_GRAFICO[i % CORES_GRAFICO.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
