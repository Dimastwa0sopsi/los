import {soundCloudUrl} from './radioSpatial';
import type {RadioStation} from './radio';
export const RADIO_FAVORITES_LIMIT=20;
export const RADIO_FAVORITES_KEY='losgorod_radio_fav';
export function normalizeRadioFavorites(input:unknown):RadioStation[] {
  if(!Array.isArray(input))return [];
  const out:RadioStation[]=[], seen=new Set<string>();
  for(const item of input){
    if(!item || typeof item.url!=='string')continue;
    const url=soundCloudUrl(item.url);if(!url||seen.has(url))continue;
    const name=typeof item.name==='string'&&item.name.trim()?item.name.trim().slice(0,80):url.split('/').slice(-1)[0];
    seen.add(url);out.push({id:'custom-'+url,name,url});
    if(out.length===RADIO_FAVORITES_LIMIT)break;
  }
  return out;
}
