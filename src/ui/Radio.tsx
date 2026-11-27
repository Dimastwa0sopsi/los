import {useEffect, useState} from 'react';
import type {Game} from '../game/game';
import type {RadioStation} from '../game/radio';
import {normalizeRadioFavorites, RADIO_FAVORITES_KEY, RADIO_FAVORITES_LIMIT} from '../game/radioFavorites';

function loadFavorites():RadioStation[]{
  try{return normalizeRadioFavorites(JSON.parse(localStorage.getItem(RADIO_FAVORITES_KEY) || '[]'));}catch{return [];}
}
export function RadioPanel({g,close,listenOnly=false}:{g:Game;close:()=>void;listenOnly?:boolean}) {
  const radio=g.radio;
  const [url,setUrl]=useState('');
  const [vol,setVol]=useState(Math.round(radio.volume*100));
  const [insideVol,setInsideVol]=useState(Math.round(radio.insideVolume*100));
  const [favorites,setFavorites]=useState<RadioStation[]>(loadFavorites);
  const [message,setMessage]=useState('');
  const [,tick]=useState(0);
  useEffect(()=>{radio.onChange=()=>tick(x=>x+1);document.body.classList.add('radio-panel-open');return()=>{radio.onChange=null;document.body.classList.remove('radio-panel-open');};},[radio]);
  const st=radio.state();
  const persist=(next:RadioStation[])=>{
    try{localStorage.setItem(RADIO_FAVORITES_KEY,JSON.stringify(next));setFavorites(next);setMessage('');}
    catch{setMessage('Не удалось сохранить песни на этом устройстве');}
  };
  const toggleFavorite=(s:RadioStation)=>{
    if(favorites.some(f=>f.url===s.url)){persist(favorites.filter(f=>f.url!==s.url));return;}
    if(favorites.length>=RADIO_FAVORITES_LIMIT){setMessage('Можно сохранить не больше 20 песен');return;}
    const slug=s.url.split('/').filter(Boolean).pop() || 'SoundCloud';
    persist(normalizeRadioFavorites([...favorites,{...s,name:s.name==='SoundCloud'?slug.replace(/[-_]/g,' '):s.name}]));
  };
  const playFavorite=(s:RadioStation)=>{radio.list=[...favorites];if(radio.station?.url===s.url&&radio.playing)radio.pause();else if(radio.station?.url===s.url)radio.resume();else radio.play(s);};
  const stop=(e:React.KeyboardEvent)=>e.stopPropagation();
  return <div className="rd-back" onPointerDown={e=>e.stopPropagation()}><div className="rd">
    <div className="rd-top"><b>🎵 Музыка</b><span className={`rd-dot ${st.playing?'on':''}`}/><span className="rd-now">{listenOnly?'Радио рядом':st.station?.name || 'трек не выбран'}</span><button className="rd-x" onClick={close} aria-label="Закрыть">✕</button></div>
    <div className="rd-widget-space">Плеер SoundCloud появится здесь</div>
    <div className="rd-content">
      {listenOnly ? <p className="rd-foot">Здесь видны плееры музыки рядом. Если звук не начался, нажмите ▶ в плеере. Включить свою музыку можно в машине или на домашнем компьютере.</p> : <>
        <div className="rd-ctl"><button className="ui-btn sm" onClick={()=>radio.next(-1)}>⏮</button><button className="ui-btn sm main" onClick={()=>radio.toggle()}>{st.playing?'⏸':'▶'}</button><button className="ui-btn sm" onClick={()=>radio.next(1)}>⏭</button><button className="ui-btn sm ghost" onClick={()=>radio.stop()}>■</button><button className="ui-btn sm" disabled={!st.station} onClick={()=>st.station&&toggleFavorite(st.station)}>{st.station&&favorites.some(f=>f.url===st.station!.url)?'❤️ В избранном':'🤍 В избранное'}</button></div>
        <label className="rd-volume"><span>🔊 Снаружи</span><input className="rd-vol" type="range" min={0} max={100} value={vol} onKeyDown={stop} onChange={e=>{const v=+e.target.value;setVol(v);radio.setVolume(v/100);}}/><span>{vol}%</span></label>
        <label className="rd-volume"><span>🚗 Внутри</span><input className="rd-vol" type="range" min={0} max={100} value={insideVol} onKeyDown={stop} onChange={e=>{const v=+e.target.value;setInsideVol(v);radio.setInsideVolume(v/100);}}/><span>{insideVol}%</span></label>
        <div className="rd-search"><input className="ui-input" value={url} placeholder="Ссылка на трек SoundCloud" onKeyDown={stop} onChange={e=>setUrl(e.target.value)} onKeyUp={e=>{if(e.key==='Enter')radio.playUrl(url);}}/><button className="ui-btn" onClick={()=>radio.playUrl(url)}>Включить</button></div>
        {st.error&&<p className="rd-err">{st.error}</p>}{message&&<p className="rd-err">{message}</p>}
        <div className="rd-list"><div className="rd-cap">❤️ Любимые песни · {favorites.length}/{RADIO_FAVORITES_LIMIT}</div>
          {favorites.map(s=><div key={s.url} className={`rd-row ${st.station?.url===s.url?'on':''}`}><button className="rd-play" onClick={()=>playFavorite(s)}>{st.station?.url===s.url&&st.playing?'⏸':'▶'}</button><div className="rd-meta" onClick={()=>playFavorite(s)}><b>{s.name}</b><small>SoundCloud</small></div><button className="rd-star on" aria-label="Удалить из любимых" onClick={()=>toggleFavorite(s)}>❤️</button></div>)}
          {!favorites.length&&<p className="rd-foot">Включите песню по ссылке и нажмите «В избранное».</p>}
        </div>
        <p className="rd-foot">Любимые песни хранятся на этом устройстве. В машине без сабвуфера максимальная громкость — 70%, с сабвуфером — 100%. Если звука нет, нажмите ▶ в плеере SoundCloud.</p>
        {g.online&&!g.net?.radioSupported&&<p className="rd-err">Для музыки другим игрокам нужно обновить и перезапустить сервер Colab.</p>}
      </>}
    </div>
  </div></div>;
}
