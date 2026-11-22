'use strict';
/* Disposable interactive auction demonstration. NOT a game server. It has
 * public demo accounts, no real authentication and a test-only time skip.
 * Never connect this script to the live Drive database. */
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const Database=require('better-sqlite3');
const {createAccountStore}=require('./account-store.cjs');
const {createBusinessStore}=require('./business-store.cjs');
const {createAuctionGatewayLab}=require('./auction-gateway-lab.cjs');
const {DURATION}=require('./auction-store.cjs');
const auctionCatalogue=require('./auction-catalogue.json'),businessCatalogue=require('./business-catalogue.json');
const gas=businessCatalogue.businesses.find(b=>b.kind==='gas').id;
const house=Object.entries(auctionCatalogue.housing).find(([,kind])=>kind==='house')[0];
const apartment=Object.entries(auctionCatalogue.housing).find(([,kind])=>kind==='apartment')[0];
const car=auctionCatalogue.vehicles.includes('lada')?'lada':auctionCatalogue.vehicles[0];
const actors=['seller','alice','bob'];
const folder=path.resolve(__dirname,'../.check');fs.mkdirSync(folder,{recursive:true});
// Fixed isolated path, never configurable via arguments or environment.
const db=new Database(path.join(folder,'auction-demo.sqlite'));db.pragma('journal_mode = WAL');
const accounts=createAccountStore(db);
createBusinessStore(db,{[gas]:{price:10000,items:{water:2}}});
const gateway=createAuctionGatewayLab(db,accounts,auctionCatalogue,()=>{},null,businessCatalogue);
const html=fs.readFileSync(path.join(__dirname,'auction-demo.html'));
let server;
const initialState=name=>({money:200000,inventory:{},vehicles:name==='seller'?[{uid:'demo-car',type:car,pos:null,tuning:{}}]:[],kiosks:[],properties:name==='seller'?[house,apartment]:[],fridges:{},health:100});
const reset=db.transaction(()=>{
 // Only the fixed throwaway demo database; no path is accepted from a client.
 db.exec('DELETE FROM auction_lots; DELETE FROM auction_requests; DELETE FROM economy_operation_receipts; DELETE FROM economy_operation_cancellations; DELETE FROM business_deliveries; DELETE FROM business_requests; DELETE FROM business_registry; DELETE FROM account_revisions;');
 const update=db.prepare('UPDATE accounts SET state_json=?,revision=1,save_id=NULL WHERE login_key=?');
 for(const name of actors)if(update.run(JSON.stringify(initialState(name)),name).changes!==1)throw Error('demo account missing');
 db.prepare('INSERT INTO business_registry(business_id,owner,stock) VALUES (?,?,?)').run(gas,'seller',100);
});
async function init(){
 const count=db.prepare('SELECT count(*) AS n FROM accounts').get().n;
 if(count===0){
  for(const name of actors){
   const registered=await accounts.register(name,'demo-only-not-a-real-password');if(!registered.ok)throw Error('demo initialization failed');
   if(!accounts.save(name,initialState(name),0).ok)throw Error('demo initialization failed');
  }
  db.prepare('INSERT INTO business_registry(business_id,owner,stock) VALUES (?,?,?)').run(gas,'seller',100);
 } else if(count!==actors.length || actors.some(n=>!gateway.snapshot(n).ok)) throw Error('incompatible demo database');
}
function view(){
 const account={};for(const actor of actors){const s=gateway.snapshot(actor);if(!s.ok)throw Error('demo account state invalid');account[actor]={money:s.state.money,revision:s.revision,vehicles:s.state.vehicles,properties:s.state.properties};}
 const business=db.prepare('SELECT owner,stock FROM business_registry WHERE business_id=?').get(gas);
 const lots=gateway.publicLots(Date.now());
 const history=db.prepare("SELECT id,kind,asset_key AS assetKey,seller,status,bidder,bid FROM auction_lots WHERE status IN ('sold','unsold') ORDER BY id DESC LIMIT 15").all();
 return {account,business,gas,house,apartment,car,lots,history,serverTime:Date.now()};
}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
function finishDue(){for(const id of gateway.due(Date.now()))gateway.finish(id,Date.now());}
async function main(){
 await init();
 server=http.createServer((req,res)=>{
  if(req.method==='GET' && req.url==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(html);}
  if(req.method==='GET' && req.url==='/api/view'){try{finishDue();return send(res,200,{ok:true,...view()});}catch{return send(res,500,{ok:false,error:'internal'});}}
  if(req.method!=='POST' || req.url!=='/api/action')return send(res,404,{ok:false,error:'not_found'});
  // Browser actions must come from the same preview origin. No real identities.
  if(req.headers.origin && req.headers.origin!==`https://${req.headers.host}` && req.headers.origin!==`http://${req.headers.host}`)return send(res,403,{ok:false,error:'origin'});
  let body='',oversized=false;req.on('data',chunk=>{body+=chunk;if(body.length>4096){oversized=true;req.destroy();}});
  req.on('end',()=>{if(oversized)return;try{
   const m=JSON.parse(body);if(!m || typeof m!=='object'||!actors.includes(m.actor))return send(res,400,{ok:false,error:'invalid'});
   finishDue();let result;
   if(m.action==='reset_demo'){reset();result={ok:true};}
   else if(m.action==='finish_demo'){
    // Explicitly labelled test button; real lots keep their 10-minute timer.
    if(!Number.isSafeInteger(m.id) || m.id<=0)return send(res,400,{ok:false,error:'invalid'});
    result=gateway.finish(m.id,Date.now()+DURATION);
   }else if(m.action==='list'||m.action==='bid'){
    if(!Number.isSafeInteger(m.revision))return send(res,400,{ok:false,error:'invalid'});
    result=gateway.execute(m.actor,m.revision,randomUUID(),m.action,m.payload,Date.now());
   } else return send(res,400,{ok:false,error:'invalid'});
   return send(res,200,{...result,...view()});
  }catch{return send(res,500,{ok:false,error:'internal'});}});
 });
 const port=Number(process.env.PORT)||4173;
 server.listen(port,'0.0.0.0',()=>console.log(`Демонстрационный аукцион доступен на порту ${port}. Данные только в .check/auction-demo.sqlite`));
 setInterval(finishDue,1000).unref();
}
main().catch(e=>{console.error('Не удалось запустить демонстрацию:',e.message);process.exitCode=1;try{db.close();}catch{}});
