const KG_PER_LB = 0.45359237;

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

/** Epley estimated 1RM. Only meaningful for sets of 12 reps or fewer (spec 2.7). */
export function epley1RM(loadKg: number, reps: number): number | undefined {
  if (reps < 1 || reps > 12) return undefined;
  return reps === 1 ? loadKg : loadKg * (1 + reps / 30);
}
