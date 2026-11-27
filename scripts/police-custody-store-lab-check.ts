import {strict as assert} from 'node:assert';
import {readCustody,transitionCustody,type CustodyStorage} from '../src/game/policeCustodyStoreLab';
class Memory implements CustodyStorage {
 data=new Map<string,string>(); failRead=false;failWrite=false;
 getItem(k:string){if(this.failRead)throw Error('unavailable');return this.data.get(k)??null;}
 setItem(k:string,v:string){if(this.failWrite)throw Error('quota');this.data.set(k,v);}
}
const s=new Memory(), key='solo-custody', id='arrest-request-00000001';
const arrest={type:'arrest' as const,custodyId:id,stationId:7,wanted:3,policePresent:true,stopped:true,now:1000};
assert.deepEqual(readCustody(s,key),{ok:true,state:{phase:'free'}});
assert(transitionCustody(s,key,arrest).ok);
assert.equal((readCustody(s,key) as any).state.phase,'transport');
s.failWrite=true;
assert.deepEqual(transitionCustody(s,key,{type:'arrive',custodyId:id,stationId:7,now:5000}),{ok:false,error:'write_failed'});
s.failWrite=false;assert.equal((readCustody(s,key) as any).state.phase,'transport');
assert(transitionCustody(s,key,{type:'arrive',custodyId:id,stationId:7,now:5000}).ok);
// A fresh adapter reads the same persisted record after restart.
assert.equal((readCustody(s,key) as any).state.releaseAt,65000);
assert(!transitionCustody(s,key,{type:'release',custodyId:id,now:64999}).ok);
assert(transitionCustody(s,key,{type:'release',custodyId:id,now:65000}).ok);
assert.deepEqual((readCustody(s,key) as any).state,{phase:'free'});
for(const raw of ['{','null','{}',JSON.stringify({version:2,state:{phase:'free'}}),JSON.stringify({version:1,state:{phase:'jailed',custodyId:id,stationId:7,arrivedAt:5000,releaseAt:5001}})]){
 s.data.set(key,raw);assert.deepEqual(readCustody(s,key),{ok:false,error:'invalid_record'});
 assert.deepEqual(transitionCustody(s,key,arrest),{ok:false,error:'invalid_record'});assert.equal(s.data.get(key),raw);
}
s.failRead=true;assert.deepEqual(readCustody(s,key),{ok:false,error:'read_failed'});
assert.deepEqual(transitionCustody(s,key,arrest),{ok:false,error:'read_failed'});
console.log('✓ прототип сохранения: перезапуск, граница срока, ошибки чтения/записи и повреждённая запись');
