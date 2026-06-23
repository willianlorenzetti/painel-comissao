'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { formatBRL, MESES } from '@/lib/format';
import {
  calcularComissaoTelevendas,
  type MetaConfig,
  type BonusConfig,
  type ComissaoTelevendas,
} from '@/lib/commission';
import { useUser } from '@/components/providers/UserProvider';
import { ChevronDown, Calculator, TrendingUp, Award, DollarSign, Clock } from 'lucide-react';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

// ─── pure helpers ──────────────────────────────────────────────────────────────

function findBestTier(pa: number, bc: BonusConfig) {
  return [
    { label: 'Bônus 5', valor: bc.bonus5_valor, pct: bc.bonus5_percentual },
    { label: 'Bônus 4', valor: bc.bonus4_valor, pct: bc.bonus4_percentual },
    { label: 'Bônus 3', valor: bc.bonus3_valor, pct: bc.bonus3_percentual },
    { label: 'Bônus 2', valor: bc.bonus2_valor, pct: bc.bonus2_percentual },
    { label: 'Bônus 1', valor: bc.bonus1_valor, pct: bc.bonus1_percentual },
  ]
    .filter((t) => t.valor > 0 && t.pct > 0)
    .find((t) => pa >= t.valor) ?? null;
}

function findBestMeta(pa: number, mc: MetaConfig) {
  return [
    { label: 'Meta PA 3', threshold: mc.meta3_valor, pct: mc.meta3_percentual },
    { label: 'Meta PA 2', threshold: mc.meta2_valor, pct: mc.meta2_percentual },
    { label: 'Meta PA 1', threshold: mc.meta1_valor, pct: mc.meta1_percentual },
  ]
    .filter((m) => m.threshold > 0)
    .find((m) => pa >= m.threshold) ?? null;
}

interface PAOtimoResult {
  paNeeded: number;
  meta: { label: string; threshold: number; pct: number };
  bonusTier: { label: string; pct: number; valor: number } | null;
  commissionMeta: number;
  commissionBonus: number;
  commissionTotal: number;
}

// Finds the minimum PA to reach `desired` commission given fixed avgRec.
function calcularPAOtimo(
  desired: number,
  avgRec: number,
  mc: MetaConfig,
  bc: BonusConfig
): PAOtimoResult | null {
  if (desired <= 0 || avgRec < 0) return null;

  const getCommission = (pa: number) => {
    const meta = findBestMeta(pa, mc);
    if (!meta) return 0;
    const tier = mc.meta1_valor > 0 && pa >= mc.meta1_valor ? findBestTier(pa, bc) : null;
    return (meta.pct / 100) * avgRec + (tier ? (tier.pct / 100) * pa : 0);
  };

  const buildResult = (pa: number): PAOtimoResult | null => {
    const meta = findBestMeta(pa, mc);
    if (!meta) return null;
    const tier = mc.meta1_valor > 0 && pa >= mc.meta1_valor ? findBestTier(pa, bc) : null;
    const commMeta = (meta.pct / 100) * avgRec;
    const commBonus = tier ? (tier.pct / 100) * pa : 0;
    return { paNeeded: pa, meta, bonusTier: tier, commissionMeta: commMeta, commissionBonus: commBonus, commissionTotal: commMeta + commBonus };
  };

  // All threshold breakpoints sorted ascending
  const bps = [
    mc.meta1_valor, mc.meta2_valor, mc.meta3_valor,
    bc.bonus1_valor, bc.bonus2_valor, bc.bonus3_valor, bc.bonus4_valor, bc.bonus5_valor,
  ].filter((v) => v > 0).sort((a, b) => a - b);
  const uniqueBps = [...new Set(bps)];

  for (const bp of uniqueBps) {
    if (getCommission(bp) < desired) continue;
    const meta = findBestMeta(bp, mc);
    if (!meta) continue;
    const tier = mc.meta1_valor > 0 && bp >= mc.meta1_valor ? findBestTier(bp, bc) : null;
    const commMeta = (meta.pct / 100) * avgRec;
    const remaining = desired - commMeta;
    let pa: number;
    if (remaining <= 0) {
      pa = meta.threshold;
    } else if (tier) {
      pa = Math.max(meta.threshold, tier.valor, remaining / (tier.pct / 100));
    } else {
      continue;
    }
    return buildResult(pa);
  }

  // Beyond last breakpoint — highest meta and bonus tier apply indefinitely
  const lastBp = uniqueBps[uniqueBps.length - 1] ?? mc.meta1_valor;
  if (!lastBp) return null;
  const meta = findBestMeta(lastBp, mc);
  const tier = mc.meta1_valor > 0 ? findBestTier(lastBp, bc) : null;
  if (!meta) return null;
  const commMeta = (meta.pct / 100) * avgRec;
  const remaining = desired - commMeta;
  if (remaining <= 0) return buildResult(meta.threshold);
  if (!tier) return null;
  return buildResult(Math.max(meta.threshold, tier.valor, remaining / (tier.pct / 100)));
}

