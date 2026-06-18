'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import KPICard from '@/components/ui/KPICard';
import { DashboardSummary } from '@/types';
import { formatBRL, formatNumber, MESES, CORES_GRAFICO } from '@/lib/format';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  DollarSign,
  Users,
  TrendingUp,
  Building2,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

export default function DashboardPage() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [ano, setAno] = useState(ANO_ATUAL);
  const [mes, setMes] = useState<number | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ ano: ano.toString() });
      if (mes) params.set('mes', mes.toString());
      const res = await fetch(`/api/dashboard?${params}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano, mes]);

  const tendenciaGrafico = data?.tendencia_mensal.map((t) => ({
    name: MESES[t.mes - 1],
    Vendas: t.total_vendas,
  })) || [];

  const setorGrafico = data?.vendas_por_setor.slice(0, 8).map((s) => ({
    name: s.setor?.split(' ').slice(0, 2).join(' ') || '',
    value: s.total_vendas,
  })) || [];

  const empresaGrafico = data?.vendas_por_empresa.slice(0, 8).map((e) => ({
    name: e.empresa,
    Vendas: e.total_vendas,
  })) || [];

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>
              Dashboard de Vendas
            </h1>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Acompanhe o desempenho em tempo real
            </p>
          </div>
          <div className="flex items-center gap-3">
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
                {ANOS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
            </div>

            <button
              onClick={fetchData}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
              style={{ background: '#00205C', color: '#FFD700' }}
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Atualizar
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4">
          <KPICard
            title="Total de Vendas"
            value={data ? formatBRL(data.total_vendas) : '—'}
            subtitle={`Ano ${ano}`}
            icon={<DollarSign size={18} />}
            accent
          />
          <KPICard
            title={mes ? `Vendas em ${MESES[mes - 1]}` : 'Vendas no Período'}
            value={data ? formatBRL(data.total_vendas_mes) : '—'}
            subtitle="Período selecionado"
            icon={<TrendingUp size={18} />}
          />
          <KPICard
            title="Vendedores Ativos"
            value={data ? formatNumber(data.total_vendedores) : '—'}
            subtitle={`No ano de ${ano}`}
            icon={<Users size={18} />}
          />
          <KPICard
            title="Setores"
            value={data ? formatNumber(data.total_setores) : '—'}
            subtitle="Canais de venda"
            icon={<Building2 size={18} />}
          />
        </div>

        {/* Tendência + Setores */}
        <div className="grid grid-cols-3 gap-4">
          <div
            className="col-span-2 rounded-xl p-5 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>
              Evolução Mensal de Vendas — {ano}
            </h2>
            {loading ? (
              <div className="h-56 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>
                Carregando...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tendenciaGrafico}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tickFormatter={(v) => `R$ ${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip
                    formatter={(v) => [formatBRL(Number(v)), 'Vendas']}
                    contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8, color: '#fff' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Vendas"
                    stroke="#FFD700"
                    strokeWidth={2.5}
                    dot={{ fill: '#00205C', strokeWidth: 2, r: 4 }}
                    activeDot={{ r: 6, fill: '#FFD700' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          <div
            className="rounded-xl p-5 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>
              Vendas por Setor
            </h2>
            {loading ? (
              <div className="h-56 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>
                Carregando...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={setorGrafico} cx="50%" cy="45%" outerRadius={70} dataKey="value" nameKey="name">
                    {setorGrafico.map((_, index) => (
                      <Cell key={index} fill={CORES_GRAFICO[index % CORES_GRAFICO.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v) => [formatBRL(Number(v)), 'Vendas']}
                    contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8, color: '#fff', fontSize: 11 }}
                  />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: 10, color: '#64748b' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Empresas + Top Vendedores */}
        <div className="grid grid-cols-2 gap-4">
          <div
            className="rounded-xl p-5 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>
              Vendas por Empresa — {ano}
            </h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>
                Carregando...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={empresaGrafico} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    tick={{ fontSize: 10, fill: '#64748b' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(v) => [formatBRL(Number(v)), 'Vendas']}
                    contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8, color: '#fff' }}
                  />
                  <Bar dataKey="Vendas" fill="#00205C" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          <div
            className="rounded-xl p-5 shadow-sm"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>
              Top 10 Vendedores
            </h2>
            {loading ? (
              <div className="h-48 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>
                Carregando...
              </div>
            ) : (
              <div className="space-y-2 overflow-auto max-h-48">
                {data?.top_vendedores.map((v, i) => {
                  const pct = data.top_vendedores[0]
                    ? (v.total_vendas / data.top_vendedores[0].total_vendas) * 100
                    : 0;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <span
                        className="text-xs font-bold w-5 text-center shrink-0"
                        style={{ color: i === 0 ? '#FFD700' : '#94a3b8' }}
                      >
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <p className="text-xs font-medium truncate" style={{ color: '#0a1628', maxWidth: 160 }}>
                            {v.vendedor}
                          </p>
                          <p className="text-xs font-semibold shrink-0 ml-2" style={{ color: '#00205C' }}>
                            {formatBRL(v.total_vendas)}
                          </p>
                        </div>
                        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, background: i === 0 ? '#FFD700' : '#00205C' }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
