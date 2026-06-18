'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { formatBRL } from '@/lib/format';
import { Save, Plus, CheckCircle, AlertCircle } from 'lucide-react';

interface ComissaoConfig {
  id?: number;
  setor: string;
  percentual: number;
  meta_mensal: number;
  ativo: boolean;
}

export default function ConfiguracaoPage() {
  const [setores, setSetores] = useState<string[]>([]);
  const [configs, setConfigs] = useState<ComissaoConfig[]>([]);
  const [editados, setEditados] = useState<Record<string, ComissaoConfig>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [novoSetor, setNovoSetor] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/filtros').then((r) => r.json()),
      fetch('/api/comissao').then((r) => r.json()),
    ]).then(([filtros, comissoes]) => {
      setSetores(filtros.setores || []);
      const configMap: Record<string, ComissaoConfig> = {};
      (comissoes as ComissaoConfig[]).forEach((c) => {
        configMap[c.setor] = c;
      });
      setConfigs(comissoes);
      setEditados(configMap);
      setLoading(false);
    });
  }, []);

  const getConfig = (setor: string): ComissaoConfig =>
    editados[setor] || { setor, percentual: 0, meta_mensal: 0, ativo: true };

  const updateField = (setor: string, field: keyof ComissaoConfig, value: number | boolean) => {
    setEditados((prev) => ({
      ...prev,
      [setor]: { ...getConfig(setor), [field]: value },
    }));
    setSaved((prev) => ({ ...prev, [setor]: false }));
  };

  const salvar = async (setor: string) => {
    setSaving((prev) => ({ ...prev, [setor]: true }));
    try {
      const config = getConfig(setor);
      await fetch('/api/comissao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      setSaved((prev) => ({ ...prev, [setor]: true }));
      setTimeout(() => setSaved((prev) => ({ ...prev, [setor]: false })), 3000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving((prev) => ({ ...prev, [setor]: false }));
    }
  };

  const adicionarSetor = () => {
    if (!novoSetor.trim() || setores.includes(novoSetor)) return;
    setSetores((prev) => [...prev, novoSetor]);
    setNovoSetor('');
  };

  const setoresComConfig = setores.filter((s) => editados[s]);
  const setoresSemConfig = setores.filter((s) => !editados[s]);

  return (
    <AppShell>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#00205C' }}>
            Configuração de Comissões
          </h1>
          <p className="text-sm" style={{ color: '#64748b' }}>
            Defina as taxas e metas por setor de venda
          </p>
        </div>

        {/* Info Banner */}
        <div
          className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: '#0a1628', border: '1px solid #1a3a6e' }}
        >
          <AlertCircle size={18} style={{ color: '#FFD700' }} className="shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-white">Como funciona</p>
            <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
              Configure o percentual de comissão e a meta mensal para cada setor.
              Os valores serão usados nas telas do Vendedor e Gestor para calcular
              comissões estimadas e atingimento de metas.
            </p>
          </div>
        </div>

        {/* Adicionar setor manual */}
        <div
          className="rounded-xl p-5 shadow-sm"
          style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
        >
          <h2 className="text-sm font-semibold mb-3" style={{ color: '#00205C' }}>
            Adicionar Setor Personalizado
          </h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={novoSetor}
              onChange={(e) => setNovoSetor(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && adicionarSetor()}
              placeholder="Nome do setor..."
              className="flex-1 rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: '1px solid #e2e8f0', color: '#00205C' }}
            />
            <button
              onClick={adicionarSetor}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
              style={{ background: '#00205C', color: '#FFD700' }}
            >
              <Plus size={15} />
              Adicionar
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12" style={{ color: '#94a3b8' }}>
            Carregando configurações...
          </div>
        ) : (
          <>
            {/* Setores COM configuração */}
            {setoresComConfig.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Setores configurados ({setoresComConfig.length})
                </h2>
                {setoresComConfig.map((setor) => {
                  const cfg = getConfig(setor);
                  return (
                    <SetorRow
                      key={setor}
                      setor={setor}
                      config={cfg}
                      saving={!!saving[setor]}
                      saved={!!saved[setor]}
                      onChange={(field, value) => updateField(setor, field, value)}
                      onSave={() => salvar(setor)}
                    />
                  );
                })}
              </div>
            )}

            {/* Setores SEM configuração */}
            {setoresSemConfig.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#64748b' }}>
                  Setores sem configuração ({setoresSemConfig.length})
                </h2>
                {setoresSemConfig.map((setor) => {
                  const cfg = getConfig(setor);
                  return (
                    <SetorRow
                      key={setor}
                      setor={setor}
                      config={cfg}
                      saving={!!saving[setor]}
                      saved={!!saved[setor]}
                      onChange={(field, value) => updateField(setor, field, value)}
                      onSave={() => salvar(setor)}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

function SetorRow({
  setor, config, saving, saved, onChange, onSave,
}: {
  setor: string;
  config: ComissaoConfig;
  saving: boolean;
  saved: boolean;
  onChange: (field: keyof ComissaoConfig, value: number | boolean) => void;
  onSave: () => void;
}) {
  const comissaoExemplo = config.meta_mensal > 0
    ? (config.meta_mensal * config.percentual) / 100
    : null;

  return (
    <div
      className="rounded-xl p-4 shadow-sm"
      style={{
        background: '#ffffff',
        border: `1px solid ${saved ? '#16a34a' : '#e2e8f0'}`,
        transition: 'border-color 0.3s',
      }}
    >
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div
            className="rounded-lg px-3 py-1"
            style={{ background: '#f0f4f8' }}
          >
            <p className="text-sm font-semibold" style={{ color: '#00205C' }}>{setor}</p>
          </div>
          {comissaoExemplo && (
            <p className="text-xs" style={{ color: '#64748b' }}>
              → comissão na meta: <span className="font-semibold" style={{ color: '#16a34a' }}>{formatBRL(comissaoExemplo)}</span>
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Toggle ativo */}
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => onChange('ativo', !config.ativo)}
              className="relative rounded-full transition-colors cursor-pointer"
              style={{
                width: 36,
                height: 20,
                background: config.ativo ? '#00205C' : '#e2e8f0',
              }}
            >
              <div
                className="absolute top-1 rounded-full transition-all"
                style={{
                  width: 12,
                  height: 12,
                  background: '#ffffff',
                  left: config.ativo ? 20 : 4,
                }}
              />
            </div>
            <span className="text-xs" style={{ color: '#64748b' }}>
              {config.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </label>

          {/* % comissão */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium" style={{ color: '#64748b' }}>
              % Comissão:
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={config.percentual}
              onChange={(e) => onChange('percentual', parseFloat(e.target.value) || 0)}
              className="w-16 rounded-lg px-2 py-1.5 text-sm text-center outline-none font-semibold"
              style={{ border: '1px solid #e2e8f0', color: '#00205C' }}
            />
            <span className="text-sm" style={{ color: '#64748b' }}>%</span>
          </div>

          {/* Meta mensal */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs font-medium" style={{ color: '#64748b' }}>
              Meta mensal:
            </label>
            <span className="text-sm" style={{ color: '#64748b' }}>R$</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={config.meta_mensal}
              onChange={(e) => onChange('meta_mensal', parseFloat(e.target.value) || 0)}
              className="w-28 rounded-lg px-2 py-1.5 text-sm text-right outline-none"
              style={{ border: '1px solid #e2e8f0', color: '#00205C' }}
            />
          </div>

          {/* Salvar */}
          <button
            onClick={onSave}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all"
            style={{
              background: saved ? '#16a34a' : saving ? '#94a3b8' : '#00205C',
              color: saved ? '#ffffff' : '#FFD700',
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saved ? (
              <><CheckCircle size={14} /> Salvo</>
            ) : (
              <><Save size={14} /> {saving ? 'Salvando...' : 'Salvar'}</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