// ─── component ────────────────────────────────────────────────────────────────

interface MediaRec {
  media: number;
  meses: { ano: number; mes: number; label: string; total: number }[];
}

export default function SimulacaoPage() {
  const usuario = useUser();

  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedor, setVendedor] = useState('');
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(ANO_ATUAL);

  const [metaConfig, setMetaConfig] = useState<MetaConfig | null>(null);
  const [bonusConfig, setBonusConfig] = useState<BonusConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Direct mode
  const [valorPA, setValorPA] = useState('');
  const [recebimentos, setRecebimentos] = useState('');
  const [resultado, setResultado] = useState<ComissaoTelevendas | null>(null);

  // Reverse mode
  const [modoReverso, setModoReverso] = useState(false);
  const [comissaoDesejada, setComissaoDesejada] = useState('');
  const [reversoCalculado, setReversoCalculado] = useState(false);

  // Historical avg recebimentos (loaded alongside config)
  const [mediaRec, setMediaRec] = useState<MediaRec | null>(null);

  useEffect(() => {
    if (!usuario || usuario === 'loading') return;
    if (usuario.cargo === 'VENDEDOR') {
      if (usuario.nome_vendedor) setVendedor(usuario.nome_vendedor);
    } else {
      fetch('/api/filtros')
        .then((r) => r.json())
        .then((f) => setVendedores(f.vendedores || []));
    }
  }, [usuario]);

  useEffect(() => {
    if (!vendedor) return;
    carregarConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendedor, mes, ano]);

  const carregarConfig = async () => {
    setLoadingConfig(true);
    setResultado(null);
    setMediaRec(null);
    try {
      const [metaRes, bonusRes, mediaRes] = await Promise.all([
        fetch(`/api/metas-mensais?ano=${ano}&mes=${mes}`),
        fetch(`/api/bonus-config`),
        fetch(`/api/recebimentos-media?vendedor=${encodeURIComponent(vendedor)}&mes=${mes}&ano=${ano}`),
      ]);
      const metas: (MetaConfig & { nome_vendedor: string })[] = await metaRes.json();
      const bonus: BonusConfig = await bonusRes.json();
      const media: MediaRec & { error?: string } = await mediaRes.json();
      setMetaConfig(metas.find((m) => m.nome_vendedor === vendedor) ?? null);
      setBonusConfig(bonus);
      if (!media.error) setMediaRec(media);
    } finally {
      setLoadingConfig(false);
    }
  };

  const simular = () => {
    const pa = parseFloat(valorPA.replace(/\./g, '').replace(',', '.')) || 0;
    const rec = parseFloat(recebimentos.replace(/\./g, '').replace(',', '.')) || 0;
    setResultado(calcularComissaoTelevendas(pa, rec, metaConfig, bonusConfig));
  };

  const avgRec = mediaRec?.media ?? 0;
  const comissaoDesejadaNum = parseFloat(comissaoDesejada.replace(/\./g, '').replace(',', '.')) || 0;
  const paOtimo: PAOtimoResult | null =
    reversoCalculado && comissaoDesejadaNum > 0 && metaConfig && bonusConfig && avgRec > 0
      ? calcularPAOtimo(comissaoDesejadaNum, avgRec, metaConfig, bonusConfig)
      : null;

  const metasVisiveis = metaConfig
    ? [
        { label: 'Meta PA 1', valor: metaConfig.meta1_valor, pct: metaConfig.meta1_percentual },
        { label: 'Meta PA 2', valor: metaConfig.meta2_valor, pct: metaConfig.meta2_percentual },
        { label: 'Meta PA 3', valor: metaConfig.meta3_valor, pct: metaConfig.meta3_percentual },
      ].filter((m) => m.valor > 0)
    : [];

  const bonusTiersVisiveis = bonusConfig
    ? [
        { label: 'Bônus 1', valor: bonusConfig.bonus1_valor, pct: bonusConfig.bonus1_percentual },
        { label: 'Bônus 2', valor: bonusConfig.bonus2_valor, pct: bonusConfig.bonus2_percentual },
        { label: 'Bônus 3', valor: bonusConfig.bonus3_valor, pct: bonusConfig.bonus3_percentual },
        { label: 'Bônus 4', valor: bonusConfig.bonus4_valor, pct: bonusConfig.bonus4_percentual },
        { label: 'Bônus 5', valor: bonusConfig.bonus5_valor, pct: bonusConfig.bonus5_percentual },
      ].filter((t) => t.valor > 0)
    : [];

  const isCargo = usuario && usuario !== 'loading' ? usuario.cargo : null;
  const META_BG   = ['#eff6ff', '#f0fdf4', '#fffbeb'];
  const META_BORDER = ['#bfdbfe', '#bbf7d0', '#fde68a'];
  const META_TEXT = ['#1e40af', '#065f46', '#92400e'];

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>Simulação de Comissão</h1>
          <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
            Calcule quanto vai receber ou quanto precisa vender — Televendas / Televendas MG
          </p>
        </div>

        {/* Filtros */}
        <div className="rounded-xl p-4 flex flex-wrap items-end gap-4"
          style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
          {isCargo !== 'VENDEDOR' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Vendedor</label>
              <div className="relative">
                <select value={vendedor} onChange={(e) => setVendedor(e.target.value)}
                  className="appearance-none rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer"
                  style={{ border: '1px solid #e2e8f0', color: '#00205C', minWidth: 220 }}>
                  <option value="">Selecione...</option>
                  {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Mês</label>
            <div className="relative">
              <select value={mes} onChange={(e) => setMes(parseInt(e.target.value))}
                className="appearance-none rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer"
                style={{ border: '1px solid #e2e8f0', color: '#00205C', minWidth: 130 }}>
                {MESES.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium uppercase tracking-wide" style={{ color: '#64748b' }}>Ano</label>
            <div className="relative">
              <select value={ano} onChange={(e) => setAno(parseInt(e.target.value))}
                className="appearance-none rounded-lg px-3 py-2 pr-8 text-sm font-medium cursor-pointer"
                style={{ border: '1px solid #e2e8f0', color: '#00205C', minWidth: 100 }}>
                {ANOS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2 top-3 pointer-events-none" style={{ color: '#64748b' }} />
            </div>
          </div>
          {loadingConfig && <span className="text-sm" style={{ color: '#64748b' }}>Carregando...</span>}
        </div>

        {vendedor && !loadingConfig && (
          <>
            {/* Metas e bônus configurados */}
            {(metasVisiveis.length > 0 || bonusTiersVisiveis.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {metasVisiveis.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: '#00205C' }}>
                      Metas PA — {MESES[mes - 1]} {ano}
                    </h3>
                    <div className="space-y-2">
                      {metasVisiveis.map((m, i) => (
                        <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded-lg text-sm"
                          style={{ background: META_BG[i] }}>
                          <span className="font-medium" style={{ color: META_TEXT[i] }}>{m.label}</span>
                          <span style={{ color: '#64748b' }}>{formatBRL(m.valor)}</span>
                          <span className="font-bold" style={{ color: META_TEXT[i] }}>{m.pct}%</span>
                        </div>
                      ))}
                      {(metaConfig?.percentual_sem_meta ?? 0) > 0 && (
                        <div className="flex justify-between items-center py-1.5 px-3 rounded-lg text-sm"
                          style={{ background: '#fff1f2' }}>
                          <span className="font-medium" style={{ color: '#991b1b' }}>Sem meta</span>
                          <span style={{ color: '#64748b' }}>—</span>
                          <span className="font-bold" style={{ color: '#991b1b' }}>{metaConfig?.percentual_sem_meta}%</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {bonusTiersVisiveis.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: '#00205C' }}>
                      Bônus — {MESES[mes - 1]} {ano}
                    </h3>
                    <div className="space-y-2">
                      {bonusTiersVisiveis.map((t, i) => (
                        <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded-lg text-sm"
                          style={{ background: ['#eff6ff','#f0fdf4','#fffbeb','#fdf4ff','#fff1f2'][i] }}>
                          <span className="font-medium" style={{ color: '#64748b' }}>{t.label}</span>
                          <span style={{ color: '#64748b' }}>{formatBRL(t.valor)}</span>
                          <span className="font-bold" style={{ color: '#00205C' }}>{t.pct}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {!metasVisiveis.length && (
              <div className="rounded-xl p-4 text-sm text-center"
                style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                Nenhuma meta configurada para {vendedor} em {MESES[mes - 1]} {ano}. Configure em Configuração.
              </div>
            )}

            {/* Modo toggle */}
            <div className="flex items-center gap-2 rounded-xl p-1 w-fit" style={{ background: '#f1f5f9' }}>
              <button onClick={() => setModoReverso(false)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ background: !modoReverso ? '#00205C' : 'transparent', color: !modoReverso ? '#FFD700' : '#64748b' }}>
                Quanto vou ganhar?
              </button>
              <button onClick={() => setModoReverso(true)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ background: modoReverso ? '#00205C' : 'transparent', color: modoReverso ? '#FFD700' : '#64748b' }}>
                Quanto preciso vender?
              </button>
            </div>

            {/* ── MODO DIRETO ──────────────────────────────────────────────────────── */}
            {!modoReverso && (
              <div className="rounded-xl p-5 space-y-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <h3 className="text-sm font-bold" style={{ color: '#00205C' }}>
                  <Calculator size={15} className="inline mr-2" />
                  Simulação direta
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>
                      Vendas PA (Chave + Ferragens PA)
                    </label>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid #e2e8f0' }}>
                      <span className="text-sm" style={{ color: '#94a3b8' }}>R$</span>
                      <input type="text" value={valorPA} onChange={(e) => setValorPA(e.target.value)}
                        placeholder="0,00" className="flex-1 outline-none text-sm font-medium"
                        style={{ color: '#0a1628' }} onFocus={(e) => e.target.select()} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>
                        Recebimentos do mês
                      </label>
                      {mediaRec && mediaRec.media > 0 && (
                        <button
                          onClick={() => setRecebimentos(Math.round(mediaRec.media).toLocaleString('pt-BR'))}
                          className="text-xs font-medium px-2 py-0.5 rounded"
                          style={{ background: '#eff6ff', color: '#1e40af' }}>
                          Usar média ({formatBRL(mediaRec.media)})
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid #e2e8f0' }}>
                      <span className="text-sm" style={{ color: '#94a3b8' }}>R$</span>
                      <input type="text" value={recebimentos} onChange={(e) => setRecebimentos(e.target.value)}
                        placeholder="0,00" className="flex-1 outline-none text-sm font-medium"
                        style={{ color: '#0a1628' }} onFocus={(e) => e.target.select()} />
                    </div>
                  </div>
                </div>
                <button onClick={simular}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold"
                  style={{ background: '#00205C', color: '#FFD700' }}>
                  <Calculator size={15} /> Calcular
                </button>

                {resultado && (
                  <div className="space-y-4 pt-2 border-t" style={{ borderColor: '#f1f5f9' }}>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-xl p-4 text-center"
                        style={{ background: resultado.meta_atingida ? '#f0fdf4' : '#fff1f2', border: `1px solid ${resultado.meta_atingida ? '#bbf7d0' : '#fecdd3'}` }}>
                        <TrendingUp size={18} className="mx-auto mb-2" style={{ color: resultado.meta_atingida ? '#16a34a' : '#dc2626' }} />
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>Meta PA</p>
                        <p className="text-sm font-bold mt-1" style={{ color: resultado.meta_atingida ? '#16a34a' : '#dc2626' }}>
                          {resultado.meta_atingida?.label ?? 'Não atingida'}
                        </p>
                        {resultado.meta_atingida && (
                          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                            {resultado.meta_atingida.percentual}% × recebimentos
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl p-4 text-center"
                        style={{ background: resultado.bonus_desbloqueado ? '#f0fdf4' : '#f8fafc', border: `1px solid ${resultado.bonus_desbloqueado ? '#bbf7d0' : '#e2e8f0'}` }}>
                        <Award size={18} className="mx-auto mb-2" style={{ color: resultado.bonus_desbloqueado ? '#16a34a' : '#94a3b8' }} />
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>Bônus</p>
                        <p className="text-sm font-bold mt-1" style={{ color: resultado.bonus_desbloqueado ? '#16a34a' : '#94a3b8' }}>
                          {resultado.bonus_tier?.label ?? (resultado.bonus_desbloqueado ? 'Nenhum tier' : 'Não desbloqueado')}
                        </p>
                        {resultado.bonus_tier && (
                          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                            {resultado.bonus_tier.percentual}% × vendas PA
                          </p>
                        )}
                      </div>
                      <div className="rounded-xl p-4 text-center" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <DollarSign size={18} className="mx-auto mb-2" style={{ color: '#1e40af' }} />
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>Total a Receber</p>
                        <p className="text-lg font-bold mt-1" style={{ color: '#00205C' }}>{formatBRL(resultado.comissao_total)}</p>
                      </div>
                    </div>
                    <div className="rounded-xl p-4 space-y-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: '#64748b' }}>Detalhamento</p>
                      <div className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#e2e8f0' }}>
                        <span style={{ color: '#64748b' }}>Valor PA (Chave + Ferragens)</span>
                        <span className="font-semibold" style={{ color: '#0a1628' }}>{formatBRL(resultado.valor_pa)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#e2e8f0' }}>
                        <span style={{ color: '#64748b' }}>Recebimentos</span>
                        <span className="font-semibold" style={{ color: '#0a1628' }}>{formatBRL(resultado.total_recebido)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#e2e8f0' }}>
                        <span style={{ color: '#64748b' }}>
                          Comissão Meta
                          {resultado.meta_atingida
                            ? ` (${resultado.meta_atingida.percentual}% × recebimentos)`
                            : resultado.percentual_sem_meta > 0
                              ? ` (${resultado.percentual_sem_meta}% sem meta × recebimentos)`
                              : ' (sem meta e sem % definida)'}
                        </span>
                        <span className="font-semibold" style={{ color: '#0a1628' }}>{formatBRL(resultado.comissao_meta)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-1 border-b" style={{ borderColor: '#e2e8f0' }}>
                        <span style={{ color: '#64748b' }}>
                          Comissão Bônus{resultado.bonus_tier ? ` (${resultado.bonus_tier.percentual}% × valor PA)` : ' (não desbloqueado)'}
                        </span>
                        <span className="font-semibold" style={{ color: '#0a1628' }}>{formatBRL(resultado.comissao_bonus)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 font-bold">
                        <span style={{ color: '#00205C' }}>Total comissão</span>
                        <span style={{ color: '#00205C', fontSize: 16 }}>{formatBRL(resultado.comissao_total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MODO REVERSO ─────────────────────────────────────────────────────── */}
            {modoReverso && metasVisiveis.length > 0 && (
              <div className="rounded-xl p-5 space-y-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <div>
                  <h3 className="text-sm font-bold" style={{ color: '#00205C' }}>
                    <TrendingUp size={15} className="inline mr-2" />
                    Quanto preciso vender?
                  </h3>
                  <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                    Informe quanto quer ganhar. Calculamos o PA que você precisa vender com base no seu recebimento médio dos últimos 3 meses.
                  </p>
                </div>

                {/* Input + botão */}
                <div className="flex items-end gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>
                      Comissão desejada
                    </label>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid #e2e8f0' }}>
                      <span className="text-sm" style={{ color: '#94a3b8' }}>R$</span>
                      <input
                        type="text"
                        value={comissaoDesejada}
                        onChange={(e) => { setComissaoDesejada(e.target.value); setReversoCalculado(false); }}
                        placeholder="0,00"
                        className="w-48 outline-none text-sm font-medium"
                        style={{ color: '#0a1628' }}
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => setReversoCalculado(true)}
                    disabled={!comissaoDesejada}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-40"
                    style={{ background: '#00205C', color: '#FFD700' }}>
                    <Calculator size={15} /> Calcular
                  </button>
                </div>

                {/* Resultado */}
                {reversoCalculado && comissaoDesejadaNum > 0 && (
                  <div className="space-y-4 pt-2 border-t" style={{ borderColor: '#f1f5f9' }}>

                    {/* Média de recebimentos */}
                    {mediaRec && (
                      <div className="rounded-xl p-4" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <Clock size={13} style={{ color: '#64748b' }} />
                          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>
                            Recebimento médio — últimos 3 meses
                          </span>
                        </div>
                        <p className="text-2xl font-bold" style={{ color: '#00205C' }}>
                          {formatBRL(mediaRec.media)}
                        </p>
                        <div className="flex gap-5 mt-2">
                          {mediaRec.meses.map((m) => (
                            <div key={`${m.ano}-${m.mes}`}>
                              <span className="text-xs" style={{ color: '#94a3b8' }}>{m.label}: </span>
                              <span className="text-xs font-semibold" style={{ color: '#64748b' }}>{formatBRL(m.total)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {avgRec <= 0 && (
                      <div className="rounded-xl p-4 text-sm text-center"
                        style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                        Sem histórico de recebimentos para calcular. Use o modo &quot;Quanto vou ganhar?&quot; e preencha os valores manualmente.
                      </div>
                    )}

                    {avgRec > 0 && (
                      paOtimo ? (
                        <div className="space-y-3">
                          {/* Destaque: PA necessário */}
                          <div className="rounded-xl p-6 text-center"
                            style={{ background: 'linear-gradient(135deg, #00205C 0%, #1a3a6e 100%)' }}>
                            <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: '#64748b' }}>
                              PA que você precisa vender
                            </p>
                            <p className="text-5xl font-bold" style={{ color: '#FFD700' }}>
                              {formatBRL(paOtimo.paNeeded)}
                            </p>
                            <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                              <span className="text-xs px-3 py-1 rounded-full font-medium"
                                style={{ background: '#1a3a6e', color: '#cbd5e1' }}>
                                {paOtimo.meta.label}
                              </span>
                              {paOtimo.bonusTier && (
                                <span className="text-xs px-3 py-1 rounded-full font-medium"
                                  style={{ background: '#14532d', color: '#bbf7d0' }}>
                                  {paOtimo.bonusTier.label} ({paOtimo.bonusTier.pct}% bônus)
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Breakdown */}
                          <div className="rounded-xl p-4 space-y-2" style={{ background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                            <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: '#64748b' }}>
                              Como chega nesse valor
                            </p>
                            <div className="flex justify-between text-sm py-1.5 border-b" style={{ borderColor: '#e2e8f0' }}>
                              <span style={{ color: '#64748b' }}>Recebimento médio (base do cálculo)</span>
                              <span className="font-semibold" style={{ color: '#0a1628' }}>{formatBRL(avgRec)}</span>
                            </div>
                            <div className="flex justify-between text-sm py-1.5 border-b" style={{ borderColor: '#e2e8f0' }}>
                              <span style={{ color: '#64748b' }}>
                                Comissão meta ({paOtimo.meta.pct}% × recebimento)
                              </span>
                              <span className="font-semibold" style={{ color: '#0a1628' }}>
                                {formatBRL(paOtimo.commissionMeta)}
                              </span>
                            </div>
                            {paOtimo.bonusTier && (
                              <div className="flex justify-between text-sm py-1.5 border-b" style={{ borderColor: '#e2e8f0' }}>
                                <span style={{ color: '#64748b' }}>
                                  {paOtimo.bonusTier.label} ({paOtimo.bonusTier.pct}% × {formatBRL(paOtimo.paNeeded)} PA)
                                </span>
                                <span className="font-semibold" style={{ color: '#0a1628' }}>
                                  {formatBRL(paOtimo.commissionBonus)}
                                </span>
                              </div>
                            )}
                            <div className="flex justify-between text-sm py-2 font-bold">
                              <span style={{ color: '#00205C' }}>Total comissão</span>
                              <span style={{ color: '#00205C', fontSize: 16 }}>
                                {formatBRL(paOtimo.commissionTotal)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl p-4 text-sm text-center"
                          style={{ background: '#fff1f2', color: '#991b1b', border: '1px solid #fecdd3' }}>
                          Não é possível atingir {formatBRL(comissaoDesejadaNum)} com as metas e bônus configurados.
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
