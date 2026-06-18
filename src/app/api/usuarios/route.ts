import { NextRequest, NextResponse } from 'next/server';
import { getPool, sql } from '@/lib/db';
import { getUsuario, ensureUsuarioTable } from '@/lib/permissions';

async function requireADM(req: NextRequest) {
  const email = req.headers.get('x-user-email');
  if (!email) return null;
  const usuario = await getUsuario(email);
  return usuario?.cargo === 'ADM' ? usuario : null;
}

export async function GET(req: NextRequest) {
  const adm = await requireADM(req);
  if (!adm) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  await ensureUsuarioTable();
  const pool = await getPool();
  const result = await pool
    .request()
    .query('SELECT * FROM UsuarioPermissao ORDER BY nome');

  return NextResponse.json(
    result.recordset.map((row) => ({
      id: row.id,
      email: row.email,
      nome: row.nome,
      cargo: row.cargo,
      setores: row.setores ? JSON.parse(row.setores) : [],
      nome_vendedor: row.nome_vendedor,
      ativo: Boolean(row.ativo),
      criado_em: row.criado_em,
    }))
  );
}

export async function POST(req: NextRequest) {
  const adm = await requireADM(req);
  if (!adm) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  await ensureUsuarioTable();
  const body = await req.json();
  const pool = await getPool();

  const setoresJson =
    Array.isArray(body.setores) && body.setores.length
      ? JSON.stringify(body.setores)
      : null;

  const existing = await pool
    .request()
    .input('email', sql.VarChar, body.email.toLowerCase())
    .query('SELECT id FROM UsuarioPermissao WHERE email = @email');

  if (existing.recordset.length > 0) {
    await pool
      .request()
      .input('email', sql.VarChar, body.email.toLowerCase())
      .input('nome', sql.VarChar, body.nome)
      .input('cargo', sql.VarChar, body.cargo)
      .input('setores', sql.VarChar, setoresJson)
      .input('nome_vendedor', sql.VarChar, body.nome_vendedor || null)
      .input('ativo', sql.Bit, body.ativo ? 1 : 0)
      .query(`
        UPDATE UsuarioPermissao
        SET nome = @nome, cargo = @cargo, setores = @setores,
            nome_vendedor = @nome_vendedor, ativo = @ativo,
            atualizado_em = GETDATE()
        WHERE email = @email
      `);
  } else {
    await pool
      .request()
      .input('email', sql.VarChar, body.email.toLowerCase())
      .input('nome', sql.VarChar, body.nome)
      .input('cargo', sql.VarChar, body.cargo)
      .input('setores', sql.VarChar, setoresJson)
      .input('nome_vendedor', sql.VarChar, body.nome_vendedor || null)
      .input('ativo', sql.Bit, body.ativo ? 1 : 0)
      .query(`
        INSERT INTO UsuarioPermissao (email, nome, cargo, setores, nome_vendedor, ativo)
        VALUES (@email, @nome, @cargo, @setores, @nome_vendedor, @ativo)
      `);
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const adm = await requireADM(req);
  if (!adm) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'ID obrigatório' }, { status: 400 });

  // Impede deletar a si mesmo
  const pool = await getPool();
  const target = await pool
    .request()
    .input('id', sql.Int, parseInt(id))
    .query('SELECT email FROM UsuarioPermissao WHERE id = @id');

  if (target.recordset[0]?.email === adm.email) {
    return NextResponse.json({ error: 'Você não pode remover sua própria conta' }, { status: 400 });
  }

  await pool
    .request()
    .input('id', sql.Int, parseInt(id))
    .query('DELETE FROM UsuarioPermissao WHERE id = @id');

  return NextResponse.json({ success: true });
}
