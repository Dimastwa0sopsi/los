/* Spatial radio helpers. Remote audio is untrusted: callers must validate server events and must not
 * fetch arbitrary links, bypass autoplay, or proxy SoundCloud audio. */
export type RadioPlace = { kind: 'vehicle'; x: number; z: number; vehicleId: string }
  | { kind: 'computer'; x: number; z: number; exteriorX: number; exteriorZ: number; buildingId: number };
export type RadioListener = { x: number; z: number; buildingId: number | null; vehicleId: string | null };
export const RADIO_RADIUS = 40;
/** Normal car stereo outputs at 70%; the installed subwoofer unlocks full output. */
export function carRadioVolume(volume:number, subwoofer:boolean):number {
  return Number.isFinite(volume) ? Math.max(0,Math.min(1,volume)) * (subwoofer ? 1 : 0.7) : 0;
}

/** The source slider affects the outside; the local inside slider is separate. */
export function radioGain(source: RadioPlace, listener: RadioListener, outsideVolume: number, insideVolume: number): number {
  if (![source.x, source.z, listener.x, listener.z, outsideVolume, insideVolume].every(Number.isFinite)) return 0;
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  if (source.kind === 'vehicle') {
    if (listener.vehicleId && listener.vehicleId === source.vehicleId) return clamp(insideVolume);
    if (listener.buildingId !== null) return 0;
  } else {
    if (!Number.isSafeInteger(source.buildingId) || !Number.isFinite(source.exteriorX) || !Number.isFinite(source.exteriorZ)) return 0;
    if (listener.buildingId !== null && listener.buildingId !== source.buildingId) return 0;
  }
  const x = source.kind === 'computer' && listener.buildingId === null ? source.exteriorX : source.x;
  const z = source.kind === 'computer' && listener.buildingId === null ? source.exteriorZ : source.z;
  const distance = Math.hypot(listener.x - x, listener.z - z);
  const attenuation = Math.max(0, 1 - distance / RADIO_RADIUS);
  const volume = source.kind === 'computer' && listener.buildingId === source.buildingId ? insideVolume : outsideVolume;
  return clamp(volume) * attenuation * attenuation;
}

/** Public SoundCloud track or playlist only; never accept an arbitrary iframe URL. */
export function soundCloudUrl(raw: string): string | null {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw.trim()); } catch { return null; }
  if (url.protocol !== 'https:' || !['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com'].includes(url.hostname.toLowerCase()) || url.username || url.password || url.port) return null;
  // Private links contain a secret token; do not relay it to other players.
  if (url.searchParams.has('secret_token')) return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (!(parts.length === 2 || (parts.length === 3 && parts[1] === 'sets'))) return null;
  if (parts.some(p => !/^[a-zA-Z0-9_-]{1,100}$/.test(p))) return null;
  if (['discover','search','stream','you','upload','pages'].includes(parts[0].toLowerCase())) return null;
  return `https://soundcloud.com/${parts.join('/')}`;
}

/** Official embed, not a SoundCloud page placed in an audio element. */
export function soundCloudEmbed(raw: string): string | null {
  const url = soundCloudUrl(raw);
  if (!url) return null;
  const params = new URLSearchParams({url, auto_play:'false', show_artwork:'true', single_active:'false'});
  return `https://w.soundcloud.com/player/?${params.toString()}`;
}
