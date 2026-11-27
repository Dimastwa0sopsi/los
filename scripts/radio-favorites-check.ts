import {strict as assert} from 'node:assert';
import {normalizeRadioFavorites,RADIO_FAVORITES_LIMIT} from '../src/game/radioFavorites';
import {carRadioVolume} from '../src/game/radioSpatial';
const songs=Array.from({length:25},(_,i)=>({name:`song ${i}`,url:`https://soundcloud.com/artist/song-${i}?utm_source=share`}));
const result=normalizeRadioFavorites([{name:'invalid',url:'https://example.com/a/b'},...songs,songs[0]]);
assert.equal(result.length,RADIO_FAVORITES_LIMIT);assert.equal(result[0].url,'https://soundcloud.com/artist/song-0');
assert.equal(normalizeRadioFavorites([songs[0],songs[0]]).length,1);assert.deepEqual(normalizeRadioFavorites(null),[]);
assert.equal(carRadioVolume(1,false),0.7);assert.equal(carRadioVolume(1,true),1);assert.equal(carRadioVolume(.5,false),.35);assert.equal(carRadioVolume(NaN,true),0);
console.log('✓ любимые песни: допустимые ссылки, без дублей, максимум 20; громкость 70%/100%');
