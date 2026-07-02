import { calcularComissaoFerragens, type FerrMetaConfig, type ComissaoFerragens } from './commission-ferragens';

export type DistMetaConfig = FerrMetaConfig;
export type ComissaoDistribuidores = ComissaoFerragens;

// Distribuidores: mesma lógica do Ferragens (meta sobre total vendido, comissão % sobre recebido),
// sem bônus por faixa e sem meta de grupo.
export function calcularComissaoDistribuidores(
  vendas_total: number,
  recebido: number,
  meta: DistMetaConfig | null,
): ComissaoDistribuidores {
  return calcularComissaoFerragens(vendas_total, recebido, meta, null, 0, null);
}

export function isDistribuidores(setor: string): boolean {
  return setor?.toUpperCase() === 'DISTRIBUIDORES';
}
