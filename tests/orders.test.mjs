import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleOrders} from '../backend/orders-api.mjs';
import {orderTotal,normalizeOrder} from '../docs/order-model.mjs';

function database(){
  const sqlite=new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../backend/schema.sql',import.meta.url),'utf8'));
  return {prepare(sql){
    let args=[];
    return {
      bind(...values){args=values;return this;},
      async first(){return sqlite.prepare(sql).get(...args)||null;},
      async all(){return {results:sqlite.prepare(sql).all(...args)};},
      async run(){return {meta:{changes:Number(sqlite.prepare(sql).run(...args).changes)}};}
    };
  }};
}
function fixture(){
  const db=database();
  const request=async(path,method='GET',input,room,origin='https://devmiojo.github.io')=>{
    const response=await handleOrders(new Request('https://forja-encomendas.lannahechee.chatgpt.site'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(room?{'X-Workshop-Id':room.id,Authorization:'Bearer '+room.key}:{})},...(input?{body:JSON.stringify(input)}:{})}),db);
    return {status:response.status,data:response.status===204?null:await response.json()};
  };
  return {request};
}
const freeItem={name:'Escudo com brasão ainda não cadastrado',qty:2,unitPrice:125,recipeId:null};

test('free items, prices and delivery persist with the maker and audit trail',async()=>{
  const {request}=fixture();
  const room=(await request('/api/workshops','POST',{name:'Rosa de Ferro'})).data;
  const create={id:'order-001',customer:'Eivor',createdBy:'Mercador',notes:'Materiais fornecidos pelo cliente.',items:[freeItem,{name:'Peça sob medida',qty:1,unitPrice:null}]};
  let result=await request('/api/orders','POST',create,room);assert.equal(result.status,201);
  assert.equal(orderTotal(result.data.order).value,250);assert.equal(orderTotal(result.data.order).hasUnpriced,true);
  result=await request('/api/orders','POST',create,room);assert.equal(result.status,200);
  assert.equal((await request('/api/orders','GET',null,room)).data.orders.length,1);
  result=await request('/api/orders/order-001','PATCH',{version:1,action:'start',actor:'Kai'},room);assert.equal(result.status,200);assert.equal(result.data.order.assignedTo,'Kai');
  result=await request('/api/orders/order-001','PATCH',{version:2,action:'complete',actor:'Kai'},room);assert.equal(result.data.order.status,'ready');assert.equal(result.data.order.deliveredAt,null);
  result=await request('/api/orders/order-001','PATCH',{version:3,action:'deliver',actor:'Mercador'},room);assert.equal(result.status,200);assert.equal(result.data.order.status,'delivered');assert.equal(result.data.order.completedBy,'Kai');assert.equal(result.data.order.deliveredBy,'Mercador');assert.ok(result.data.order.completedAt);
  const saved=(await request('/api/orders','GET',null,room)).data.orders[0];assert.equal(saved.completedBy,'Kai');assert.equal(saved.events.length,4);
  assert.equal((await request('/api/orders/order-001','PATCH',{version:4,action:'deliver',actor:'Outro',completedBy:'Outro'},room)).status,409);
  result=await request('/api/orders/order-001','PATCH',{version:4,action:'reopen',actor:'Mercador'},room);assert.equal(result.data.order.status,'pending');assert.equal(result.data.order.events[3].completedBy,'Kai');assert.equal(result.data.order.events.length,5);
});

