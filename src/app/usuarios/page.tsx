'use client';

import { useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import { useUser } from '@/components/providers/UserProvider';
import { useRouter } from 'next/navigation';
import { ShieldCheck, Plus, Pencil, Trash2, X, Check } from 'lucide-react';
import type { UsuarioPermissao, Cargo } from '@/types/index';

const CARGOS: { value: Cargo; label: string; desc: string }[] = [
  { value: 'ADM',      label: 'Administrador', desc: 'Acesso total ao sistema e configurações' },
  { value: 'GESTOR',   label: 'Gestor',        desc: 'Visualiza apenas seus setores e vendedores' },
  { value: 'VENDEDOR', label: 'Vendedor',      desc: 'Visualiza apenas suas próprias vendas' },
];

const CARGO_CORES: Record<Cargo, { bg: string; text: string }> = {
  ADM:      { bg: '#fef3c7', text: '#92400e' },
  GESTOR:   { bg: '#d1fae5', text: '#065f46' },
  VENDEDOR: { bg: '#f3f4f6', text: '#374151' },
};

interface FormState {
  email: string;
  nome: string;
  cargo: Cargo;
  setores: string[];
  nome_vendedor: string;
  ativo: boolean;
}

const FORM_VAZIO: FormState = {
  email: '', nome: '', cargo: 'VENDEDOR', setores: [], nome_vendedor: '', ativo: true,
};

export default function UsuariosPage() {
  const usuario = useUser();
  const router = useRouter();

  const [usuarios, setUsuarios] = useState<UsuarioPermissao[]>([]);
  const [setoresDisponiveis, setSetoresDisponiveis] = useState<string[]>([]);
  const [vendedoresDisponiveis, setVendedoresDisponiveis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editando, setEditando] = useState<UsuarioPermissao | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VAZIO);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (usuario && usuario !== 'loading' && usuario.cargo !== 'ADM') {
      router.push('/sem-acesso');
    }
  }, [usuario, router]);

  useEffect(() => {
    if (usuario && usuario !== 'loading' && usuario.cargo === 'ADM') {
      carregarDados();
      fetch('/api/filtros')
        .then((r) => r.json())
        .then((d) => {
          setSetoresDisponiveis(d.setores || []);
          setVendedoresDisponiveis(d.vendedores || []);
        });
    }
  }, [usuario]);

  async function carregarDados() {
    setLoading(true);
    try {
      const r = await fetch('/api/usuarios');
      const data = await r.json();
      setUsuarios(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }

  function abrirNovo() {
    setEditando(null);
    setForm(FORM_VAZIO);
    setErro('');
    setModal(true);
  }

  function abrirEditar(u: UsuarioPermissao) {
    setEditando(u);
    setForm({
      email: u.email,
      nome: u.nome,
      cargo: u.cargo,
      setores: u.setores,
      nome_vendedor: u.nome_vendedor || '',
      ativo: u.ativo,
    });
    setErro('');
    setModal(true);
  }

  async function salvar() {
    if (!form.email || !form.nome) { setErro('Email e nome são obrigatórios.'); return; }
    if (form.cargo === 'GESTOR' && form.setores.length === 0) {
      setErro('Selecione ao menos um setor para o Gestor.'); return;
    }
    if (form.cargo === 'VENDEDOR' && !form.nome_vendedor) {
      setErro('Selecione o nome do vendedor.'); return;
    }
    setSalvando(true);
    setErro('');
    try {
      const r = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          nome_vendedor: form.cargo === 'VENDEDOR' ? form.nome_vendedor : null,
          setores: form.cargo === 'GESTOR' ? form.setores : [],
        }),
      });
      if (!r.ok) { const d = await r.json(); setErro(d.error || 'Erro ao salvar.'); return; }
      setModal(false);
      await carregarDados();
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(id: number) {
    if (!confirm('Remover este usuário?')) return;
    const r = await fetch(`/api/usuarios?id=${id}`, { method: 'DELETE' });
    if (!r.ok) { const d = await r.json(); alert(d.error || 'Erro ao remover.'); return; }
    await carregarDados();
  }

  function toggleSetor(setor: string) {
    setForm((f) => ({
      ...f,
      setores: f.setores.includes(setor)
        ? f.setores.filter((s) => s !== setor)
        : [...f.setores, setor],
    }));
  }

  if (usuario === 'loading') return null;

  return (
    <AppShell loading={loading}>
      <div className="p-6 space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: '#00205C' }}>
              <ShieldCheck size={24} />
              Gerenciar Usuários
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#64748b' }}>
              Atribua cargos e permissões de acesso ao painel
            </p>
          </div>
          <button
            onClick={abrirNovo}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
            style={{ background: '#FFD700', color: '#00205C' }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.opacity = '0.85')}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.opacity = '1')}
          >
            <Plus size={16} />
            Novo Usuário
          </button>
        </div>

        {/* Legenda de cargos */}
        <div className="grid grid-cols-4 gap-3">
          {CARGOS.map((c) => (
            <div
              key={c.value}
              className="rounded-xl p-4"
              style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
            >
              <span
                className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold mb-1"
                style={{ background: CARGO_CORES[c.value].bg, color: CARGO_CORES[c.value].text }}
              >
                {c.label}
              </span>
              <p className="text-xs" style={{ color: '#64748b' }}>{c.desc}</p>
            </div>
          ))}
        </div>

        {/* Tabela */}
        <div
          className="rounded-xl shadow-sm overflow-hidden"
          style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
        >
          <div className="px-5 py-4" style={{ borderBottom: '1px solid #e2e8f0' }}>
            <h2 className="text-sm font-semibold" style={{ color: '#00205C' }}>
              Usuários cadastrados ({usuarios.length})
            </h2>
          </div>
          {loading ? (
            <div className="p-8 text-center text-sm" style={{ color: '#94a3b8' }}>Carregando...</div>
          ) : usuarios.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: '#94a3b8' }}>
              Nenhum usuário cadastrado.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Nome', 'Email', 'Cargo', 'Setores / Vendedor', 'Status', 'Ações'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold" style={{ color: '#64748b' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {usuarios.map((u) => (
                  <tr
                    key={u.id}
                    style={{ borderTop: '1px solid #f1f5f9' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = '#f8fafc')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = '')}
                  >
                    <td className="px-4 py-3 font-medium" style={{ color: '#0a1628' }}>{u.nome}</td>
                    <td className="px-4 py-3" style={{ color: '#64748b' }}>{u.email}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                        style={{ background: CARGO_CORES[u.cargo].bg, color: CARGO_CORES[u.cargo].text }}
                      >
                        {CARGOS.find((c) => c.value === u.cargo)?.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: '#64748b' }}>
                      {u.cargo === 'GESTOR' && u.setores.length > 0
                        ? u.setores.join(', ')
                        : u.cargo === 'VENDEDOR' && u.nome_vendedor
                        ? u.nome_vendedor
                        : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
                        style={{ background: u.ativo ? '#d1fae5' : '#fee2e2', color: u.ativo ? '#065f46' : '#991b1b' }}
                      >
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => abrirEditar(u)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#64748b' }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#00205C')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          onClick={() => excluir(u.id)}
                          className="p-1.5 rounded-lg transition-colors"
                          style={{ color: '#64748b' }}
                          onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#dc2626')}
                          onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#64748b')}
                          title="Remover"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
            style={{ background: '#ffffff' }}
          >
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: '1px solid #e2e8f0' }}
            >
              <h2 className="text-base font-semibold" style={{ color: '#00205C' }}>
                {editando ? 'Editar Usuário' : 'Novo Usuário'}
              </h2>
              <button onClick={() => setModal(false)} style={{ color: '#64748b' }}>
                <X size={20} />
              </button>
            </div>

            <div className="px-6 py-5 space-y-4">
              {erro && (
                <div className="rounded-lg px-4 py-3 text-sm" style={{ background: '#fee2e2', color: '#991b1b' }}>
                  {erro}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>
                    Email *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    disabled={!!editando}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #e2e8f0', color: '#0a1628', background: editando ? '#f8fafc' : '#fff' }}
                    placeholder="usuario@dovale.com.br"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>
                    Nome *
                  </label>
                  <input
                    type="text"
                    value={form.nome}
                    onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #e2e8f0', color: '#0a1628' }}
                    placeholder="Nome completo"
                  />
                </div>
              </div>

              {/* Cargo */}
              <div>
                <label className="block text-xs font-semibold mb-2" style={{ color: '#64748b' }}>
                  Cargo *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {CARGOS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setForm((f) => ({ ...f, cargo: c.value, setores: [], nome_vendedor: '' }))}
                      className="text-left rounded-xl px-4 py-3 border-2 transition-all"
                      style={{
                        borderColor: form.cargo === c.value ? '#00205C' : '#e2e8f0',
                        background: form.cargo === c.value ? '#f0f4ff' : '#ffffff',
                      }}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-sm font-semibold" style={{ color: '#00205C' }}>{c.label}</span>
                        {form.cargo === c.value && <Check size={14} style={{ color: '#00205C' }} />}
                      </div>
                      <p className="text-xs" style={{ color: '#64748b' }}>{c.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Setores (GESTOR) */}
              {form.cargo === 'GESTOR' && (
                <div>
                  <label className="block text-xs font-semibold mb-2" style={{ color: '#64748b' }}>
                    Setores do Gestor *
                  </label>
                  {setoresDisponiveis.length === 0 ? (
                    <p className="text-xs" style={{ color: '#94a3b8' }}>Carregando setores...</p>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                      {setoresDisponiveis.map((s) => (
                        <button
                          key={s}
                          onClick={() => toggleSetor(s)}
                          className="rounded-full px-3 py-1 text-xs font-medium transition-all"
                          style={{
                            background: form.setores.includes(s) ? '#00205C' : '#f1f5f9',
                            color: form.setores.includes(s) ? '#FFD700' : '#64748b',
                            border: '1px solid',
                            borderColor: form.setores.includes(s) ? '#00205C' : '#e2e8f0',
                          }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                  {form.setores.length > 0 && (
                    <p className="text-xs mt-1" style={{ color: '#64748b' }}>
                      {form.setores.length} setor(es) selecionado(s)
                    </p>
                  )}
                </div>
              )}

              {/* Vendedor */}
              {form.cargo === 'VENDEDOR' && (
                <div>
                  <label className="block text-xs font-semibold mb-1" style={{ color: '#64748b' }}>
                    Nome do Vendedor no Sistema *
                  </label>
                  <select
                    value={form.nome_vendedor}
                    onChange={(e) => setForm((f) => ({ ...f, nome_vendedor: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm"
                    style={{ border: '1px solid #e2e8f0', color: '#0a1628' }}
                  >
                    <option value="">Selecione o vendedor...</option>
                    {vendedoresDisponiveis.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
                    Nome exato como aparece nas vendas
                  </p>
                </div>
              )}

              {/* Status */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm((f) => ({ ...f, ativo: !f.ativo }))}
                  className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  style={{ background: form.ativo ? '#00205C' : '#e2e8f0' }}
                >
                  <span
                    className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                    style={{ transform: form.ativo ? 'translateX(22px)' : 'translateX(2px)' }}
                  />
                </button>
                <span className="text-sm" style={{ color: '#64748b' }}>
                  {form.ativo ? 'Usuário ativo' : 'Usuário inativo'}
                </span>
              </div>
            </div>

            <div
              className="flex justify-end gap-3 px-6 py-4"
              style={{ borderTop: '1px solid #e2e8f0' }}
            >
              <button
                onClick={() => setModal(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: '#f1f5f9', color: '#64748b' }}
              >
                Cancelar
              </button>
              <button
                onClick={salvar}
                disabled={salvando}
                className="px-5 py-2 rounded-lg text-sm font-semibold transition-all"
                style={{ background: '#FFD700', color: '#00205C', opacity: salvando ? 0.7 : 1 }}
              >
                {salvando ? 'Salvando...' : editando ? 'Salvar Alterações' : 'Criar Usuário'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
