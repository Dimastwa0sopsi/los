import './domstub';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {GamePanel} from '../src/ui/Panels';
import {defaultTuning} from '../src/game/data';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const text=(n:any):string=>typeof n==='string'?n:!n?'':Array.isArray(n)?n.map(text).join(' '):text(n.children);
(async()=>{
 const original=defaultTuning(), car:any={uid:'own',type:'lada',color:'#ffffff',tuning:{...original},condition:1,year:2026,mileage:0};
 const state:any={vehicles:[car],money:50000};let previews:any[]=[];let installs=0;
 const g:any={getState:()=>state,online:false,ownedVehicleNear:()=>({model:{missingParts:()=>[],missingWheels:()=>0}}),
  previewTuning:(_id:string,t:any)=>previews.push({...t}),revertTuning:()=>{},
  tuningCost:(_old:any,t:any)=>t.clearance!==original.clearance?500:0,
  applyTuning:(_id:string,t:any)=>{installs++;car.tuning={...t};return true;}};
 const panel:any={type:'tuning',uid:'own'},close=()=>{};
 let view!:TestRenderer.ReactTestRenderer;await act(async()=>{view=TestRenderer.create(<GamePanel g={g} panel={panel} close={close}/>)});
 const button=(label:string)=>view.root.findAllByType('button').find(b=>text(b.children)===label)!;
 let plus=button('+1');if(!plus)throw Error('нет выбора клиренса');
 // GameView frequently renders HUD updates between pointer down and up. The
 // same host button must survive that render, otherwise the click is lost.
 await act(async()=>view.update(<GamePanel g={g} panel={panel} close={()=>{}}/>));
 if(button('+1')!==plus)throw Error('кнопка пересоздана во время обновления HUD');
 await act(async()=>plus.props.onClick());
 if(!button('+1').props.className.includes('on') || previews.at(-1)?.clearance!==1)throw Error('одно нажатие не выбрало настройку');
 if(installs!==0 || state.money!==50000)throw Error('предпросмотр не должен оплачивать работу');
 plus=button('+1');await act(async()=>view.update(<GamePanel g={g} panel={panel} close={()=>{}}/>));
 if(button('+1')!==plus)throw Error('кнопка пересоздана после изменения');
 await act(async()=>button('Сброс').props.onClick());if(previews.at(-1)?.clearance!==original.clearance)throw Error('сброс');
 await act(async()=>button('+1').props.onClick());await act(async()=>button('Установить').props.onClick());
 if(installs!==1 || car.tuning.clearance!==1)throw Error('установка только по подтверждению');
 const lights=view.root.findAllByType('button').find(b=>text(b.children).includes('Фары и тонировка'))!;
 await act(async()=>lights.props.onClick());let tint=button('60%');if(!tint)throw Error('нет тонировки');
 await act(async()=>view.update(<GamePanel g={g} panel={panel} close={()=>{}}/>));if(button('60%')!==tint)throw Error('тонировка пересоздана');
 await act(async()=>tint.props.onClick());if(previews.at(-1)?.tint!==2)throw Error('одно нажатие тонировки');
 await act(async()=>view.unmount());console.log('✓ мастерская: кнопки сохраняются при обновлении HUD, выбор за одно нажатие, отдельное подтверждение установки');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
