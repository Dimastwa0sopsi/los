'use strict';
// Uses a disposable database, local WebSockets and real authentication; never touches Drive.
const {spawn}=require('node:child_process');
const fs=require('node:fs'); const path=require('node:path'); const assert=require('node:assert/strict');
const WebSocket=require('ws');
const dir=fs.mkdtempSync(path.join(process.cwd(),'.check/radio-online-'));
const port=21000+Math.floor(Math.random()*20000);
const runtime=path.join(dir,'server');fs.cpSync(path.join(process.cwd(),'server'),runtime,{recursive:true});fs.writeFileSync(path.join(runtime,'package.json'),'{"type":"commonjs"}');
const server=spawn(process.execPath,[path.join(runtime,'server.js')],{cwd:runtime,env:{...process.env,PORT:String(port),DB_FILE:path.join(dir,'game.db'),ADMIN_TOKEN:'temporary-test-token',NODE_PATH:path.join(process.cwd(),'.check/node_modules')}});
server.stderr.on('data',b=>process.stderr.write(b));
function waitListening(){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('server startup timeout')),20000);server.stdout.on('data',b=>{if(String(b).includes('Los-Gorod server on')){clearTimeout(timer);resolve();}});server.on('exit',code=>{clearTimeout(timer);reject(Error('server exited '+code));});});}
function client(){const ws=new WebSocket('ws://127.0.0.1:'+port);const messages=[];ws.on('message',data=>{try{messages.push(JSON.parse(data));}catch{}});ws.find=async(type)=>{for(let i=0;i<150;i++){const idx=messages.findIndex(x=>x.type===type);if(idx>=0)return messages.splice(idx,1)[0];await new Promise(r=>setTimeout(r,20));}throw Error('missing '+type);};ws.sendObj=o=>ws.send(JSON.stringify(o));return ws;}
(async()=>{let a,b;
 try{
  await waitListening();a=client();b=client();await Promise.all([a.find('hello'),b.find('hello')]);
  a.sendObj({type:'login',name:'RadioTestA',mode:'register',password:'testpass-123456',gender:'m'});b.sendObj({type:'login',name:'RadioTestB',mode:'register',password:'testpass-123456',gender:'m'});
  const [one,two]=await Promise.all([a.find('login_success'),b.find('login_success')]);assert.equal(one.caps.radio,1);assert.equal(two.caps.radio,1);
  a.sendObj({type:'radio_update',radio:{kind:'vehicle',x:10,z:20,url:'https://soundcloud.com/rudikk/emoslut666-miniyubka?utm_source=share',position:1234,outside:.8,inside:.4,playing:true}});
  await new Promise(r=>setTimeout(r,100)); b.sendObj({type:'radio_list'});const list=await b.find('radio_list');assert.equal(list.radios.length,1);assert.equal(list.radios[0].owner,one.player.id);assert.equal(list.radios[0].url,'https://soundcloud.com/rudikk/emoslut666-miniyubka');assert(list.radios[0].position>=1234);
  await new Promise(r=>setTimeout(r,350));a.sendObj({type:'radio_update',radio:{kind:'vehicle',x:10,z:20,url:'https://example.com/not-soundcloud',position:0,outside:1,inside:1,playing:true}});
  await new Promise(r=>setTimeout(r,300));b.sendObj({type:'radio_list'});assert.equal((await b.find('radio_list')).radios[0].url,'https://soundcloud.com/rudikk/emoslut666-miniyubka');
  a.close();await new Promise(r=>setTimeout(r,650));b.sendObj({type:'radio_list'});assert.equal((await b.find('radio_list')).radios.length,0);
  console.log('✓ настоящий сервер: вход двух игроков, передача состояния радио и очистка при отключении');
 }finally{a?.terminate();b?.terminate();if(server.exitCode===null && server.signalCode===null){server.kill();await new Promise(r=>server.once('exit',r));}fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
