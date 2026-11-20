// Полиция Лос-Города: как в GTA V — полицейский видит игрока только в своём
// секторе обзора и только если между ними нет стены. Всё остальное (розыск,
// «заметили ли преступление», погоня по последней известной точке) строится на
// этом одном правиле.
import type { Collision } from './collision';

/** источник обзора: пеший полицейский или патрульная машина */
export interface Eye {
  x: number; z: number; y: number;
  /** куда смотрит, радианы (0 — на +Z, как у машин и персонажей) */
  yaw: number;
  /** дальность обзора, м */
  range: number;
  /** половина угла обзора, радианы */
  half: number;
  /** ближе этого радиуса полицейский замечает в любую сторону (боковое зрение) */
  close: number;
}

export const POLICE_EYE: Omit<Eye, 'x' | 'z' | 'y' | 'yaw'> = { range: 70, half: Math.PI / 3, close: 9 };
export const PED_EYE: Omit<Eye, 'x' | 'z' | 'y' | 'yaw'> = { range: 34, half: Math.PI / 3.2, close: 6 };

/** угол между направлением взгляда и целью, в радианах (0..π) */
function relAngle(eye: Eye, tx: number, tz: number) {
  const dx = tx - eye.x, dz = tz - eye.z;
  const want = Math.atan2(dx, dz);
  let d = want - eye.yaw;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/**
 * Видит ли глаз точку: дальность, сектор, и линия взгляда не упирается в стену.
 * Укрытие за углом действительно ломает обзор — в этом весь смысл.
 */
export function eyeSees(col: Collision, eye: Eye, tx: number, tz: number, targetEyeY = 1.2): boolean {
  const dx = tx - eye.x, dz = tz - eye.z;
  const dist = Math.hypot(dx, dz);
  if (dist > eye.range) return false;
  if (dist > eye.close && relAngle(eye, tx, tz) > eye.half) return false;
  if (dist < 0.4) return true;
  const len = dist;
  const hit = col.ray(eye.x, eye.y, eye.z, dx / len, (targetEyeY - eye.y) / len, dz / len, len);
  return hit >= len - 0.6;      // стена ближе цели — не видит
}

/** Маска затрудняет распознавание пешего разыскиваемого, но не скрывает его вблизи. */
export function recognitionEye(eye: Eye, maskedOnFoot: boolean): Eye {
  return maskedOnFoot ? { ...eye, range: eye.range * 0.35, close: Math.min(eye.close, 5) } : eye;
}
