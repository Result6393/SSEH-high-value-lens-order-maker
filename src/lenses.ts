// Toric IOL families the order form is used for. The spherical power comes
// from the matching monofocal table on the IOLMaster printout; the toric model
// (cylinder) comes from the toric calculator, so the user picks it.

export type Platform = 'ZCU' | 'CNA0T' | 'Other';

export interface LensFamily {
  label: string;
  company: string;
  models: string[];
}

export const FAMILIES: Record<Exclude<Platform, 'Other'>, LensFamily> = {
  ZCU: {
    label: 'Tecnis ZCU',
    company: 'J&J',
    models: ['ZCU100', 'ZCU150', 'ZCU225', 'ZCU300', 'ZCU375', 'ZCU450', 'ZCU525', 'ZCU600'],
  },
  CNA0T: {
    label: 'Clareon CNA0T',
    company: 'Alcon',
    models: ['CNA0T2', 'CNA0T3', 'CNA0T4', 'CNA0T5', 'CNA0T6', 'CNA0T7', 'CNA0T8', 'CNA0T9'],
  },
};

/** "+22.0D" style, as written on orders. */
export function formatPower(power: string): string {
  const n = Number(power);
  if (!power.trim() || Number.isNaN(n)) return power.trim();
  return `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(1)}D`;
}

/** Powers come in 0.5 D steps (ties go to the higher, more myopic power). */
export function roundToHalf(power: number): number {
  return Math.floor(power * 2 + 0.5) / 2;
}
