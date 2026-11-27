/** User-provided pictures in public/1. Paths stay relative to the game page,
 * including GitHub Pages project subpaths. Never accept arbitrary URLs here. */
export const MEME_PICTURES = [
  '076241546c2b17e5a2146b54ec7471ab.jpg',
  '3bad2ba07d36544f02cc493087e2e577.jpg',
  '660049b54bde4af91afb5295c3dbb656.jpg',
  '838ae0588626b5f247f64bb0338e638c.jpg',
  'c65be114ce99afe83cf7c7b1cff83358.jpg',
  'images.jpg',
  'images.png',
] as const;
export function memeIndex(seed: number) { return ((Math.floor(seed) % MEME_PICTURES.length) + MEME_PICTURES.length) % MEME_PICTURES.length; }
export function memeUrl(index: number) { return './1/' + MEME_PICTURES[memeIndex(index)]; }
export function memeSeed(value: string) { let h=0; for (const c of value) h=(Math.imul(h,31)+c.charCodeAt(0))>>>0; return h; }

/** A sparse, deterministic selection of wall posters; no collider or billboard
 * rental slot is added. Each poster sits to the side of an entrance. */
export function streetMeme(b: {id:number;kind:string;removed?:boolean;x:number;z:number;w:number;d:number;door:{a:number}}) {
  if (b.removed || !['house','vhouse','apartment','shop24','vshop','cafe','barber'].includes(b.kind) || b.id % 47 !== 7) return null;
  const a=b.door.a, nx=Math.sin(a), nz=Math.cos(a), alongX=Math.abs(nz)>0.5;
  const faceWidth=alongX?b.w:b.d;
  if (faceWidth < 6) return null;
  const offset=Math.min(faceWidth / 2 - 1, 3.0);
  const x=b.x + (alongX ? offset : nx*b.w/2), z=b.z + (alongX ? nz*b.d/2 : offset);
  return {x:x+nx*0.26,z:z+nz*0.26,a,index:memeIndex(Math.floor(b.id/47))};
}
