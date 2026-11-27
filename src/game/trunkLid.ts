import * as THREE from 'three';
import type { VSpec } from './data';
import { trunkMotionKind, trunkMotionPose, type TrunkMotionKind } from './trunkAnimation';

/** Experimental standalone lid. Not attached to existing vehicle bodies: their
 * rear panels still need to be split before this can be displayed in game. */
export interface TrunkLidPrototype {
  group: THREE.Group;
  kind: TrunkMotionKind;
  setElapsed(seconds: number): void;
  dispose(): void;
}
export function createTrunkLidPrototype(spec: VSpec, color: string): TrunkLidPrototype | null {
  const kind = trunkMotionKind(spec.body, spec.variant);
  if (!kind) return null;
  const group = new THREE.Group();
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = new THREE.MeshLambertMaterial({color});
  const lid = new THREE.Mesh(geometry, material);
  const width = spec.wid * 0.76;
  if (kind === 'hinged') {
    const depth = spec.len * 0.22;
    group.position.set(0, spec.hei * 0.53, -spec.len * 0.29);
    lid.scale.set(width, 0.07, depth);
    lid.position.z = -depth / 2;
  } else {
    const height = spec.hei * 0.55;
    group.position.set(0, spec.hei * 0.25, -spec.len * 0.5);
    lid.scale.set(width, height, 0.07);
    lid.position.y = height / 2;
  }
  group.add(lid);
  return {
    group, kind,
    setElapsed(seconds) {
      const pose = trunkMotionPose(kind, seconds);
      if (kind === 'hinged') group.rotation.x = pose.lidAngle;
      else lid.position.y = spec.hei * 0.55 * (0.5 + pose.lidLift);
    },
    dispose() { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
}
