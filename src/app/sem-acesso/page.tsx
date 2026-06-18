export default function SemAcessoPage() {
  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: '#f0f4f8' }}
    >
      <div
        className="rounded-2xl p-10 text-center shadow-sm max-w-sm w-full"
        style={{ background: '#ffffff', border: '1px solid #e2e8f0' }}
      >
        <div
          className="mx-auto mb-6 flex items-center justify-center rounded-full"
          style={{ width: 64, height: 64, background: '#0a1628' }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#FFD700" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="text-xl font-bold mb-2" style={{ color: '#00205C' }}>
          Acesso Restrito
        </h1>
        <p className="text-sm" style={{ color: '#64748b' }}>
          Você não tem permissão para acessar este painel.
          Entre em contato com o administrador do sistema.
        </p>
      </div>
    </div>
  );
}
