const KG_PER_LB = 0.45359237;

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/** Rounds a load to the nearest increment in the user's display unit (e.g. 5 lb), returning kg. */
export function roundLoadKg(kg: number, units: 'imperial' | 'metric', increment: number): number {
  if (increment <= 0) return kg;
  if (units === 'imperial') return lbToKg(Math.round(kgToLb(kg) / increment) * increment);
  return Math.round(kg / increment) * increment;
}

/** Epley estimated 1RM. Only meaningful for sets of 12 reps or fewer (spec 2.7). */
export function epley1RM(loadKg: number, reps: number): number | undefined {
  if (reps < 1 || reps > 12) return undefined;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}
