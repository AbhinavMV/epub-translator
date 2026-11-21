export interface Project {
  id: string;
  name: string;
  createdAt: string;
}

export interface VolumeOrdered {
  volumeNumber?: number | null;
  createdAt: string;
}

export function unnumberedVolumeNumber(existing: readonly (number | null)[]): number {
  const numbers = existing.filter((n): n is number => n !== null);
  if (!numbers.includes(1)) return 1;
  return Math.floor(Math.max(...numbers)) + 1;
}

export function compareVolumes(a: VolumeOrdered, b: VolumeOrdered): number {
  const av = a.volumeNumber ?? Number.POSITIVE_INFINITY;
  const bv = b.volumeNumber ?? Number.POSITIVE_INFINITY;
  if (av !== bv) return av < bv ? -1 : 1;
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
}
