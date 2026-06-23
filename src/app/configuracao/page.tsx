'use client';

import { useEffect, useState, useRef } from 'react';

// Input que aceita vírgula como separador decimal (pt-BR) sem resetar durante digitação
function PctInput({ value, onChange, className, style, placeholder }: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
  style?: React.CSSProperties;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(value === 0 ? '' : String(value).replace('.', ','));
  const lastExternal = useRef(value);

  useEffect(() => {
    if (value !== lastExternal.current) {
      lastExternal.current = value;
      setRaw(value === 0 ? '' : String(value).replace('.', ','));
    }
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      className={className}
      style={style}
      placeholder={placeholder}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const txt = e.target.value;
        setRaw(txt);
        const parsed = parseFloat(txt.replace(',', '.'));
        if (!isNaN(parsed)) {
          lastExternal.current = parsed;
          onChange(parsed);
        }
      }}
      onBlur={() => {
        const parsed = parseFloat(raw.replace(',', '.'));
        const final = isNaN(parsed) ? 0 : parsed;
        lastExternal.current = final;
        onChange(final);
        setRaw(final === 0 ? '' : String(final).replace('.', ','));
      }}
    />
  );
}
import AppShell from '@/components/layout/AppShell';
import { MESES } from '@/lib/format';
import { Save, CheckCircle, AlertCircle, Calendar, Users, Loader2 } from 'lucide-react';
import { useUser } from '@/components/providers/UserProvider';
import { useRouter } from 'next/navigation';

interface VendedorMeta {
  nome_vendedor: string;
  meta1_valor: number; meta1_percentual: number;
  meta2_valor: number; meta2_percentual: number;
  meta3_valor: number; meta3_percentual: number;
  percentual_sem_meta: number;
}

interface BonusConfig {
  bonus1_valor: number; bonus1_percentual: number;
  bonus2_valor: number; bonus2_percentual: number;
  bonus3_valor: number; bonus3_percentual: number;
  bonus4_valor: number; bonus4_percentual: number;
  bonus5_valor: number; bonus5_percentual: number;
}

const BONUS_VAZIO: BonusConfig = {
  bonus1_valor: 0, bonus1_percentual: 0,
  bonus2_valor: 0, bonus2_percentual: 0,
  bonus3_valor: 0, bonus3_percentual: 0,
  bonus4_valor: 0, bonus4_percentual: 0,
  bonus5_valor: 0, bonus5_percentual: 0,
};

