import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {handleOrders} from '../backend/orders-api.mjs';
import {validateCatalog} from '../backend/catalog-model.mjs';
import * as orderModel from '../docs/order-model.mjs';

const file=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const TEST_MASTER='senha-de-teste-para-exclusao';
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec(file('backend/schema.sql'));
  const db={prepare(sql){let args=[];return {
    bind(...v){args=v;return this},
    async first(){return sqlite.prepare(sql).get(...args)||null},
    async all(){return {results:sqlite.prepare(sql).all(...args)}},
    async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}}}
  }}};
  const fetch=async(url,options={})=>handleOrders(new Request(url,{...options,headers:{...options.headers,Origin:'https://devmiojo.github.io'}}),db,TEST_MASTER);
  const request=async(path,method='GET',body,room)=>{const response=await fetch('https://forja-encomendas.lannahechee.chatgpt.site'+path,{method,headers:{'Content-Type':'application/json',...(room?{'X-Workshop-Id':room.id,Authorization:'Bearer '+room.key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()}};
  return {request,fetch,sqlite,db};
}
const catalog={materials:[{id:'wood',name:'Lenha',vendor:'Alvor',price:5,stock:15},{id:'coal',name:'Carvão',vendor:'Forja',price:0,stock:20,pricingRecipeId:'charcoal'}],recipes:[{id:'charcoal',name:'Carvão',category:'Outros',output:1,extra:0,labourPct:15,markup:0,round:1,lines:[{materialId:'wood',name:'Lenha',vendor:'Alvor',qty:3,price:0}]},{id:'ingot',name:'Lingote',category:'Outros',output:1,extra:0,labourPct:10,markup:0,round:0,lines:[{materialId:'coal',name:'Carvão',vendor:'Forja',qty:2,price:0}]}]};
test('shared catalog persists, recalculates dependencies and guards concurrent writers',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Rosa'})).data;
  assert.equal((await request('/api/catalog','GET',null,room)).data.catalog,null);
  let first=await request('/api/catalog','POST',{actor:'Kai',catalog},room);assert.equal(first.status,200);assert.equal(first.data.catalog.materials[1].price,18);assert.equal(first.data.catalog.recipes[1].lines[0].price,18);
  const other=structuredClone(catalog);other.materials[0].price=99;
  const duplicate=await request('/api/catalog','POST',{actor:'Outro',catalog:other},room);assert.equal(duplicate.data.version,1);assert.equal(duplicate.data.catalog.materials[0].price,5);
  const next=structuredClone(first.data.catalog);next.materials[0].price=10;
  const writes=await Promise.all(['Kai','Eivor'].map(actor=>request('/api/catalog','PATCH',{version:1,actor,catalog:next},room)));
  assert.deepEqual(writes.map(w=>w.status).sort(),[200,409]);
  const saved=(await request('/api/catalog','GET',null,room)).data;assert.equal(saved.version,2);assert.equal(saved.catalog.materials[1].price,35);assert.equal(saved.catalog.recipes[1].lines[0].price,35);assert.ok(['Kai','Eivor'].includes(saved.updatedBy));assert.ok(saved.updatedAt);
});
test('catalog authorization, validation and price cycles never corrupt saved values',async()=>{
  const {request}=fixture(),a=(await request('/api/workshops','POST',{name:'A'})).data,b=(await request('/api/workshops','POST',{name:'B'})).data;
  await request('/api/catalog','POST',{actor:'Kai',catalog},a);
  assert.equal((await request('/api/catalog')).status,401);assert.equal((await request('/api/catalog','GET',null,{...a,key:'bad'})).status,401);assert.equal((await request('/api/catalog','GET',null,b)).data.catalog,null);
  const cycle=structuredClone(catalog);cycle.materials[0].pricingRecipeId='charcoal';
  const negative=structuredClone(catalog);negative.materials[0].price=-1;
  const duplicate=structuredClone(catalog);duplicate.recipes.push(duplicate.recipes[0]);
  for(const invalid of [cycle,negative,duplicate])assert.equal((await request('/api/catalog','PATCH',{version:1,actor:'Kai',catalog:invalid},a)).status,400);
  assert.equal((await request('/api/catalog','PATCH',{version:1,actor:'',catalog},a)).status,400);
  assert.equal((await request('/api/catalog','GET',null,a)).data.version,1);
  for(const path of ['catalog-model.mjs','pricing-core.mjs'])assert.equal(file('docs/'+path),file('backend/'+path));
  const context=vm.createContext({window:{}});vm.runInContext(file('docs/pricing.js'),context);
  const canonical=validateCatalog(catalog),browser=structuredClone(catalog);context.window.FORGE_PRICING.recalculate(browser);assert.deepEqual(canonical,browser);
});
function browser(fetch,legacy,remembered){
  const nodes=new Map(),storage=new Map(remembered);if(legacy)storage.set('forja-mercadores-v1',JSON.stringify(legacy));
  const node=selector=>{if(!nodes.has(selector))nodes.set(selector,{value:'',hidden:false,innerHTML:'',textContent:'',handlers:{},classList:{add(){},remove(){},toggle(){}},addEventListener(type,fn){this.handlers[type]=fn},showModal(){this.open=true},close(){this.open=false},focus(){}});return nodes.get(selector)};
  const context=vm.createContext({structuredClone,crypto,setTimeout:()=>0,setInterval:()=>0,clearTimeout(){},Blob,URL,AbortSignal,TextEncoder,TextDecoder,btoa,atob,location:{hash:'',pathname:'/forja/index.html',search:''},history:{replaceState(){}},navigator:{clipboard:{writeText:async()=>{}}},document:{hidden:false,querySelector:node,querySelectorAll:()=>[],addEventListener(){}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{matchMedia:()=>({matches:false}),scrollTo(){}},fetch});
  for(const name of ['data.js','search.js','pricing.js','app.js','orders-config.js','catalog-sync.js'])vm.runInContext(file('docs/'+name),context);
  const app=context.window.FORJA_APP,sync=context.window.FORJA_CATALOG;
  const connect=room=>sync.connect({room,initialActor:'Kai',actor:()=>node('#smith-name').value||'Kai',api:async(path,options={})=>{const response=await context.fetch(context.window.FORGE_ORDERS_API+path,{...options,headers:{'Content-Type':'application/json','X-Workshop-Id':room.id,Authorization:'Bearer '+room.key}});const data=await response.json();if(!response.ok)throw Object.assign(Error(data.error),{status:response.status});return data}});
  return {node,context,app,sync,connect,storage};
}
test('two computers see recipe edits, price changes and deletions; stale drafts and failed saves are preserved',async()=>{
  const {request,fetch}=fixture(),room=(await request('/api/workshops','POST',{name:'Rosa'})).data;
  const a=browser(fetch),b=browser(fetch);
  await a.connect(room);await b.connect(room);
  let recipe=structuredClone(a.app.getRecipes().find(r=>r.name==='Espada grande de aço'));recipe.id='new-shared-sword';recipe.name='Espada da Rosa';
  await a.app.saveOrderRecipe(recipe);await b.sync.refresh();
  recipe=b.app.getRecipes().find(r=>r.name==='Espada da Rosa');assert.ok(recipe);
  // The second player modifies the actual calculator controls and saves.
  await b.node('#recipe-cards').onclick({target:{closest:()=>({dataset:{open:recipe.id}})}});
  b.node('#recipe-category').value='Armas';b.node('#recipe-name').value='Espada da Rosa revisada';b.node('#recipe-name').handlers.input();await b.node('#save-recipe').onclick();
  await a.sync.refresh();assert.ok(a.app.getRecipes().some(r=>r.name==='Espada da Rosa revisada'));
  // Open a draft on A, then change wood on B through the catalog form.
  await a.node('#recipe-cards').onclick({target:{closest:()=>({dataset:{open:recipe.id}})}});
  a.node('#recipe-category').value='Armas';a.node('#recipe-name').value='Rascunho preservado';a.node('#recipe-name').handlers.input();
  b.node('#catalog-rows').onclick({target:{closest:()=>({dataset:{edit:'m12'}})}});
  b.node('#mat-name').value='Lenha';b.node('#mat-vendor').value='Alvor';b.node('#mat-price').value='10';b.node('#mat-stock').value='15';b.node('#mat-pricing-recipe').value='';
  await b.node('#material-form').onsubmit({preventDefault(){}});await a.sync.refresh();
  assert.equal(a.app.getMaterials().find(m=>m.id==='m12').price,10);assert.equal(a.app.getMaterials().find(m=>m.id==='m11').price,35);
  await a.app.saveOrderRecipe({...structuredClone(recipe),name:'Outra receita'});
  await a.node('#save-recipe').onclick();assert.match(a.node('#toast').textContent,/Outro jogador/);assert.equal(a.node('#recipe-name').value,'Rascunho preservado');assert.ok(!a.app.getRecipes().some(r=>r.name==='Rascunho preservado'));
  await b.sync.refresh();
  // A network failure cannot be presented as a successful save or change canonical state.
  const before=a.app.getMaterials()[0].price;a.context.fetch=async()=>{throw Error('offline')};
  const candidate={materials:structuredClone(a.app.getMaterials()),recipes:structuredClone(a.app.getRecipes())};candidate.materials[0].price=100;
  await assert.rejects(a.app.commitCatalog(candidate));assert.equal(a.app.getMaterials()[0].price,before);
  a.context.fetch=fetch;
  await b.node('#recipe-cards').onclick({target:{closest:()=>({dataset:{delete:recipe.id}})}});b.node('#delete-recipe-password').value=TEST_MASTER;await b.node('#confirm-delete').onclick();await a.sync.refresh();assert.ok(!a.app.getRecipes().some(r=>r.id===recipe.id));
  // Reloading on another computer reads the same database; an independent office is separate.
  const reload=browser(fetch);await reload.connect(room);assert.equal(reload.app.getMaterials().find(m=>m.id==='m12').price,10);
  const different=(await request('/api/workshops','POST',{name:'Outra'})).data;await reload.connect(different);assert.equal(reload.app.getMaterials().find(m=>m.id==='m12').price,5);
});
async function loadOrders(b){
  b.context.ORDER_MODEL=orderModel;
  await vm.runInContext('(async()=>{const {ORDER_STATUSES,validateItems,orderTotal,validateRecipe,recipeQuote}=ORDER_MODEL;'+file('docs/orders.mjs').replace(/^import[^\n]+\n/,'')+'})()',b.context);
  for(let i=0;i<100;i++){
    if(b.node('#workshops-sync').textContent.startsWith('Oficinas salvas')&&(!b.storage.get('forja-orders-workshop-v1')||(b.sync.getVersion()&&b.node('#orders-sync').textContent.startsWith('Lista compartilhada')))){await new Promise(resolve=>setImmediate(resolve));return;}
    await new Promise(resolve=>setImmediate(resolve));
  }
  throw Error('Oficinas não carregaram.');
}
test('workshops are listed across computers and can be entered without a shared link',async()=>{
  const {request,fetch}=fixture(),a=browser(fetch);await loadOrders(a);
  a.node('#new-workshop-name').value='Rosa de Ferro';a.node('#smith-name').value='Kai';
  await a.node('#create-workshop-form').onsubmit({preventDefault(){}});
  const room=JSON.parse(a.storage.get('forja-orders-workshop-v1'));
  assert.ok(a.node('#workshop-list').innerHTML.includes('Rosa de Ferro'));assert.ok(a.node('#workshop-list').innerHTML.includes('Oficina atual'));
  const list=(await request('/api/workshops')).data.workshops;assert.equal(list.length,1);assert.equal(list[0].id,room.id);assert.ok(!('key' in list[0]));assert.ok(!('token_hash' in list[0]));
  const b=browser(fetch);await loadOrders(b);assert.ok(b.node('#workshop-list').innerHTML.includes('Rosa de Ferro'));assert.equal(b.storage.get('forja-orders-workshop-v1'),undefined);
  await b.node('#workshop-list').onclick({target:{closest:()=>({dataset:{enterWorkshop:room.id}})}});
  const access=JSON.parse(b.storage.get('forja-orders-workshop-v1'));assert.equal(access.id,room.id);assert.notEqual(access.key,room.key);assert.ok(b.app.getRecipes().length>0);
  assert.equal((await request('/api/catalog','GET',null,access)).status,200);
  assert.equal((await request('/api/workshops/unknown-office/join','POST')).status,404);
  const other=(await request('/api/workshops','POST',{name:'Outra oficina'})).data;
  assert.equal((await request('/api/catalog','GET',null,{...access,id:other.id})).status,401);
  const reload=browser(fetch,null,b.storage);await loadOrders(reload);assert.ok(reload.node('#workshop-list').innerHTML.includes('Rosa de Ferro'));
  reload.node('#change-workshop').onclick();assert.equal(reload.node('#orders-connect').hidden,false);assert.ok(reload.node('#workshop-list').innerHTML.includes('Entrar'));
  await reload.node('#workshop-list').onclick({target:{closest:()=>({dataset:{enterWorkshop:room.id}})}});assert.equal(JSON.parse(reload.storage.get('forja-orders-workshop-v1')).id,room.id);
});
test('pricing starts empty on first visit, reconnect and workshop changes; loading a saved recipe remains explicit',async()=>{
  const {request,fetch}=fixture(),b=browser(fetch);
  const empty=()=>{assert.equal(b.node('#recipe-name').value,'');assert.equal(vm.runInContext('draft.lines.length',b.context),0);assert.equal(b.node('#sale-price').textContent,'0')};
  empty();const a=(await request('/api/workshops','POST',{name:'A'})).data;await b.connect(a);empty();
  const armor=b.app.getRecipes().find(r=>r.name==='Armadura de aço');assert.ok(armor);
  await b.node('#recipe-cards').onclick({target:{closest:()=>({dataset:{open:armor.id}})}});assert.equal(b.node('#recipe-name').value,'Armadura de aço');assert.ok(vm.runInContext('draft.lines.length',b.context)>0);
  const other=(await request('/api/workshops','POST',{name:'B'})).data;await b.connect(other);empty();await b.connect(a);empty();
  const fresh=browser(fetch);await fresh.connect(a);assert.equal(fresh.node('#recipe-name').value,'');assert.ok(fresh.app.getRecipes().some(r=>r.id===armor.id));
});
test('a delayed background read cannot restore an older catalog after saving',async()=>{
  const {request,fetch}=fixture(),room=(await request('/api/workshops','POST',{name:'Rosa'})).data,b=browser(fetch);await b.connect(room);
  let release,captured;const original=b.context.fetch;
  b.context.fetch=async(url,options)=>{const response=await original(url,options);if(url.endsWith('/api/catalog')&&!options.method){captured=response;await new Promise(resolve=>{release=resolve});}return response};
  const reading=b.sync.refresh();
  while(!captured)await new Promise(resolve=>setImmediate(resolve));
  const next={materials:structuredClone(b.app.getMaterials()),recipes:structuredClone(b.app.getRecipes())};next.materials.find(m=>m.id==='m12').price=10;await b.app.commitCatalog(next);
  release();await reading;
  assert.equal(b.app.getMaterials().find(m=>m.id==='m12').price,10);assert.equal(b.sync.getVersion(),2);
});
test('old browser recipes can be shared explicitly without overwriting the workshop',async()=>{
  const {request,fetch}=fixture(),room=(await request('/api/workshops','POST',{name:'Rosa'})).data,a=browser(fetch);await a.connect(room);
  const local=a.app.getLegacyCatalog();local.recipes.push({...structuredClone(local.recipes[0]),id:'legacy-custom',name:'Receita antiga'});local.materials.find(m=>m.id==='m12').price=999;
  const b=browser(fetch,local);await b.connect(room);assert.equal(b.app.getMaterials().find(m=>m.id==='m12').price,5);assert.ok(!b.app.getRecipes().some(r=>r.name==='Receita antiga'));
  await b.node('#share-browser-recipes').onclick();await a.sync.refresh();assert.ok(a.app.getRecipes().some(r=>r.name==='Receita antiga'));assert.equal(a.app.getMaterials().find(m=>m.id==='m12').price,5);assert.equal(b.storage.get('forja-mercadores-v1'),JSON.stringify(local));
});

test('master password protects recipe deletion in the API and leaves ordinary editing available',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  const first=(await request('/api/catalog','POST',{actor:'Kai',catalog},room)).data;
  const next=structuredClone(first.catalog);next.recipes=next.recipes.filter(r=>r.id!=='ingot');
  for(const masterPassword of [undefined,'incorreta']){
    assert.equal((await request('/api/catalog','PATCH',{version:1,actor:'Kai',catalog:next,masterPassword},room)).status,403);
    assert.equal((await request('/api/catalog','GET',null,room)).data.version,1);
  }
  let result=await request('/api/catalog','PATCH',{version:1,actor:'Kai',catalog:next,masterPassword:TEST_MASTER},room);assert.equal(result.status,200);assert.equal(result.data.catalog.recipes.length,1);assert.ok(!JSON.stringify(result.data).includes(TEST_MASTER));
  next.materials[0].price=10;result=await request('/api/catalog','PATCH',{version:2,actor:'Eivor',catalog:next},room);assert.equal(result.status,200);assert.equal(result.data.catalog.materials[1].price,35);
});

test('deleting one of two identically named offices requires the master password and preserves the other and historical data',async()=>{
  const {request,sqlite}=fixture(),a=(await request('/api/workshops','POST',{name:'Rosa de Ferro'})).data,b=(await request('/api/workshops','POST',{name:'Rosa de Ferro'})).data;
  await request('/api/catalog','POST',{actor:'Kai',catalog},a);
  await request('/api/orders','POST',{id:'history-001',customer:'Cliente',createdBy:'Kai',items:[{name:'Espada',qty:1,unitPrice:100}]},a);
  const input={actor:'Kai',confirmationName:'Rosa de Ferro',masterPassword:TEST_MASTER};
  assert.equal((await request('/api/workshops/'+a.id,'DELETE',input)).status,401);
  assert.equal((await request('/api/workshops/'+a.id,'DELETE',{...input,masterPassword:'errada'},a)).status,403);
  assert.equal((await request('/api/workshops/'+a.id,'DELETE',{...input,confirmationName:'Rosa'},a)).status,400);
  assert.equal((await request('/api/workshops/'+a.id,'DELETE',input,b)).status,403);
  assert.equal((await request('/api/workshops')).data.workshops.length,2);
  assert.equal((await request('/api/workshops/'+a.id,'DELETE',input,a)).status,200);
  const listed=(await request('/api/workshops')).data.workshops;assert.equal(listed.length,1);assert.equal(listed[0].id,b.id);
  assert.equal((await request('/api/workshops/'+a.id+'/join','POST')).status,404);
  assert.equal((await request('/api/catalog','GET',null,a)).status,401);
  assert.equal((await request('/api/orders','GET',null,b)).status,200);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM orders WHERE workshop_id = ?').get(a.id).n,1);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM catalogs WHERE workshop_id = ?').get(a.id).n,1);
  const removed=sqlite.prepare('SELECT * FROM workshops WHERE id = ?').get(a.id);assert.equal(removed.deleted_by,'Kai');assert.ok(removed.deleted_at);
});

