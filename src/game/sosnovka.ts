/** Граница старого положения Сосновки и перенос на север в версии карты 0.6.7. */
export const SOSNOVKA_DZ = -40;
export function inOldSosnovka(x: number, z: number) {
  return x >= 275 && x <= 600 && z <= -110 && z >= -500;
}