const ANO_ATUAL = new Date().getFullYear();
const ANOS_META = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];
const BONUS_CORES = [
  { bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', label: 'Bônus 1' },
  { bg: '#f0fdf4', border: '#bbf7d0', text: '#065f46', label: 'Bônus 2' },
  { bg: '#fffbeb', border: '#fde68a', text: '#92400e', label: 'Bônus 3' },
  { bg: '#fdf4ff', border: '#e9d5ff', text: '#6b21a8', label: 'Bônus 4' },
  { bg: '#fff1f2', border: '#fecdd3', text: '#9f1239', label: 'Bônus 5' },
];

export default function ConfiguracaoPage() {
  const usuario = useUser();
  const router = useRouter();
  const [aba, setAba] = useState<'metas' | 'bonus' | 'vendedores'>('metas');

  // ── Vendedores ativo/inativo ──
  const [vendedoresComStatus, setVendedoresComStatus] = useState<{ nome: string; ativo: boolean }[]>([]);
  const [buscaAtivo, setBuscaAtivo] = useState('');
  const [loadingVendAtivo, setLoadingVendAtivo] = useState(false);
  const [togglingVend, setTogglingVend] = useState<Record<string, boolean>>({});

  // ── Metas PA ──
  const [allVendedores, setAllVendedores] = useState<string[]>([]);
  const [buscaVend, setBuscaVend] = useState('');
  const [mesMeta, setMesMeta] = useState(new Date().getMonth() + 1);
  const [anoMeta, setAnoMeta] = useState(new Date().getFullYear());
  const [metasMensaisEdit, setMetasMensaisEdit] = useState<Record<string, VendedorMeta>>({});
  const [savingMensais, setSavingMensais] = useState(false);
  const [savedMensais, setSavedMensais] = useState(false);
  const [loading, setLoading] = useState(true);

  // ── Bônus Global ──
  const [bonusEdit, setBonusEdit] = useState<BonusConfig>(BONUS_VAZIO);
  const [savingBonus, setSavingBonus] = useState(false);
  const [savedBonus, setSavedBonus] = useState(false);

  useEffect(() => {
    if (usuario && usuario !== 'loading' && !['ADM', 'GESTOR'].includes(usuario.cargo)) {
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
    // Carrega config global de bônus
    fetch('/api/bonus-config')
      .then((r) => r.json())
      .then((b) => setBonusEdit(b))
      .catch(() => {});
    setLoadingVendAtivo(true);
    fetch('/api/vendedor-ativo')
      .then((r) => r.json())
      .then((data) => setVendedoresComStatus(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadingVendAtivo(false));
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
      percentual_sem_meta: 0,
    };

  const updateMensal = (
    nome: string,
    field: keyof Omit<VendedorMeta, 'nome_vendedor'>,
    value: number
  ) => {
    setSavedMensais(false);
    setMetasMensaisEdit((prev) => ({ ...prev, [nome]: { ...getMensal(nome), [field]: value } }));
  };

  const updateBonus = (field: keyof BonusConfig, value: number) => {
    setSavedBonus(false);
    setBonusEdit((prev) => ({ ...prev, [field]: value }));
  };

  const toggleVendedorAtivo = async (nome: string, novoAtivo: boolean) => {
    setVendedoresComStatus((prev) => prev.map((v) => v.nome === nome ? { ...v, ativo: novoAtivo } : v));
    // Sincroniza com a aba Metas PA imediatamente
    if (!novoAtivo) {
      setAllVendedores((prev) => prev.filter((v) => v !== nome));
    } else {
      setAllVendedores((prev) => [...prev, nome].sort());
    }
    setTogglingVend((prev) => ({ ...prev, [nome]: true }));
    try {
      const res = await fetch('/api/vendedor-ativo', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome_vendedor: nome, ativo: novoAtivo }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setVendedoresComStatus((prev) => prev.map((v) => v.nome === nome ? { ...v, ativo: !novoAtivo } : v));
      // Reverte a sincronização
      if (!novoAtivo) {
        setAllVendedores((prev) => [...prev, nome].sort());
      } else {
        setAllVendedores((prev) => prev.filter((v) => v !== nome));
      }
    } finally {
      setTogglingVend((prev) => { const n = { ...prev }; delete n[nome]; return n; });
    }
  };

  const carregarMetasMensais = async (ano: number, mes: number) => {
    try {
      const res = await fetch(`/api/metas-mensais?ano=${ano}&mes=${mes}`);
      const list: VendedorMeta[] = await res.json();
      const map: Record<string, VendedorMeta> = {};
      list.forEach((m) => { map[m.nome_vendedor] = m; });
      setMetasMensaisEdit(map);
    } catch { /* silent */ }
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
      const res = await fetch('/api/metas-mensais', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await res.text());
      setSavedMensais(true);
      setTimeout(() => setSavedMensais(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar metas:', err);
      alert('Erro ao salvar. Verifique o console.');
    } finally {
      setSavingMensais(false);
    }
  };

  const salvarBonus = async () => {
    setSavingBonus(true);
    try {
      const res2 = await fetch('/api/bonus-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bonusEdit),
      });
      if (!res2.ok) throw new Error(await res2.text());
      setSavedBonus(true);
      setTimeout(() => setSavedBonus(false), 3000);
    } catch (err) {
      console.error('Erro ao salvar bônus:', err);
      alert('Erro ao salvar. Verifique o console.');
    } finally {
      setSavingBonus(false);
    }
  };

  const vendedoresFiltrados = allVendedores.filter(
    (v) => !buscaVend || v.toLowerCase().includes(buscaVend.toLowerCase())
  );

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>Configuração</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
            Metas PA mensais e bônus Televendas
          </p>
        </div>

        {/* Abas */}
        <div className="flex items-center gap-1 rounded-xl p-1 w-fit" style={{ background: '#f1f5f9' }}>
          {([
            { key: 'metas', label: 'Metas PA' },
            { key: 'bonus', label: 'Bônus Televendas' },
            { key: 'vendedores', label: 'Vendedores' },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setAba(tab.key)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
              style={{
                background: aba === tab.key ? '#00205C' : 'transparent',
                color: aba === tab.key ? '#FFD700' : '#64748b',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════
            ABA: METAS PA
        ══════════════════════════════ */}
        {aba === 'metas' && (
          <>
            {/* Período */}
            <div className="rounded-xl p-4 flex items-center gap-5 flex-wrap"
              style={{ background: '#ffffff', border: '2px solid #00205C' }}>
              <div className="flex items-center gap-2 shrink-0">
                <Calendar size={18} style={{ color: '#00205C' }} />
                <span className="text-sm font-semibold" style={{ color: '#00205C' }}>
                  Período de referência:
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
                <div className="px-3 py-1.5 rounded-lg text-sm font-bold mt-4"
                  style={{ background: '#00205C', color: '#FFD700' }}>
                  {MESES[mesMeta - 1]} {anoMeta}
                </div>
              </div>
            </div>

            {loading ? (
              <div className="text-center py-12" style={{ color: '#94a3b8' }}>Carregando...</div>
            ) : (
              <div className="relative rounded-xl shadow-sm overflow-hidden"
                style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>

                {savingMensais && (
                  <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(3px)' }}>
                    <div className="flex items-center gap-3 px-6 py-3 rounded-xl shadow-lg"
                      style={{ background: '#00205C', color: '#FFD700' }}>
                      <Loader2 size={18} className="animate-spin" />
                      <span className="text-sm font-semibold">Salvando metas...</span>
                    </div>
                  </div>
                )}

                {/* Toolbar */}
                <div className="flex items-center justify-between px-5 py-4 gap-3 flex-wrap"
                  style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <div className="rounded-lg p-3 flex items-start gap-2 flex-1"
                    style={{ background: '#0a1628', border: '1px solid #1a3a6e' }}>
                    <AlertCircle size={15} style={{ color: '#FFD700' }} className="shrink-0 mt-0.5" />
                    <p className="text-xs" style={{ color: '#94a3b8' }}>
                      <strong className="text-white">Televendas / Televendas MG:</strong> comissão calculada sobre os recebimentos.
                      Se não bater nenhuma meta PA, aplica-se o <strong className="text-white">% Sem Meta</strong>.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <input
                      type="text"
                      value={buscaVend}
                      onChange={(e) => setBuscaVend(e.target.value)}
                      placeholder="Buscar vendedor..."
                      className="rounded-lg px-3 py-1.5 text-sm outline-none"
                      style={{ border: '1px solid #e2e8f0', color: '#0a1628', width: 200 }}
                    />
                    <button
                      onClick={salvarMetasMensais}
                      disabled={savingMensais}
                      className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                      style={{
                        background: savingMensais ? '#e2e8f0' : savedMensais ? '#16a34a' : '#FFD700',
                        color: savingMensais ? '#64748b' : savedMensais ? '#ffffff' : '#00205C',
                      }}
                    >
                      {savingMensais ? (
                        <><Loader2 size={15} className="animate-spin" /> Salvando...</>
                      ) : savedMensais ? (
                        <><CheckCircle size={15} /> Salvo!</>
                      ) : (
                        <><Save size={15} /> Salvar</>
                      )}
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {/* Cabeçalho */}
                  <div className="grid px-5 py-2 text-xs font-semibold uppercase tracking-wider"
                    style={{
                      gridTemplateColumns: '280px repeat(3, 230px) 140px',
                      minWidth: 1210,
                      borderBottom: '1px solid #f1f5f9',
                      background: '#f8fafc',
                      color: '#64748b',
                    }}>
                    <span>Vendedor</span>
                    {(['Meta PA 1', 'Meta PA 2', 'Meta PA 3'] as const).map((label, i) => (
                      <span key={i} className="text-center px-4 py-1 rounded-full mx-2"
                        style={{
                          background: ['#dbeafe','#d1fae5','#fef3c7'][i],
                          color: ['#1e40af','#065f46','#92400e'][i],
                        }}>
                        {label}
                      </span>
                    ))}
                    <span className="text-center px-2 py-1 rounded-full"
                      style={{ background: '#fee2e2', color: '#991b1b' }}>
                      % Sem Meta
                    </span>
                  </div>

                  {/* Linhas */}
                  <div className="divide-y" style={{ borderColor: '#f1f5f9', minWidth: 1130 }}>
                    {vendedoresFiltrados.map((v) => {
                      const m = getMensal(v);
                      const temMeta = !!metasMensaisEdit[v];
                      return (
                        <div key={v}
                          className="grid items-center px-5 py-3"
                          style={{ gridTemplateColumns: '280px repeat(3, 230px) 140px' }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}>

                          <div className="flex items-center gap-2 pr-3">
                            <span className="text-sm font-medium" style={{ color: '#0a1628' }}>{v}</span>
                            {temMeta && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0"
                                style={{ background: '#d1fae5', color: '#065f46' }}>✓</span>
                            )}
                          </div>

                          {([
                            { vField: 'meta1_valor', pField: 'meta1_percentual', bg: '#eff6ff', border: '#bfdbfe' },
                            { vField: 'meta2_valor', pField: 'meta2_percentual', bg: '#f0fdf4', border: '#bbf7d0' },
                            { vField: 'meta3_valor', pField: 'meta3_percentual', bg: '#fffbeb', border: '#fde68a' },
                          ] as { vField: keyof Omit<VendedorMeta,'nome_vendedor'>; pField: keyof Omit<VendedorMeta,'nome_vendedor'>; bg: string; border: string }[]).map(({ vField, pField, bg, border }) => (
                            <div key={vField}
                              className="flex items-center gap-1.5 mx-2 px-2 py-1.5 rounded-lg"
                              style={{ background: bg, border: `1px solid ${border}` }}>
                              <span className="text-xs shrink-0" style={{ color: '#64748b' }}>R$</span>
                              <input type="number" min={0} step={1000} value={m[vField] as number}
                                onChange={(e) => updateMensal(v, vField, parseFloat(e.target.value) || 0)}
                                className="flex-1 min-w-0 rounded px-1.5 py-1 text-xs text-right outline-none bg-white font-medium"
                                style={{ border: '1px solid #e2e8f0', color: '#0a1628' }}
                                placeholder="0" onFocus={(e) => e.target.select()} />
                              <input type="number" min={0} max={100} step={0.5} value={m[pField] as number}
                                onChange={(e) => updateMensal(v, pField, parseFloat(e.target.value) || 0)}
                                className="w-14 rounded px-1.5 py-1 text-xs text-center outline-none font-bold"
                                style={{ border: '1px solid #e2e8f0', color: '#00205C', background: '#ffffff' }}
                                placeholder="0" onFocus={(e) => e.target.select()} />
                              <span className="text-xs shrink-0" style={{ color: '#64748b' }}>%</span>
                            </div>
                          ))}

                          {/* % Sem Meta */}
                          <div className="flex items-center gap-1.5 mx-2 px-2 py-1.5 rounded-lg"
                            style={{ background: '#fff1f2', border: '1px solid #fecdd3' }}>
                            <PctInput
                              value={m.percentual_sem_meta}
                              onChange={(val) => updateMensal(v, 'percentual_sem_meta', val)}
                              className="flex-1 min-w-0 rounded px-1.5 py-1 text-xs text-center outline-none font-bold"
                              style={{ border: '1px solid #e2e8f0', color: '#991b1b', background: '#ffffff' }}
                              placeholder="0" />
                            <span className="text-xs shrink-0" style={{ color: '#64748b' }}>%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════
            ABA: BÔNUS TELEVENDAS
        ══════════════════════════════ */}
        {aba === 'bonus' && (
          <div className="space-y-5">
            <div className="rounded-xl p-4 flex items-start gap-3"
              style={{ background: '#0a1628', border: '1px solid #1a3a6e' }}>
              <AlertCircle size={18} style={{ color: '#FFD700' }} className="shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed" style={{ color: '#94a3b8' }}>
                <strong className="text-white">Bônus global — Televendas / Televendas MG.</strong>{' '}
                Este bônus vale para todas as vendedoras e todos os meses. Altere apenas quando quiser mudar as regras.
                O bônus é <strong className="text-white">desbloqueado ao atingir a Meta PA 1</strong> e aplica-se
                a <strong className="text-white">% da maior faixa atingida sobre o valor PA</strong> total.
              </p>
            </div>

            <div className="relative rounded-xl shadow-sm overflow-hidden"
              style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>

              {savingBonus && (
                <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(3px)' }}>
                  <div className="flex items-center gap-3 px-6 py-3 rounded-xl shadow-lg"
                    style={{ background: '#00205C', color: '#FFD700' }}>
                    <Loader2 size={18} className="animate-spin" />
                    <span className="text-sm font-semibold">Salvando bônus...</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-5 py-4"
                style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
                <p className="text-sm font-bold" style={{ color: '#00205C' }}>
                  5 faixas de bônus sobre o valor PA
                </p>
                <button
                  onClick={salvarBonus}
                  disabled={savingBonus}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                  style={{
                    background: savingBonus ? '#e2e8f0' : savedBonus ? '#16a34a' : '#FFD700',
                    color: savingBonus ? '#64748b' : savedBonus ? '#ffffff' : '#00205C',
                  }}
                >
                  {savingBonus ? (
                    <><Loader2 size={15} className="animate-spin" /> Salvando...</>
                  ) : savedBonus ? (
                    <><CheckCircle size={15} /> Salvo!</>
                  ) : (
                    <><Save size={15} /> Salvar Bônus</>
                  )}
                </button>
              </div>

              <div className="p-6">
                <div className="grid grid-cols-5 gap-4">
                  {BONUS_CORES.map((cor, i) => {
                    const n = (i + 1) as 1|2|3|4|5;
                    const vField = `bonus${n}_valor` as keyof BonusConfig;
                    const pField = `bonus${n}_percentual` as keyof BonusConfig;
                    return (
                      <div key={n} className="rounded-xl p-4 flex flex-col gap-3"
                        style={{ background: cor.bg, border: `1px solid ${cor.border}` }}>
                        <p className="text-xs font-bold uppercase tracking-wide text-center"
                          style={{ color: cor.text }}>{cor.label}</p>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: '#64748b' }}>Mínimo de vendas PA</label>
                          <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-white"
                            style={{ border: '1px solid #e2e8f0' }}>
                            <span className="text-xs shrink-0" style={{ color: '#94a3b8' }}>R$</span>
                            <input
                              type="number" min={0} step={1000}
                              value={bonusEdit[vField] as number}
                              onChange={(e) => updateBonus(vField, parseFloat(e.target.value) || 0)}
                              className="flex-1 min-w-0 text-xs text-right outline-none font-medium bg-transparent"
                              style={{ color: '#0a1628' }}
                              placeholder="0" onFocus={(e) => e.target.select()} />
                          </div>
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs" style={{ color: '#64748b' }}>% sobre valor PA</label>
                          <div className="flex items-center gap-1 rounded-lg px-2 py-1.5 bg-white"
                            style={{ border: '1px solid #e2e8f0' }}>
                            <input
                              type="number" min={0} max={100} step={0.5}
                              value={bonusEdit[pField] as number}
                              onChange={(e) => updateBonus(pField, parseFloat(e.target.value) || 0)}
                              className="flex-1 min-w-0 text-sm text-center outline-none font-bold bg-transparent"
                              style={{ color: cor.text }}
                              placeholder="0" onFocus={(e) => e.target.select()} />
                            <span className="text-xs shrink-0" style={{ color: '#64748b' }}>%</span>
                          </div>
                        </div>

                        {/* Preview */}
                        {(bonusEdit[vField] as number) > 0 && (bonusEdit[pField] as number) > 0 && (
                          <p className="text-xs text-center rounded-lg py-1"
                            style={{ background: cor.border, color: cor.text }}>
                            A partir de R$ {((bonusEdit[vField] as number) / 1000).toFixed(0)}k → {bonusEdit[pField]}%
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        {/* ══════════════════════════════
            ABA: VENDEDORES
        ══════════════════════════════ */}
        {aba === 'vendedores' && (
          <div className="rounded-xl shadow-sm overflow-hidden"
            style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-5 py-4 gap-3 flex-wrap"
              style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc' }}>
              <div className="flex items-center gap-2">
                <Users size={16} style={{ color: '#00205C' }} />
                <span className="text-sm font-semibold" style={{ color: '#00205C' }}>
                  Visibilidade dos vendedores no painel
                </span>
                {vendedoresComStatus.length > 0 && (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ background: '#d1fae5', color: '#065f46' }}>
                    {vendedoresComStatus.filter((v) => v.ativo).length} ativos de {vendedoresComStatus.length}
                  </span>
                )}
              </div>
              <input
                type="text"
                value={buscaAtivo}
                onChange={(e) => setBuscaAtivo(e.target.value)}
                placeholder="Buscar vendedor..."
                className="rounded-lg px-3 py-1.5 text-sm outline-none"
                style={{ border: '1px solid #e2e8f0', color: '#0a1628', width: 200 }}
              />
            </div>

            {loadingVendAtivo ? (
              <div className="text-center py-12" style={{ color: '#94a3b8' }}>Carregando...</div>
            ) : (
              <div className="divide-y" style={{ borderColor: '#f1f5f9' }}>
                {vendedoresComStatus
                  .filter((v) => !buscaAtivo || v.nome.toLowerCase().includes(buscaAtivo.toLowerCase()))
                  .map((v) => (
                    <div key={v.nome}
                      className="flex items-center justify-between px-5 py-3"
                      style={{ opacity: togglingVend[v.nome] ? 0.5 : 1 }}
                      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}>

                      <div className="flex items-center gap-2.5">
                        <span className="text-sm font-medium" style={{ color: v.ativo ? '#0a1628' : '#94a3b8' }}>
                          {v.nome}
                        </span>
                        {!v.ativo && (
                          <span className="text-xs px-1.5 py-0.5 rounded-full"
                            style={{ background: '#fee2e2', color: '#991b1b' }}>
                            inativo
                          </span>
                        )}
                      </div>

                      {/* Toggle switch */}
                      <button
                        onClick={() => toggleVendedorAtivo(v.nome, !v.ativo)}
                        disabled={!!togglingVend[v.nome]}
                        title={v.ativo ? 'Clique para inativar' : 'Clique para ativar'}
                        className="relative inline-flex items-center rounded-full transition-colors duration-200 cursor-pointer focus:outline-none"
                        style={{
                          width: 40,
                          height: 22,
                          background: v.ativo ? '#16a34a' : '#cbd5e1',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          className="inline-block rounded-full bg-white shadow transition-transform duration-200"
                          style={{
                            width: 16,
                            height: 16,
                            transform: v.ativo ? 'translateX(20px)' : 'translateX(3px)',
                          }}
                        />
                      </button>
                    </div>
                  ))}

                {vendedoresComStatus.filter((v) => !buscaAtivo || v.nome.toLowerCase().includes(buscaAtivo.toLowerCase())).length === 0 && (
                  <div className="text-center py-10 text-sm" style={{ color: '#94a3b8' }}>
                    Nenhum vendedor encontrado
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
