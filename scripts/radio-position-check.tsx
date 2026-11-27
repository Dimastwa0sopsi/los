import './domstub';
import {strict as assert} from 'node:assert';
import React from 'react';
import TestRenderer,{act} from 'react-test-renderer';
import {RadioPanel} from '../src/ui/Radio';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
async function main(){
 const vars:Record<string,string>={}; const classes=new Set<string>(); const listeners=new Map<string,Function>();
 (globalThis as any).document.documentElement={style:{setProperty:(k:string,v:string)=>{vars[k]=v;}}};
 (globalThis as any).document.body.classList={add:(s:string)=>classes.add(s),remove:(s:string)=>classes.delete(s)};
 (globalThis as any).window.addEventListener=(type:string,fn:Function)=>listeners.set(type,fn);
 (globalThis as any).window.removeEventListener=(type:string)=>listeners.delete(type);
 let rect={left:100,top:200,width:300,height:100};
 const g:any={radio:{volume:1,insideVolume:1,state:()=>({playing:false,station:null})},online:false};
 let view!:TestRenderer.ReactTestRenderer;
 await act(async()=>{view=TestRenderer.create(<RadioPanel g={g} close={()=>{}} embedded/>,{createNodeMock:()=>({getBoundingClientRect:()=>rect})});});
 assert(classes.has('radio-panel-open'));assert.equal(vars['--sc-left'],'100px');assert.equal(vars['--sc-top'],'200px');assert.equal(vars['--sc-width'],'300px');
 rect={left:10,top:20,width:250,height:86};listeners.get('scroll')!();assert.equal(vars['--sc-top'],'20px');assert.equal(vars['--sc-height'],'86px');
 await act(async()=>view.unmount());assert(!classes.has('radio-panel-open'));assert.equal(g.radio.onChange,null);assert.equal(listeners.size,0);
 console.log('✓ плеер привязан к месту внутри окна: размеры, прокрутка, очистка обработчиков');
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
