import { useState } from 'react';
import { microphoneError } from '../game/voice';

/** Request only in a direct user gesture; checking permission never leaves a mic open. */
export function MicrophonePermission() {
  const [busy,setBusy]=useState(false), [message,setMessage]=useState('');
  const request=async()=>{
    if(busy)return;
    if(!navigator.mediaDevices?.getUserMedia){setMessage('Микрофон недоступен: откройте игру по HTTPS и проверьте разрешения браузера.');return;}
    setBusy(true);setMessage('');
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      stream.getTracks().forEach(t=>t.stop());
      setMessage('Доступ разрешён. Для разговора нажмите O пешком или кнопку микрофона.');
    } catch(e){setMessage(microphoneError(e));}
    finally{setBusy(false);}
  };
  return <div><button type="button" className="lg-btn" disabled={busy} onClick={()=>void request()}>{busy?'Ожидание разрешения…':'Запросить доступ к микрофону'}</button><p className="text-xs opacity-70" aria-live="polite">{message || 'После отказа нажмите ещё раз; при постоянной блокировке разрешите микрофон в настройках сайта браузера.'}</p></div>;
}
