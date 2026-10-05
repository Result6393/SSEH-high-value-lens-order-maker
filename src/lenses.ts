// Toric IOL families the order form is used for. The spherical power comes
// from the matching monofocal table on the IOLMaster printout; the toric model
// (cylinder) comes from the toric calculator, so the user picks it.

import type { Eye } from './types';

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

const CYLINDERS = [1, 1.5, 2.25, 3, 3.75, 4.5, 5.25, 6];

/** Toric model for a cylinder at the IOL plane: ZCU300 / CNA0T5 for 3.00 D. */
export function modelForCylinder(platform: Exclude<Platform, 'Other'>, cyl: number): string | undefined {
  const i = CYLINDERS.indexOf(cyl);
  if (i < 0) return undefined;
  return platform === 'ZCU' ? `ZCU${String(Math.round(cyl * 100)).padStart(3, '0')}` : `CNA0T${i + 2}`;
}

/**
 * The operative eye when the printout makes it obvious: the only eye with lens
 * tables, else the only eye with astigmatism at or above the toric threshold.
 */
export function inferEye(
  tableEyes: Eye[],
  astK: Partial<Record<Eye, { power: string }>>,
  threshold: number,
): { eye: Eye; reason: string } | undefined {
  if (tableEyes.length === 1) return { eye: tableEyes[0], reason: 'the lens tables are for that eye only' };
  const high = (['Right', 'Left'] as Eye[]).filter((e) => Math.abs(Number(astK[e]?.power)) >= threshold);
  if (high.length === 1) return { eye: high[0], reason: `only that eye has Ast. K of ${threshold.toFixed(2)} D or more` };
  return undefined;
}
