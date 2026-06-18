'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { MESES } from '@/lib/format';
import { Save, CheckCircle, AlertCircle, Calendar } from 'lucide-react';
import { useUser } from '@/components/providers/UserProvider';
import { useRouter } from 'next/navigation';

interface VendedorMeta {
  nome_vendedor: string;
  meta1_valor: number;
  meta1_percentual: number;
  meta2_valor: number;
  meta2_percentual: number;
  meta3_valor: number;
  meta3_percentual: number;
}

const ANO_ATUAL = new Date().getFullYear();
const ANOS_META = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

export default function ConfiguracaoPage() {
  const usuario = useUser();
  const router = useRouter();

  const [allVendedores, setAllVendedores] = useState<string[]>([]);
  const [buscaVend, setBuscaVend] = useState('');
  const [mesMeta, setMesMeta] = useState(new Date().getMonth() + 1);
  const [anoMeta, setAnoMeta] = useState(new Date().getFullYear());
  const [metasMensaisEdit, setMetasMensaisEdit] = useState<Record<string, VendedorMeta>>({});
  const [savingMensais, setSavingMensais] = useState(false);
  const [savedMensais, setSavedMensais] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (usuario && usuario !== 'loading' && usuario.cargo !== 'ADM') {
      router.push('/sem-acesso');
    }
  }, [usuario, router]);

  useEffect(() => {
    if (!usuario || usuario === 'loading') return;
    fetch('/api/filtros')
      .then((r) => r.json())
      .then((filtros) => {
        setAllVendedores(filtros.vendedores || []);
        setLoading(false);
      });
  }, [usuario]);

  useEffect(() => {
    if (!usuario || usuario === 'loading') return;
    carregarMetasMensais(anoMeta, mesMeta);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anoMeta, mesMeta, usuario]);

  const getMensal = (nome: string): VendedorMeta =>
    metasMensaisEdit[nome] || {
      nome_vendedor: nome,
      meta1_valor: 0, meta1_percentual: 0,
      meta2_valor: 0, meta2_percentual: 0,
      meta3_valor: 0, meta3_percentual: 0,
    };

  const updateMensal = (
    nome: string,
    field: keyof Omit<VendedorMeta, 'nome_vendedor'>,
    value: number
  ) => {
    setSavedMensais(false);
    setMetasMensaisEdit((prev) => ({ ...prev, [nome]: { ...getMensal(nome), [field]: value } }));
  };

  const carregarMetasMensais = async (ano: number, mes: number) => {
    try {
      const res = await fetch(`/api/metas-mensais?ano=${ano}&mes=${mes}`);
      const list: VendedorMeta[] = await res.json();
      const map: Record<string, VendedorMeta> = {};
      list.forEach((m) => { map[m.nome_vendedor] = m; });
      setMetasMensaisEdit(map);
    } catch {
      // silently fail
    }
  };

  const salvarMetasMensais = async () => {
    setSavingMensais(true);
    try {
      const payload = allVendedores.map((v) => ({
        ...getMensal(v),
        nome_vendedor: v,
        ano: anoMeta,
        mes: mesMeta,
      }));
      await fetch('/api/metas-mensais', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setSavedMensais(true);
      setTimeout(() => setSavedMensais(false), 3000);
    } finally {
      setSavingMensais(false);
    }
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>
            Metas Mensais
          </h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
            Configure as metas de cada vendedor por mês e ano
          </p>
        </div>

        {/* Seletores de mês/ano */}
        <div
          className="rounded-xl p-4 flex items-center gap-5 flex-wrap"
          style={{ background: '#ffffff', border: '2px solid #00205C' }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <Calendar size={18} style={{ color: '#00205C' }} />
            <span className="text-sm font-semibold" style={{ color: '#00205C' }}>
              Selecione o período de referência:
            </span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Mês</label>
              <select
                value={mesMeta}
                onChange={(e) => setMesMeta(parseInt(e.target.value))}
                className="rounded-lg px-3 py-2 text-sm font-semibold outline-none cursor-pointer"
                style={{ border: '1px solid #cbd5e1', color: '#00205C', minWidth: 140 }}
              >
                {MESES.map((m, i) => (
                  <option key={i + 1} value={i + 1}>{m}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label className="text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Ano</label>
              <select
                value={anoMeta}
                onChange={(e) => setAnoMeta(parseInt(e.target.value))}
                className="rounded-lg px-3 py-2 text-sm font-semibold outline-none cursor-pointer"
                style={{ border: '1px solid #cbd5e1', color: '#00205C', minWidth: 100 }}
              >
                {ANOS_META.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div
              className="px-3 py-1.5 rounded-lg text-sm font-bold mt-4"
              style={{ background: '#00205C', color: '#FFD700' }}
            >
              {MESES[mesMeta - 1]} {anoMeta}
            </div>
          </div>
        </div>

        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: '#0a1628', border: '1px solid #1a3a6e' }}
        >
          <AlertCircle size={18} style={{ color: '#FFD700' }} className="shrink-0 mt-0.5" />
          <p className="text-xs" style={{ color: '#94a3b8' }}>
            Configure até <strong className="text-white">3 faixas de meta</strong> por vendedor para o mês selecionado,
            cada uma com seu próprio <strong className="text-white">% de comissão</strong>.
            O vendedor recebe a comissão da faixa mais alta que atingir.
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: '#94a3b8' }}>Carregando...</div>
        ) : (
          <div
            className="rounded-xl shadow-sm overflow-hidden"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
          >
            {/* Toolbar */}
            <div
              className="flex items-center justify-between px-5 py-4 gap-3 flex-wrap"
              style={{ borderBottom: '1px solid #e2e8f0' }}
            >
              <input
                type="text"
                value={buscaVend}
                onChange={(e) => setBuscaVend(e.target.value)}
                placeholder="Buscar vendedor..."
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ border: '1px solid #e2e8f0', color: '#0a1628', width: 220 }}
              />
              <button
                onClick={salvarMetasMensais}
                disabled={savingMensais}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{
                  background: savedMensais ? '#16a34a' : '#FFD700',
                  color: savedMensais ? '#ffffff' : '#00205C',
                  opacity: savingMensais ? 0.7 : 1,
                }}
              >
                {savedMensais ? <><CheckCircle size={15} /> Salvo!</> : <><Save size={15} /> Salvar Tudo</>}
              </button>
            </div>

            {/* Header das faixas */}
            <div
              className="grid px-5 py-2 text-xs font-semibold uppercase tracking-wider"
              style={{
                gridTemplateColumns: '1fr repeat(3, 280px)',
                borderBottom: '1px solid #f1f5f9',
                background: '#f8fafc',
                color: '#64748b',
              }}
            >
              <span>Vendedor</span>
              {(['Meta 1', 'Meta 2', 'Meta 3'] as const).map((label, i) => (
                <span
                  key={i}
                  className="text-center px-4 py-1 rounded-full mx-2"
                  style={{
                    background: ['#dbeafe','#d1fae5','#fef3c7'][i],
                    color: ['#1e40af','#065f46','#92400e'][i],
                  }}
                >
                  {label}
                </span>
              ))}
            </div>

            {/* Linhas */}
            <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
              {allVendedores.filter((v) => !buscaVend || v.toLowerCase().includes(buscaVend.toLowerCase())).map((v) => {
                const m = getMensal(v);
                const temMetaMensal = !!metasMensaisEdit[v];
                return (
                  <div
                    key={v}
                    className="grid items-center px-5 py-3"
                    style={{ gridTemplateColumns: '1fr repeat(3, 280px)' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
                  >
                    {/* Nome */}
                    <div className="flex items-center gap-2 pr-4">
                      <span className="text-sm font-medium" style={{ color: '#0a1628' }}>{v}</span>
                      {temMetaMensal && (
                        <span
                          className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                          style={{ background: '#d1fae5', color: '#065f46' }}
                        >
                          mensal
                        </span>
                      )}
                    </div>

                    {/* Faixas 1, 2, 3 */}
                    {([
                      { vField: 'meta1_valor', pField: 'meta1_percentual', bg: '#eff6ff', border: '#bfdbfe' },
                      { vField: 'meta2_valor', pField: 'meta2_percentual', bg: '#f0fdf4', border: '#bbf7d0' },
                      { vField: 'meta3_valor', pField: 'meta3_percentual', bg: '#fffbeb', border: '#fde68a' },
                    ] as { vField: keyof Omit<VendedorMeta,'nome_vendedor'>; pField: keyof Omit<VendedorMeta,'nome_vendedor'>; bg: string; border: string }[]).map(({ vField, pField, bg, border }) => {
                      const val = m[vField] as number;
                      const pct = m[pField] as number;
                      return (
                        <div
                          key={vField}
                          className="flex items-center gap-2 mx-2 px-3 py-2 rounded-lg"
                          style={{ background: bg, border: `1px solid ${border}` }}
                        >
                          <span className="text-xs shrink-0" style={{ color: '#64748b' }}>R$</span>
                          <input
                            type="number"
                            min={0}
                            step={1000}
                            value={val}
                            onChange={(e) => updateMensal(v, vField, parseFloat(e.target.value) || 0)}
                            className="flex-1 min-w-0 rounded px-2 py-1 text-xs text-right outline-none bg-transparent font-medium"
                            style={{ border: '1px solid #e2e8f0', color: '#0a1628', background: '#ffffff' }}
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                          />
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            value={pct}
                            onChange={(e) => updateMensal(v, pField, parseFloat(e.target.value) || 0)}
                            className="w-16 rounded px-2 py-1 text-xs text-center outline-none font-bold"
                            style={{ border: '1px solid #e2e8f0', color: '#00205C', background: '#ffffff' }}
                            placeholder="0"
                            onFocus={(e) => e.target.select()}
                          />
                          <span className="text-xs shrink-0 font-medium" style={{ color: '#64748b' }}>%</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
