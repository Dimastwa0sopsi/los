import './domstub';
import {strict as assert} from 'node:assert';
import {NetClient} from '../src/game/net';
class FakeSocket {
 static OPEN=1;static all:FakeSocket[]=[];
 readyState=0;onopen:(()=>void)|null=null;onclose:(()=>void)|null=null;onmessage:((e:{data:string})=>void)|null=null;onerror:(()=>void)|null=null;sent:any[]=[];
 constructor(_url:string){FakeSocket.all.push(this);}
 send(raw:string){this.sent.push(JSON.parse(raw));}
 close(){this.readyState=3;}
 open(){this.readyState=1;this.onopen?.();}
 message(data:any){this.onmessage?.({data:JSON.stringify(data)});}
}
(globalThis as any).WebSocket=FakeSocket;(globalThis as any).window=globalThis;
const client=new NetClient('Tester','m','ws://test',{mode:'login',password:'test-password-123'});
let logins=0;client.onLogin=()=>{logins++;};client.connect();const old=FakeSocket.all[0];
client.retryLogin();const active=FakeSocket.all[1];
old.open();assert.equal(client.ready,false);assert.equal(client.status,'connecting');
old.message({type:'hello',accounts:1});assert.equal(active.sent.length,0,'старый сокет не должен запускать авторизацию нового');
active.open();active.message({type:'hello',accounts:1});assert.equal(active.sent.length,1);
old.message({type:'login_success',caps:{accounts:1},accountRevision:7,accountState:{money:1},player:{id:99}});
assert.equal(logins,0);assert.equal(client.sessionReady,false);
active.message({type:'login_success',caps:{accounts:1,saveIds:1},accountRevision:3,accountState:{money:5},player:{id:1}});
assert.equal(logins,1);assert.equal(client.accountRevision,3);assert(client.sessionReady);
old.message({type:'error',code:'banned',text:'устаревшая ошибка'});assert(client.sessionReady);
old.onclose?.();assert(client.sessionReady);
client.close();
const rejected=new NetClient('Tester','m','ws://test',{mode:'login',password:'test-password-123'});let spawn=0;
rejected.onLogin=()=>rejected.close();rejected.onHamsterSpawn=()=>spawn++;
rejected.saveAccount({money:99});rejected.connect();const socket=FakeSocket.all[2];socket.open();socket.message({type:'hello',accounts:1});
socket.message({type:'login_success',caps:{accounts:1},accountRevision:4,accountState:{bad:true},player:{id:1}});
assert.equal(spawn,0);assert.equal(socket.sent.filter(m=>m.type==='account_save').length,0,'отклонённый снимок не запускает очередь сохранений');
console.log('✓ заменённый сокет игнорируется; отклонённый снимок не запускает сохранение');