test('the interface requires passwords and removes only the selected workshop, including after reload',async()=>{
  const {request,fetch}=fixture(),a=(await request('/api/workshops','POST',{name:'Rosa de Ferro'})).data,b=(await request('/api/workshops','POST',{name:'Rosa de Ferro'})).data;
  const ui=browser(fetch);await loadOrders(ui);ui.node('#smith-name').value='Kai';
  const click=dataset=>ui.node('#workshop-list').onclick({target:{closest:()=>({dataset})}});
  await click({enterWorkshop:a.id});
  click({deleteWorkshop:a.id});assert.ok(ui.node('#delete-workshop-info').textContent.includes(a.id.slice(0,8)));assert.equal(ui.node('#confirm-delete-workshop').disabled,true);
  ui.node('#delete-workshop-confirmation').value='Rosa de Ferro';ui.node('#delete-workshop-password').value='errada';await ui.node('#workshop-delete-form').onsubmit({preventDefault(){}});assert.match(ui.node('#toast').textContent,/Senha master incorreta/);assert.equal(ui.node('#delete-workshop-password').value,'');assert.equal((await request('/api/workshops')).data.workshops.length,2);
  ui.node('#delete-workshop-password').value=TEST_MASTER;await ui.node('#workshop-delete-form').onsubmit({preventDefault(){}});assert.equal(ui.storage.get('forja-orders-workshop-v1'),undefined);assert.ok(!ui.node('#workshop-list').innerHTML.includes(a.id));assert.ok(ui.node('#workshop-list').innerHTML.includes(b.id));assert.equal(ui.node('#recipe-name').value,'');
  const reload=browser(fetch,null,ui.storage);await loadOrders(reload);assert.ok(!reload.node('#workshop-list').innerHTML.includes(a.id));await reload.node('#workshop-list').onclick({target:{closest:()=>({dataset:{enterWorkshop:b.id}})}});
  reload.node('#smith-name').value='Kai';const recipe=reload.app.getRecipes()[0];await reload.node('#recipe-cards').onclick({target:{closest:()=>({dataset:{delete:recipe.id}})}});await reload.node('#confirm-delete').onclick();assert.match(reload.node('#toast').textContent,/senha master/);assert.ok(reload.app.getRecipes().some(r=>r.id===recipe.id));
  reload.node('#delete-recipe-password').value=TEST_MASTER;await reload.node('#confirm-delete').onclick();assert.ok(!reload.app.getRecipes().some(r=>r.id===recipe.id));assert.equal(reload.node('#delete-recipe-password').value,'');assert.ok([...reload.storage.values()].every(value=>!value.includes(TEST_MASTER)));
});

