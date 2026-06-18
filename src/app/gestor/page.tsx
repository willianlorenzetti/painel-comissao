'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { formatBRL, formatNumber, MESES, CORES_GRAFICO } from '@/lib/format';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { ChevronDown, Download, Filter } from 'lucide-react';
import { useUser } from '@/components/providers/UserProvider';
import { useRouter } from 'next/navigation';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

interface ResumoVendedor {
  vendedor: string;
  setor: string;
  empresa: string;
  total_vendas: number;
  total_qtde: number;
  total_registros: number;
}

interface MetaVendedor {
  nome_vendedor: string;
  meta1_valor: number; meta1_percentual: number;
  meta2_valor: number; meta2_percentual: number;
  meta3_valor: number; meta3_percentual: number;
}

export default function GestorPage() {
  const usuario = useUser();
  const router = useRouter();
  const [vendedores, setVendedores] = useState<ResumoVendedor[]>([]);
  const [metasMap, setMetasMap] = useState<Record<string, MetaVendedor>>({});
  const [setores, setSetores] = useState<string[]>([]);
  const [empresas, setEmpresas] = useState<string[]>([]);
  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [ano, setAno] = useState(ANO_ATUAL);
  const [mes, setMes] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');

  useEffect(() => {
    if (usuario && usuario !== 'loading' && usuario.cargo === 'VENDEDOR') {
      router.push('/vendedor');
    }
  }, [usuario, router]);

  useEffect(() => {
    fetch('/api/filtros')
      .then((r) => r.json())
      .then((d) => {
        setSetores(d.setores || []);
        setEmpresas(d.empresas || []);
      });
  }, []);

  useEffect(() => {
    const url = mes
      ? `/api/metas-mensais?ano=${ano}&mes=${mes}`
      : '/api/metas';
    fetch(url)
      .then((r) => r.json())
      .then((list: MetaVendedor[]) => {
        const map: Record<string, MetaVendedor> = {};
        list.forEach((m) => { map[m.nome_vendedor] = m; });
        setMetasMap(map);
      })
      .catch(() => {});
  }, [ano, mes]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ ano: ano.toString() });
    if (mes) params.set('mes', mes.toString());
    if (filtroSetor) params.set('setor', filtroSetor);
    if (filtroEmpresa) params.set('empresa', filtroEmpresa);

    fetch(`/api/vendedores?${params}`)
      .then((r) => r.json())
      .then(setVendedores)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [ano, mes, filtroSetor, filtroEmpresa]);

  const getFaixa = (vendedor: string, totalVendas: number) => {
    const m = metasMap[vendedor];
    if (!m) return null;
    const tiers = [
      { label: 'Meta 3', valor: Number(m.meta3_valor), percentual: Number(m.meta3_percentual) },
      { label: 'Meta 2', valor: Number(m.meta2_valor), percentual: Number(m.meta2_percentual) },
      { label: 'Meta 1', valor: Number(m.meta1_valor), percentual: Number(m.meta1_percentual) },
    ];
    const atingida = tiers.find((t) => t.valor > 0 && totalVendas >= t.valor) || null;
    // Próxima meta não atingida (para barra de progresso)
    const proxima = [...tiers].reverse().find((t) => t.valor > 0 && totalVendas < t.valor) || null;
    const referencia = proxima?.valor || atingida?.valor || 0;
    return {
      atingida,
      referencia,
      comissao: atingida ? (totalVendas * atingida.percentual) / 100 : null,
    };
  };

  const vendedoresFiltrados = vendedores.filter((v) =>
    !busca || v.vendedor.toLowerCase().includes(busca.toLowerCase())
  );

  const totalVendas = vendedoresFiltrados.reduce((s, v) => s + v.total_vendas, 0);
  const totalComissoes = vendedoresFiltrados.reduce((s, v) => {
    const f = getFaixa(v.vendedor, v.total_vendas);
    return s + (f?.comissao || 0);
  }, 0);

  // Remove o prefixo do setor (primeira palavra) e trunca o restante
  const nomeAbrev = (vendedor: string) => {
    const partes = vendedor.split(' ');
    const nome = partes.slice(1).join(' ') || partes[0];
    return nome.length > 14 ? nome.substring(0, 14) + '…' : nome;
  };

  const top8Grafico = vendedoresFiltrados.slice(0, 8).map((v) => ({
    name: nomeAbrev(v.vendedor),
    Vendas: v.total_vendas,
    Comissão: getFaixa(v.vendedor, v.total_vendas)?.comissao || 0,
  }));

  const exportCSV = () => {
    const header = ['Vendedor', 'Setor', 'Total Vendas', 'Meta Atingida', 'Comissão (R$)'].join(';');
    const rows = vendedoresFiltrados.map((v) => {
      const f = getFaixa(v.vendedor, v.total_vendas);
      return [
        v.vendedor, v.setor,
        v.total_vendas.toFixed(2),
        f?.atingida?.label || '-',
        f?.comissao != null ? f.comissao.toFixed(2) : '-',
      ].join(';');
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendedores_${ano}${mes ? `_${MESES[mes - 1]}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>
              Painel do Gestor
            </h1>
            <p className="text-sm" style={{ color: '#64748b' }}>
              Acompanhe o desempenho da equipe
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {/* Filtros */}
            <div className="relative">
              <select
                value={filtroSetor}
                onChange={(e) => setFiltroSetor(e.target.value)}
                className="appearance-none rounded-lg pl-8 pr-8 py-2 text-sm font-medium cursor-pointer"
                style={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#00205C' }}
              >
                <option value="">Todos os setores</option>
                {setores.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <Filter size={13} className="absolute left-2.5 top-3 pointer-events-none" style={{ color: '#64748b' }} />
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
            </div>

            <div className="relative">
              <select
                value={filtroEmpresa}
                onChange={(e) => setFiltroEmpresa(e.target.value)}
                className="appearance-none rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer"
                style={{ background: '#ffffff', border: '1px solid #e2e8f0', color: '#00205C' }}
              >
                <option value="">Todas as empresas</option>
                {empresas.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
            </div>

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

            <button
              onClick={exportCSV}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              style={{ background: '#FFD700', color: '#00205C' }}
            >
              <Download size={14} />
              Exportar CSV
            </button>
          </div>
        </div>

        {/* KPI resumo */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl p-5 shadow-sm" style={{ background: '#00205C' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#94a3b8' }}>
              Total Vendas (Equipe)
            </p>
            <p className="text-2xl font-bold mt-2 text-white">{formatBRL(totalVendas)}</p>
            <p className="text-xs mt-1" style={{ color: '#FFD700' }}>
              {filtroSetor || 'Todos os setores'} — {ano}{mes ? ` / ${MESES[mes - 1]}` : ''}
            </p>
          </div>
          <div className="rounded-xl p-5 shadow-sm" style={{ background: '#FFD700' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#00205C' }}>
              Total Comissões Estimadas
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: '#00205C' }}>{formatBRL(totalComissoes)}</p>
            <p className="text-xs mt-1" style={{ color: '#1a3a6e' }}>
              Calculado com configurações ativas
            </p>
          </div>
          <div className="rounded-xl p-5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
              Vendedores na Equipe
            </p>
            <p className="text-2xl font-bold mt-2" style={{ color: '#00205C' }}>{formatNumber(vendedoresFiltrados.length)}</p>
            <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
              Com vendas no período
            </p>
          </div>
        </div>

        {/* Gráfico Top vendedores */}
        <div className="rounded-xl p-5 shadow-sm" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: '#00205C' }}>
            Top 8 Vendedores por Faturamento
          </h2>
          {loading ? (
            <div className="h-48 flex items-center justify-center text-sm" style={{ color: '#94a3b8' }}>Carregando...</div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={top8Grafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: '#64748b' }} />
                <Tooltip
                  formatter={(v, name) => [formatBRL(Number(v)), String(name)]}
                  contentStyle={{ background: '#0a1628', border: 'none', borderRadius: 8, color: '#fff' }}
                />
                <Bar dataKey="Vendas" fill="#00205C" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Comissão" fill="#FFD700" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabela completa */}
        <div className="rounded-xl shadow-sm overflow-hidden" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid #e2e8f0' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#00205C' }}>
              Desempenho da Equipe — {vendedoresFiltrados.length} vendedores
            </h2>
            <input
              type="text"
              placeholder="Buscar vendedor..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="text-sm rounded-lg px-3 py-1.5 outline-none"
              style={{ border: '1px solid #e2e8f0', color: '#00205C', width: 200 }}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {[
                    { label: '#', align: 'left' },
                    { label: 'Vendedor', align: 'left' },
                    { label: 'Setor', align: 'left' },
                    { label: 'Total Vendas', align: 'center' },
                    { label: 'Meta Atingida', align: 'left' },
                    { label: 'Comissão Est.', align: 'left' },
                    { label: 'Atingimento', align: 'left' },
                  ].map(({ label, align }) => (
                    <th key={label} className={`text-${align} px-4 py-3 font-semibold`} style={{ color: '#64748b' }}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8" style={{ color: '#94a3b8' }}>Carregando...</td>
                  </tr>
                ) : vendedoresFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8" style={{ color: '#94a3b8' }}>Nenhum vendedor encontrado</td>
                  </tr>
                ) : (
                  vendedoresFiltrados.map((v, i) => {
                    const f = getFaixa(v.vendedor, v.total_vendas);
                    const pct = f?.referencia ? Math.min((v.total_vendas / f.referencia) * 100, 100) : 0;
                    return (
                      <tr
                        key={i}
                        style={{ borderTop: '1px solid #f1f5f9' }}
                        onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                        onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
                      >
                        <td className="px-4 py-3 font-bold" style={{ color: i < 3 ? '#FFD700' : '#94a3b8' }}>
                          {i + 1}
                        </td>
                        <td className="px-4 py-3 font-medium" style={{ color: '#0a1628', maxWidth: 200 }}>
                          {v.vendedor}
                        </td>
                        <td className="px-4 py-3" style={{ color: '#64748b' }}>{v.setor}</td>
                        <td className="px-4 py-3 text-center font-semibold" style={{ color: '#00205C' }}>
                          {formatBRL(v.total_vendas)}
                        </td>
                        <td className="px-4 py-3">
                          {f?.atingida ? (
                            <div>
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: '#d1fae5', color: '#065f46' }}>
                                {f.atingida.label}
                              </span>
                              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{formatBRL(f.atingida.valor)}</p>
                            </div>
                          ) : (
                            <span className="text-xs" style={{ color: '#94a3b8' }}>Nenhuma</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold" style={{ color: '#16a34a' }}>
                          {f?.comissao != null ? formatBRL(f.comissao) : <span style={{ color: '#94a3b8' }}>—</span>}
                        </td>
                        <td className="px-4 py-3" style={{ minWidth: 120 }}>
                          {f?.referencia ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: '#f1f5f9' }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${pct}%`, background: pct >= 100 ? '#16a34a' : pct >= 70 ? '#FFD700' : '#00205C' }}
                                />
                              </div>
                              <span className="text-xs shrink-0" style={{ color: '#64748b' }}>{pct.toFixed(0)}%</span>
                            </div>
                          ) : (
                            <span style={{ color: '#94a3b8' }}>—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
