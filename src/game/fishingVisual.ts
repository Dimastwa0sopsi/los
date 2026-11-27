import type {Character} from './character';
/** Cosmetic only: a remote player's flag does not prove a catch or inventory. */
export function applyFishingVisual(character: Character, fishing: boolean) {
  if (!fishing) return;
  character.shR.rotation.x = -1.05;
  character.elR.rotation.x = -0.35;
}