test('catalog items can be deleted with the master password while linked recipes keep their last price',async()=>{
  const {request,fetch}=fixture(),room=(await request('/api/workshops','POST',{name:'Rosa'})).data,a=browser(fetch),b=browser(fetch);await a.connect(room);await b.connect(room);
  const wood=structuredClone(a.app.getMaterials().find(m=>m.id==='m12'));
  const candidate={materials:structuredClone(a.app.getMaterials()),recipes:structuredClone(a.app.getRecipes())};candidate.materials.push({...wood,id:'wood-another-vendor',vendor:'Outro vendedor',price:10});await a.app.commitCatalog(candidate);
  a.node('#catalog-rows').onclick({target:{closest:()=>({dataset:{deleteMaterial:wood.id}})}});
  assert.equal(a.node('#confirm-delete-title').textContent,'Excluir item do catálogo?');assert.ok(a.node('#confirm-text').textContent.includes(wood.vendor));assert.ok(a.node('#confirm-text').textContent.includes(wood.name));
  a.node('#delete-recipe-password').value='incorreta';await a.node('#confirm-delete').onclick();assert.match(a.node('#toast').textContent,/Senha master incorreta/);assert.ok(a.app.getMaterials().some(m=>m.id===wood.id));assert.equal(a.node('#delete-recipe-password').value,'');
  a.node('#delete-recipe-password').value=TEST_MASTER;await a.node('#confirm-delete').onclick();assert.ok(!a.app.getMaterials().some(m=>m.id===wood.id));assert.ok(a.app.getMaterials().some(m=>m.id==='wood-another-vendor'));
  const charcoal=a.app.getRecipes().find(r=>r.id==='seed-charcoal-3-wood');assert.equal(charcoal.lines[0].price,5);assert.equal(charcoal.lines[0].materialId,null);assert.equal(charcoal.lines[0].manualPrice,true);assert.equal(a.app.calc(charcoal).sale,18);assert.equal(a.app.getMaterials().find(m=>m.id==='m11').price,18);
  await b.sync.refresh();assert.ok(!b.app.getMaterials().some(m=>m.id===wood.id));assert.equal(b.app.calc(b.app.getRecipes().find(r=>r.id===charcoal.id)).sale,18);
  const reload=browser(fetch);await reload.connect(room);assert.ok(!reload.app.getMaterials().some(m=>m.id===wood.id));assert.equal(a.node('#delete-recipe-password').value,'');
});

test('a price deletion confirmation cannot act on another workshop after switching',async()=>{
  const {request,fetch}=fixture(),a=(await request('/api/workshops','POST',{name:'A'})).data,b=(await request('/api/workshops','POST',{name:'B'})).data,ui=browser(fetch);await ui.connect(a);
  ui.node('#catalog-rows').onclick({target:{closest:()=>({dataset:{deleteMaterial:'m12'}})}});await ui.connect(b);ui.node('#delete-recipe-password').value=TEST_MASTER;await ui.node('#confirm-delete').onclick();assert.match(ui.node('#toast').textContent,/oficina ou o registro mudou/);assert.ok(ui.app.getMaterials().some(m=>m.id==='m12'));
});