test('one ferreiro cannot overwrite a concurrent edit from another',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  await request('/api/orders','POST',{id:'order-race',customer:'Cliente',createdBy:'Mercador',items:[freeItem]},room);
  const results=await Promise.all(['Kai','Eivor'].map(actor=>request('/api/orders/order-race','PATCH',{action:'edit',version:1,actor,customer:actor,items:[freeItem]},room)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  const saved=(await request('/api/orders','GET',null,room)).data.orders[0];assert.equal(saved.version,2);assert.equal(saved.events.length,2);
});

test('workshop links protect records and separate different offices',async()=>{
  const {request}=fixture(),a=(await request('/api/workshops','POST',{name:'A'})).data,b=(await request('/api/workshops','POST',{name:'B'})).data;
  await request('/api/orders','POST',{id:'order-private',customer:'Cliente',createdBy:'Mercador',items:[freeItem]},a);
  assert.equal((await request('/api/orders','GET')).status,401);
  assert.equal((await request('/api/orders','GET',null,{...a,key:'wrong'})).status,401);
  assert.equal((await request('/api/orders','GET',null,b)).data.orders.length,0);
  assert.equal((await request('/api/orders/order-private','PATCH',{action:'start',version:1,actor:'Outro'},b)).status,404);
  assert.equal((await request('/api/workshops','POST',{name:'X'},null,'https://unrelated.example')).status,403);
});

test('invalid quantities, prices and oversized names cannot corrupt orders',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  for(const item of [{...freeItem,qty:0},{...freeItem,unitPrice:-1},{...freeItem,qty:1.5}])assert.equal((await request('/api/orders','POST',{id:'invalid-01',customer:'Cliente',createdBy:'Mercador',items:[item]},room)).status,400);
  assert.equal((await request('/api/orders','GET',null,room)).data.orders.length,0);
  await request('/api/orders','POST',{id:'order-maker',customer:'Cliente',createdBy:'Mercador',items:[freeItem]},room);
  assert.equal((await request('/api/orders/order-maker','PATCH',{version:1,action:'complete',actor:'x'.repeat(121)},room)).status,400);
  assert.equal((await request('/api/orders/order-maker','PATCH',{version:1,action:'deliver',actor:'Mercador'},room)).status,409);
  assert.equal((await request('/api/orders','GET',null,room)).data.orders[0].version,1);
});

test('frontend and backend validate the same order model',()=>{
  assert.equal(readFileSync(new URL('../backend/order-model.mjs',import.meta.url),'utf8'),readFileSync(new URL('../docs/order-model.mjs',import.meta.url),'utf8'));
});

const swordRecipe={name:'Espada experimental',category:'Armas',output:1,labourPct:15,extra:0,markup:0,round:0,lines:[{materialId:'m9',name:'Barra de Aço',vendor:'Alvor',qty:4,price:38},{materialId:'m13',name:'Lingote de Ferro',vendor:'Alvor',qty:2,price:15},{materialId:'m14',name:'Tiras de Couro',vendor:'Alvor',qty:3,price:5}]};

test('a new item gains a shared recipe and a server-calculated quotation',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  let result=await request('/api/orders','POST',{id:'new-recipe-order',customer:'Cliente',createdBy:'Mercador',items:[{name:'Espada experimental',qty:2,unitPrice:null}]},room);
  assert.equal(result.status,201);assert.equal(result.data.order.items[0].unitPrice,null);
  result=await request('/api/orders/new-recipe-order','PATCH',{version:1,action:'edit_item',actor:'Kai',itemId:'item-0',recipe:swordRecipe,unitPrice:1},room);
  assert.equal(result.status,200);assert.equal(result.data.order.items[0].unitPrice,226.55);assert.equal(orderTotal(result.data.order).value,453.1);
  const saved=(await request('/api/orders','GET',null,room)).data.orders[0];assert.equal(saved.items[0].recipe.lines.length,3);assert.equal(saved.items[0].recipe.labourPct,15);assert.equal(saved.events[1].actor,'Kai');assert.equal(saved.events[1].itemName,'Espada experimental');
});

test('crafting and delivery are separate steps and preserve each maker',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  await request('/api/orders','POST',{id:'production-order',customer:'Cliente',createdBy:'Mercador',items:[{...freeItem,id:'shield'}, {id:'sword',name:'Espada experimental',qty:1,unitPrice:1,recipe:swordRecipe}]},room);
  let result=await request('/api/orders/production-order','PATCH',{version:1,action:'make_item',actor:'Kai',itemId:'shield'},room);assert.equal(result.data.order.status,'in_progress');assert.equal(result.data.order.deliveredBy,null);
  result=await request('/api/orders/production-order','PATCH',{version:2,action:'make_item',actor:'Eivor',itemId:'sword'},room);assert.equal(result.data.order.status,'ready');assert.equal(result.data.order.completedBy,'Kai, Eivor');assert.equal(result.data.order.deliveredAt,null);assert.equal(result.data.order.items[0].madeBy,'Kai');assert.equal(result.data.order.items[1].madeBy,'Eivor');
  const madeAt=result.data.order.completedAt;
  result=await request('/api/orders/production-order','PATCH',{version:3,action:'deliver',actor:'Mercador',completedBy:'Não substituir os ferreiros'},room);assert.equal(result.data.order.status,'delivered');assert.equal(result.data.order.completedAt,madeAt);assert.equal(result.data.order.deliveredBy,'Mercador');assert.equal(result.data.order.items[0].madeBy,'Kai');assert.equal(result.data.order.items[1].madeBy,'Eivor');assert.ok(result.data.order.deliveredAt>=madeAt);
});

