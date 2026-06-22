import { getPool, sql } from './db';

export type Cargo = 'ADM' | 'GESTOR' | 'VENDEDOR';

export interface Usuario {
  id: number;
  email: string;
  nome: string;
  cargo: Cargo;
  setores: string[];
  nome_vendedor: string | null;
  ativo: boolean;
}

let _tableReady = false;

export async function ensureUsuarioTable() {
  if (_tableReady) return;
  const pool = await getPool();
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='UsuarioPermissao' AND xtype='U')
    CREATE TABLE UsuarioPermissao (
      id INT IDENTITY(1,1) PRIMARY KEY,
      email VARCHAR(200) NOT NULL UNIQUE,
      nome VARCHAR(200) NOT NULL,
      cargo VARCHAR(20) NOT NULL CHECK (cargo IN ('ADM', 'GESTOR', 'VENDEDOR')),
      setores VARCHAR(2000) NULL,
      nome_vendedor VARCHAR(200) NULL,
      ativo BIT NOT NULL DEFAULT 1,
      criado_em DATETIME DEFAULT GETDATE(),
      atualizado_em DATETIME DEFAULT GETDATE()
    )
  `);
  _tableReady = true;
}

// Cache de usuário por 60 segundos — evita query ao banco em cada API call
const _usuarioCache = new Map<string, { usuario: Usuario | null; exp: number }>();

export async function getUsuario(email: string): Promise<Usuario | null> {
  const key = email.toLowerCase();
  const cached = _usuarioCache.get(key);
  if (cached && cached.exp > Date.now()) return cached.usuario;

  await ensureUsuarioTable();
  const pool = await getPool();

  const result = await pool
    .request()
    .input('email', sql.VarChar, email.toLowerCase())
    .query('SELECT * FROM UsuarioPermissao WHERE email = @email AND ativo = 1');

  if (!result.recordset.length) {
    // Se tabela vazia e é o primeiro acesso, auto-cria como ADM
    const count = await pool
      .request()
      .query('SELECT COUNT(*) as total FROM UsuarioPermissao');
    if (count.recordset[0].total === 0) {
      const nome = email.split('@')[0].replace('.', ' ');
      await pool
        .request()
        .input('email', sql.VarChar, email.toLowerCase())
        .input('nome', sql.VarChar, nome)
        .query(`
          INSERT INTO UsuarioPermissao (email, nome, cargo, ativo)
          VALUES (@email, @nome, 'ADM', 1)
        `);
      const adm: Usuario = { id: 1, email: email.toLowerCase(), nome, cargo: 'ADM', setores: [], nome_vendedor: null, ativo: true };
      _usuarioCache.set(key, { usuario: adm, exp: Date.now() + 60_000 });
      return adm;
    }
    _usuarioCache.set(key, { usuario: null, exp: Date.now() + 10_000 });
    return null;
  }

  const row = result.recordset[0];
  const usuario: Usuario = {
    id: row.id,
    email: row.email,
    nome: row.nome,
    cargo: row.cargo as Cargo,
    setores: row.setores ? JSON.parse(row.setores) : [],
    nome_vendedor: row.nome_vendedor,
    ativo: Boolean(row.ativo),
  };
  _usuarioCache.set(key, { usuario, exp: Date.now() + 60_000 });
  return usuario;
}

export function podeVerTudo(cargo: Cargo): boolean {
  return cargo === 'ADM';
}

export function isADM(cargo: Cargo): boolean {
  return cargo === 'ADM';
}

// Adds setor IN (...) filter to a mssql request object and returns updated WHERE clause
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSetorFilter(request: any, setores: string[], where: string): string {
  if (!setores.length) return where;
  const placeholders = setores
    .map((s, i) => {
      request.input(`setor_perm_${i}`, sql.VarChar, s);
      return `@setor_perm_${i}`;
    })
    .join(', ');
  return `${where} AND RVS_NOME IN (${placeholders})`;
}
