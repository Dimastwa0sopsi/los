import './domstub';
import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {InventoryGrid} from '../src/ui/InventoryGrid';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
const text=(n:any):string=>typeof n==='string'?n:!n?'':Array.isArray(n)?n.map(text).join(' '):text(n.children);
(async()=>{
 let called=''; const state:any={inventory:{},ammoBy:{},look:{gender:'m',top:'',bottom:''},plateInventory:[{number:'А123ВС 77',front:true,back:false}],vehicles:[{uid:'mine',type:'lada'}]};
 const g:any={online:false,getState:()=>state,homeFridge:()=>null,wardrobe:()=>[],installLocalPlate:(n:string,id:string)=>{called=n+id;}};
 let view!:TestRenderer.ReactTestRenderer; await act(async()=>{view=TestRenderer.create(<InventoryGrid g={g}/>);});
 const rendered=text(view.toJSON()); if(!rendered.includes('А123ВС 77') || !/задняя:\s+нет/.test(rendered)) throw Error('номер не показан в инвентаре');
 const install=view.root.findAllByType('button').find(b=>text(b.children).includes('Установить:')); if(!install || install.props.disabled)throw Error('нет установки');
 await act(async()=>install.props.onClick()); if(called!=='А123ВС 77mine')throw Error('не передана машина');
 g.online=true;await act(async()=>view.update(<InventoryGrid g={g}/>));if(!view.root.findAllByType('button').find(b=>text(b.children).includes('Установить:'))?.props.disabled)throw Error('установка в онлайне не отключена');
 await act(async()=>view.unmount()); console.log('✓ инвентарь: номер, состояние табличек, установка и блокировка онлайн');
})().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
