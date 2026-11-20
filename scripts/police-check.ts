/* Поле зрения полиции (как в GTA V): сектор, дальность и стены.
 *   npm run check:police
 */
import { Collision } from '../src/game/collision';
import { eyeSees, recognitionEye, POLICE_EYE, PED_EYE } from '../src/game/police';

// пустая сцена
const open = new Collision([]);
// стена 12×0.6 между глазом (0,0) и целью (0,20)
const walled = new Collision([{ x0: -6, x1: 6, z0: 9.7, z1: 10.3, y0: 0, y1: 3 }]);

const eye = (yaw: number, over: Partial<typeof POLICE_EYE> = {}) => ({ x: 0, z: 0, y: 1.55, yaw, ...POLICE_EYE, ...over });
let fail = 0;
const t = (name: string, got: boolean, want: boolean) => {
  const ok = got === want;
  console.log(`  ${ok ? '✓' : '✗'} ${name}`);
  if (!ok) fail++;
};

// цель на +Z (yaw 0 смотрит на +Z)
t('видит прямо перед собой', eyeSees(open, eye(0), 0, 20), true);
t('не видит за спиной', eyeSees(open, eye(Math.PI), 0, 20), false);
t('видит под 50° вбок (в секторе)', eyeSees(open, eye(0.87), 0, 20), true);
t('не видит под 80° вбок', eyeSees(open, eye(1.4), 0, 20), false);
t('не видит дальше 70 м', eyeSees(open, eye(0), 0, 100), false);
t('вплотную замечает в любую сторону', eyeSees(open, eye(Math.PI), 0, 5), true);
t('стена перекрывает обзор', eyeSees(walled, eye(0), 0, 20), false);
t('стена не мешает вплотную', eyeSees(walled, eye(Math.PI), 0, 3), true);
t('пеший постовой не видит дальше 34 м', eyeSees(open, { x: 0, z: 0, y: 1.6, yaw: 0, ...PED_EYE }, 0, 45), false);
t('пеший видит на 30 м', eyeSees(open, { x: 0, z: 0, y: 1.6, yaw: 0, ...PED_EYE }, 0, 30), true);
t('маску не распознают издалека', eyeSees(open, recognitionEye(eye(0), true), 0, 30), false);
t('в маске распознают вблизи', eyeSees(open, recognitionEye(eye(0), true), 0, 4), true);
t('без маски дальность обычная', eyeSees(open, recognitionEye(eye(0), false), 0, 30), true);
t('маска не позволяет видеть через стены', eyeSees(walled, recognitionEye(eye(0), true), 0, 15), false);
// смещение вбок: не только ось Z
t('видит по диагонали', eyeSees(open, eye(Math.PI / 4), 15, 15), true);

console.log(fail ? `✗ провалов: ${fail}` : '✓ поле зрения полиции в порядке');
process.exit(fail ? 1 : 0);
