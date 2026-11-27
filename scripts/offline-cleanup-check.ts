import {strict as assert} from 'node:assert';
import {wipeOfflineSaves} from '../src/game/offlineSaveCleanup';
class Store {
 data=new Map<string,string>();fail='';
 get length(){return this.data.size;}
 key(i:number){return [...this.data.keys()][i]??null;}
 removeItem(k:string){if(k===this.fail)throw Error('denied');this.data.delete(k);}
}
const s=new Store();
for(const key of ['losgorod_save','losgorod_save_owner','losgorod_save_acc_alice','losgorod_save_acc_bob','losgorod_save_online','losgorod_save_online_alice','losgorod_accounts','losgorod_account','losgorod_save_future','settings'])s.data.set(key,key);
assert.deepEqual(wipeOfflineSaves(s),{ok:true,removed:4});
assert.deepEqual([...s.data.keys()],['losgorod_save_online','losgorod_save_online_alice','losgorod_accounts','losgorod_account','losgorod_save_future','settings']);
s.data.set('losgorod_save','x');s.fail='losgorod_save';assert.deepEqual(wipeOfflineSaves(s),{ok:false,removed:0});assert(s.data.has('losgorod_save_online_alice'));
assert.deepEqual(wipeOfflineSaves({get length(){throw Error('denied')},key:()=>null,removeItem:()=>{}}),{ok:false,removed:0});
console.log('✓ удаляются только одиночные сейвы; онлайн, аккаунты и настройки не затронуты; ошибки сообщаются');