test('finished items need reopening before their recipe can change',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  await request('/api/orders','POST',{id:'finished-recipe',customer:'Cliente',createdBy:'Mercador',items:[{name:'Espada experimental',qty:1,unitPrice:null,recipe:swordRecipe}]},room);
  let result=await request('/api/orders/finished-recipe','PATCH',{version:1,action:'complete',actor:'Kai'},room);assert.equal(result.data.order.status,'ready');assert.equal(result.data.order.deliveredAt,null);
  assert.equal((await request('/api/orders/finished-recipe','PATCH',{version:2,action:'edit_item',actor:'Eivor',itemId:'item-0',recipe:swordRecipe},room)).status,409);
  result=await request('/api/orders/finished-recipe','PATCH',{version:2,action:'reopen_item',actor:'Eivor',itemId:'item-0'},room);assert.notEqual(result.data.order.status,'ready');assert.equal(result.data.order.items[0].madeBy,null);
  result=await request('/api/orders/finished-recipe','PATCH',{version:3,action:'edit_item',actor:'Eivor',itemId:'item-0',recipe:{...swordRecipe,labourPct:10}},room);assert.equal(result.status,200);assert.equal(result.data.order.items[0].unitPrice,216.7);
});

test('invalid recipes are rejected without changing the item',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  await request('/api/orders','POST',{id:'invalid-recipe',customer:'Cliente',createdBy:'Mercador',items:[{name:'Item novo',qty:1,unitPrice:null}]},room);
  for(const recipe of [{...swordRecipe,output:0},{...swordRecipe,lines:[]},{...swordRecipe,lines:[{...swordRecipe.lines[0],qty:-1}]}])assert.equal((await request('/api/orders/invalid-recipe','PATCH',{version:1,action:'edit_item',actor:'Kai',itemId:'item-0',recipe},room)).status,400);
  const saved=(await request('/api/orders','GET',null,room)).data.orders[0];assert.equal(saved.version,1);assert.equal(saved.items[0].recipe,null);assert.equal(saved.items[0].unitPrice,null);
});

test('existing delivered orders keep their previous maker and delivery timestamp',()=>{
  const old={customer:'Cliente',createdBy:'Mercador',status:'delivered',completedBy:'Kai',completedAt:'2026-10-12T12:00:00Z',items:[freeItem]};
  const hydrated=normalizeOrder(old);assert.equal(hydrated.items[0].productionStatus,'made');assert.equal(hydrated.items[0].madeBy,'Kai');assert.equal(hydrated.deliveredAt,old.completedAt);assert.equal(hydrated.items[0].unitPrice,125);
});

test('orders can be created, edited, quoted, crafted and delivered without a smith name',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  let result=await request('/api/orders','POST',{id:'anonymous-order',customer:'Cliente',items:[{name:'Espada experimental',qty:1,unitPrice:null}]},room);assert.equal(result.status,201);assert.equal(result.data.order.createdBy,'Não informado');
  result=await request('/api/orders/anonymous-order','PATCH',{version:1,action:'edit',customer:'Outro cliente',items:result.data.order.items,notes:'Novo pedido'},room);assert.equal(result.status,200);assert.equal(result.data.order.events.at(-1).actor,'Não informado');
  result=await request('/api/orders/anonymous-order','PATCH',{version:2,action:'edit_item',itemId:'item-0',recipe:swordRecipe},room);assert.equal(result.status,200);assert.equal(result.data.order.items[0].unitPrice,226.55);
  result=await request('/api/orders/anonymous-order','PATCH',{version:3,action:'make_item',itemId:'item-0'},room);assert.equal(result.status,200);assert.equal(result.data.order.items[0].madeBy,'Não informado');assert.equal(result.data.order.status,'ready');
  result=await request('/api/orders/anonymous-order','PATCH',{version:4,action:'deliver'},room);assert.equal(result.status,200);assert.equal(result.data.order.deliveredBy,'Não informado');assert.equal(result.data.order.completedBy,'Não informado');
});
