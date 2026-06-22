'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { formatBRL, MESES } from '@/lib/format';
import { calcularComissaoTelevendas, type MetaConfig, type BonusConfig, type ComissaoTelevendas } from '@/lib/commission';
import { useUser } from '@/components/providers/UserProvider';
import { ChevronDown, Calculator, TrendingUp, Award, DollarSign } from 'lucide-react';

const ANO_ATUAL = new Date().getFullYear();
const ANOS = [ANO_ATUAL, ANO_ATUAL - 1, ANO_ATUAL - 2];

export default function SimulacaoPage() {
  const usuario = useUser();

  const [vendedores, setVendedores] = useState<string[]>([]);
  const [vendedor, setVendedor] = useState('');
  const [mes, setMes] = useState(new Date().getMonth() + 1);
  const [ano, setAno] = useState(ANO_ATUAL);

  const [metaConfig, setMetaConfig] = useState<MetaConfig | null>(null);
  const [bonusConfig, setBonusConfig] = useState<BonusConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(false);

  // Inputs de simulação
  const [valorPA, setValorPA] = useState('');
  const [recebimentos, setRecebimentos] = useState('');

  // Resultado
  const [resultado, setResultado] = useState<ComissaoTelevendas | null>(null);

  // Modo reverso
  const [modoReverso, setModoReverso] = useState(false);
  const [comissaoDesejada, setComissaoDesejada] = useState('');
  const [recebimentosReverso, setRecebimentosReverso] = useState('');
  const [reversoCalculado, setReversoCalculado] = useState(false);

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
    try {
      const [metaRes, bonusRes] = await Promise.all([
        fetch(`/api/metas-mensais?ano=${ano}&mes=${mes}`),
        fetch(`/api/bonus-config`),
      ]);
      const metas: (MetaConfig & { nome_vendedor: string })[] = await metaRes.json();
      const bonus: BonusConfig = await bonusRes.json();
      const meta = metas.find((m) => m.nome_vendedor === vendedor) ?? null;
      setMetaConfig(meta);
      setBonusConfig(bonus);
    } finally {
      setLoadingConfig(false);
    }
  };

  const simular = () => {
    const pa = parseFloat(valorPA.replace(/\./g, '').replace(',', '.')) || 0;
    const rec = parseFloat(recebimentos.replace(/\./g, '').replace(',', '.')) || 0;
    setResultado(calcularComissaoTelevendas(pa, rec, metaConfig, bonusConfig));
  };

  // Cálculo reverso: dado comissão desejada, quanto preciso vender em PA e quanto preciso receber?
  // comissao = (pct/100) × recebimentos  →  recebimentos = comissao / (pct/100)
  // PA mínimo = threshold da meta para ativá-la
  const calcularReverso = () => {
    const comissao = parseFloat(comissaoDesejada.replace(/\./g, '').replace(',', '.')) || 0;
    if (!metaConfig || comissao <= 0) return null;

    const metas = [
      { label: 'Meta PA 1', valor: metaConfig.meta1_valor, pct: metaConfig.meta1_percentual },
      { label: 'Meta PA 2', valor: metaConfig.meta2_valor, pct: metaConfig.meta2_percentual },
      { label: 'Meta PA 3', valor: metaConfig.meta3_valor, pct: metaConfig.meta3_percentual },
    ].filter((m) => m.valor > 0 && m.pct > 0);

    return metas.map((m) => {
      // Recebimentos necessários só com comissão de meta (sem bônus)
      const recNecessario = comissao / (m.pct / 100);

      // Cenário com bônus: se atingir o maior tier de bônus compatível com o PA mínimo desta meta,
      // o bônus contribui com parte da comissão → precisa de menos recebimentos
      let recComBonus: number | null = null;
      let bonusTierUsado: { label: string; pct: number; valor: number } | null = null;
      if (bonusConfig) {
        const tiers = [
          { label: 'Bônus 5', valor: bonusConfig.bonus5_valor, pct: bonusConfig.bonus5_percentual },
          { label: 'Bônus 4', valor: bonusConfig.bonus4_valor, pct: bonusConfig.bonus4_percentual },
          { label: 'Bônus 3', valor: bonusConfig.bonus3_valor, pct: bonusConfig.bonus3_percentual },
          { label: 'Bônus 2', valor: bonusConfig.bonus2_valor, pct: bonusConfig.bonus2_percentual },
          { label: 'Bônus 1', valor: bonusConfig.bonus1_valor, pct: bonusConfig.bonus1_percentual },
        ].filter((t) => t.valor > 0 && t.pct > 0 && t.valor <= m.valor);
        const tier = tiers[0] ?? null; // maior tier de bônus ativado quando PA = paMinimo da meta
        if (tier) {
          const comissaoBonus = (tier.pct / 100) * m.valor; // bônus mínimo com PA exatamente no threshold
          const comissaoMetaNecessaria = comissao - comissaoBonus;
          if (comissaoMetaNecessaria > 0) {
            recComBonus = comissaoMetaNecessaria / (m.pct / 100);
            bonusTierUsado = tier;
          }
        }
      }

      return { label: m.label, pct: m.pct, paMinimo: m.valor, recNecessario, recComBonus, bonusTierUsado };
    });
  };

  const metasVisiveis = metaConfig
    ? [
        { label: 'Meta PA 1', valor: metaConfig.meta1_valor, pct: metaConfig.meta1_percentual },
        { label: 'Meta PA 2', valor: metaConfig.meta2_valor, pct: metaConfig.meta2_percentual },
        { label: 'Meta PA 3', valor: metaConfig.meta3_valor, pct: metaConfig.meta3_percentual },
      ].filter((m) => m.valor > 0)
    : [];

  const bonusTiers = bonusConfig
    ? [
        { label: 'Bônus 1', valor: bonusConfig.bonus1_valor, pct: bonusConfig.bonus1_percentual },
        { label: 'Bônus 2', valor: bonusConfig.bonus2_valor, pct: bonusConfig.bonus2_percentual },
        { label: 'Bônus 3', valor: bonusConfig.bonus3_valor, pct: bonusConfig.bonus3_percentual },
        { label: 'Bônus 4', valor: bonusConfig.bonus4_valor, pct: bonusConfig.bonus4_percentual },
        { label: 'Bônus 5', valor: bonusConfig.bonus5_valor, pct: bonusConfig.bonus5_percentual },
      ].filter((t) => t.valor > 0)
    : [];

  const reversoResultado = modoReverso ? calcularReverso() : null;
  const isCargo = usuario && usuario !== 'loading' ? usuario.cargo : null;

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
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
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

          {loadingConfig && (
            <span className="text-sm" style={{ color: '#64748b' }}>Carregando metas...</span>
          )}
        </div>

        {vendedor && !loadingConfig && (
          <>
            {/* Metas configuradas */}
            {(metasVisiveis.length > 0 || bonusTiers.length > 0) && (
              <div className="grid grid-cols-2 gap-4">
                {metasVisiveis.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: '#00205C' }}>Metas PA — {MESES[mes-1]} {ano}</h3>
                    <div className="space-y-2">
                      {metasVisiveis.map((m, i) => (
                        <div key={i} className="flex justify-between items-center py-1.5 px-3 rounded-lg text-sm"
                          style={{ background: ['#eff6ff','#f0fdf4','#fffbeb'][i] }}>
                          <span className="font-medium" style={{ color: ['#1e40af','#065f46','#92400e'][i] }}>{m.label}</span>
                          <span style={{ color: '#64748b' }}>{formatBRL(m.valor)}</span>
                          <span className="font-bold" style={{ color: ['#1e40af','#065f46','#92400e'][i] }}>{m.pct}%</span>
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

                {bonusTiers.length > 0 && (
                  <div className="rounded-xl p-4" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                    <h3 className="text-sm font-bold mb-3" style={{ color: '#00205C' }}>Bônus — {MESES[mes-1]} {ano}</h3>
                    <div className="space-y-2">
                      {bonusTiers.map((t, i) => (
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
              <div className="rounded-xl p-4 text-sm text-center" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
                Nenhuma meta configurada para {vendedor} em {MESES[mes-1]} {ano}. Configure em Configuração.
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

            {/* Modo direto */}
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
                        placeholder="0,00"
                        className="flex-1 outline-none text-sm font-medium"
                        style={{ color: '#0a1628' }}
                        onFocus={(e) => e.target.select()} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>
                      Recebimentos do mês
                    </label>
                    <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid #e2e8f0' }}>
                      <span className="text-sm" style={{ color: '#94a3b8' }}>R$</span>
                      <input type="text" value={recebimentos} onChange={(e) => setRecebimentos(e.target.value)}
                        placeholder="0,00"
                        className="flex-1 outline-none text-sm font-medium"
                        style={{ color: '#0a1628' }}
                        onFocus={(e) => e.target.select()} />
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
                    {/* KPIs */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="rounded-xl p-4 text-center" style={{ background: resultado.meta_atingida ? '#f0fdf4' : '#fff1f2', border: `1px solid ${resultado.meta_atingida ? '#bbf7d0' : '#fecdd3'}` }}>
                        <TrendingUp size={18} className="mx-auto mb-2" style={{ color: resultado.meta_atingida ? '#16a34a' : '#dc2626' }} />
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>Meta PA</p>
                        <p className="text-sm font-bold mt-1" style={{ color: resultado.meta_atingida ? '#16a34a' : '#dc2626' }}>
                          {resultado.meta_atingida?.label ?? 'Não atingida'}
                        </p>
                        {resultado.meta_atingida && (
                          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{resultado.meta_atingida.percentual}% × recebimentos</p>
                        )}
                      </div>

                      <div className="rounded-xl p-4 text-center" style={{ background: resultado.bonus_desbloqueado ? '#f0fdf4' : '#f8fafc', border: `1px solid ${resultado.bonus_desbloqueado ? '#bbf7d0' : '#e2e8f0'}` }}>
                        <Award size={18} className="mx-auto mb-2" style={{ color: resultado.bonus_desbloqueado ? '#16a34a' : '#94a3b8' }} />
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>Bônus</p>
                        <p className="text-sm font-bold mt-1" style={{ color: resultado.bonus_desbloqueado ? '#16a34a' : '#94a3b8' }}>
                          {resultado.bonus_tier?.label ?? (resultado.bonus_desbloqueado ? 'Nenhum tier' : 'Não desbloqueado')}
                        </p>
                        {resultado.bonus_tier && (
                          <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>{resultado.bonus_tier.percentual}% × vendas PA</p>
                        )}
                      </div>

                      <div className="rounded-xl p-4 text-center" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <DollarSign size={18} className="mx-auto mb-2" style={{ color: '#1e40af' }} />
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>Total a Receber</p>
                        <p className="text-lg font-bold mt-1" style={{ color: '#00205C' }}>{formatBRL(resultado.comissao_total)}</p>
                      </div>
                    </div>

                    {/* Detalhamento */}
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
                          Comissão Bônus
                          {resultado.bonus_tier
                            ? ` (${resultado.bonus_tier.percentual}% × valor PA)`
                            : ' (não desbloqueado)'}
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

            {/* Modo reverso */}
            {modoReverso && (
              <div className="rounded-xl p-5 space-y-5" style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}>
                <h3 className="text-sm font-bold" style={{ color: '#00205C' }}>
                  <TrendingUp size={15} className="inline mr-2" />
                  Quanto preciso vender?
                </h3>
                <p className="text-xs" style={{ color: '#64748b' }}>
                  Informe a comissão total que deseja receber. O simulador mostra quanto você precisa vender em PA e quanto precisa receber para cada meta.
                </p>

                <div className="max-w-xs flex flex-col gap-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide" style={{ color: '#64748b' }}>
                    Comissão desejada
                  </label>
                  <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ border: '1px solid #e2e8f0' }}>
                    <span className="text-sm" style={{ color: '#94a3b8' }}>R$</span>
                    <input type="text" value={comissaoDesejada}
                      onChange={(e) => { setComissaoDesejada(e.target.value); setReversoCalculado(false); }}
                      placeholder="0,00"
                      className="flex-1 outline-none text-sm font-medium" style={{ color: '#0a1628' }}
                      onFocus={(e) => e.target.select()} />
                  </div>
                </div>

                <button
                  onClick={() => setReversoCalculado(true)}
                  disabled={!comissaoDesejada}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold disabled:opacity-40"
                  style={{ background: '#00205C', color: '#FFD700' }}>
                  <Calculator size={15} /> Calcular
                </button>

                {metasVisiveis.length > 0 && reversoCalculado && reversoResultado && (
                  <div className="space-y-3">
                    <p className="text-xs font-bold uppercase tracking-wide" style={{ color: '#64748b' }}>
                      O que você precisa por meta:
                    </p>
                    {reversoResultado.map((r, i) => {
                      const colors = {
                        bg: ['#eff6ff','#f0fdf4','#fffbeb'][i],
                        border: ['#bfdbfe','#bbf7d0','#fde68a'][i],
                        text: ['#1e40af','#065f46','#92400e'][i],
                        badge: ['#dbeafe','#d1fae5','#fef3c7'][i],
                      };
                      return (
                        <div key={i} className="rounded-xl p-4 space-y-3" style={{ background: colors.bg, border: `1px solid ${colors.border}` }}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-bold" style={{ color: colors.text }}>{r.label}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: colors.badge, color: colors.text }}>
                              {r.pct}% sobre recebimentos
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="rounded-lg p-3" style={{ background: '#ffffff80' }}>
                              <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>Vendas PA mínimas</p>
                              <p className="text-lg font-bold" style={{ color: colors.text }}>{formatBRL(r.paMinimo)}</p>
                              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>threshold para ativar a meta</p>
                            </div>
                            <div className="rounded-lg p-3" style={{ background: '#ffffff80' }}>
                              <p className="text-xs font-medium mb-1" style={{ color: '#64748b' }}>Recebimentos necessários</p>
                              <p className="text-lg font-bold" style={{ color: colors.text }}>{formatBRL(r.recNecessario)}</p>
                              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>para comissão de {formatBRL(parseFloat(comissaoDesejada.replace(/\./g,'').replace(',','.')) || 0)}</p>
                            </div>
                          </div>
                          {r.recComBonus !== null && r.bonusTierUsado && (
                            <div className="rounded-lg p-3 flex items-start gap-3" style={{ background: '#f0fdf480', border: '1px solid #bbf7d0' }}>
                              <Award size={14} className="mt-0.5 shrink-0" style={{ color: '#16a34a' }} />
                              <div className="text-xs" style={{ color: '#065f46' }}>
                                <span className="font-semibold">Com {r.bonusTierUsado.label} ({r.bonusTierUsado.pct}% bônus):</span>
                                {' '}precisa de apenas <span className="font-bold">{formatBRL(r.recComBonus)}</span> em recebimentos
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
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
