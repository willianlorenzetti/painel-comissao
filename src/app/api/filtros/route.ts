import { NextResponse } from 'next/server';
import { getPool } from '@/lib/db';

export async function GET() {
  try {
    const pool = await getPool();

    const [vendedores, setores, empresas] = await Promise.all([
      pool.request().query(`
        SELECT DISTINCT USU_NOME as nome
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        WHERE USU_NOME IS NOT NULL
        ORDER BY USU_NOME
      `),
      pool.request().query(`
        SELECT DISTINCT RVS_NOME as nome
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        WHERE RVS_NOME IS NOT NULL
        ORDER BY RVS_NOME
      `),
      pool.request().query(`
        SELECT DISTINCT LTRIM(RTRIM(EMP)) as nome
        FROM [TI-COMERCIAL_45-VendaPorSetor]
        WHERE EMP IS NOT NULL
        ORDER BY LTRIM(RTRIM(EMP))
      `),
    ]);

    return NextResponse.json({
      vendedores: vendedores.recordset.map((r) => r.nome),
      setores: setores.recordset.map((r) => r.nome),
      empresas: empresas.recordset.map((r) => r.nome),
    });
  } catch (error) {
    console.error('Erro ao buscar filtros:', error);
    return NextResponse.json({ error: 'Erro ao buscar dados' }, { status: 500 });
  }
}
