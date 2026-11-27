'use strict';
// Temporary session state only; the server never downloads or relays audio.
const TTL = 12000, LIMIT = 128;
function trackUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null;
  let u; try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== 'https:' || !['soundcloud.com','www.soundcloud.com','m.soundcloud.com'].includes(u.hostname.toLowerCase()) || u.username || u.password || u.port || u.searchParams.has('secret_token')) return null;
  const p = u.pathname.split('/').filter(Boolean);
  if (!(p.length === 2 || (p.length === 3 && p[1] === 'sets')) || p.some(x => !/^[a-zA-Z0-9_-]{1,100}$/.test(x)) || ['discover','search','stream','you','upload','pages'].includes(p[0].toLowerCase())) return null;
  return 'https://soundcloud.com/' + p.join('/');
}
function createRadioRegistry() {
  const entries = new Map();
  function prune(now) { for (const [id, e] of entries) if (now - e.updatedAt > TTL) entries.delete(id); }
  return {
    update(id, m, now=Date.now()) {
      if (!Number.isSafeInteger(id) || id < 1 || !m || typeof m !== 'object') return false;
      if (m.stop === true) { entries.delete(id); return true; }
      const url=trackUrl(m.url);
      if (!url || !['vehicle','computer'].includes(m.kind) || ![m.x,m.z,m.position,m.outside,m.inside].every(Number.isFinite) || Math.abs(m.x)>100000 || Math.abs(m.z)>100000 || m.position<0 || m.position>86400000 || m.outside<0 || m.outside>1 || m.inside<0 || m.inside>1 || typeof m.playing !== 'boolean') return false;
      if (m.kind==='computer' && (!Number.isSafeInteger(m.buildingId) || m.buildingId<0 || !Number.isFinite(m.exteriorX) || !Number.isFinite(m.exteriorZ) || Math.abs(m.exteriorX)>100000 || Math.abs(m.exteriorZ)>100000)) return false;
      prune(now); if (!entries.has(id) && entries.size >= LIMIT) return false;
      entries.set(id,{owner:id,kind:m.kind,url,x:m.x,z:m.z,buildingId:m.kind==='computer'?m.buildingId:null,exteriorX:m.kind==='computer'?m.exteriorX:m.x,exteriorZ:m.kind==='computer'?m.exteriorZ:m.z,position:Math.round(m.position),outside:m.outside,inside:m.inside,playing:m.playing,updatedAt:now});
      return true;
    },
    remove(id) { entries.delete(id); },
    snapshot(now=Date.now()) { prune(now); return [...entries.values()].map(e=>({...e,position:Math.min(86400000,e.position+(e.playing?Math.max(0,now-e.updatedAt):0))})); },
  };
}
module.exports={createRadioRegistry,trackUrl,TTL};
