import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleOrders} from '../backend/orders-api.mjs';
import {orderTotal} from '../docs/order-model.mjs';

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
  result=await request('/api/orders/order-001','PATCH',{version:2,action:'deliver',actor:'Mercador',completedBy:'Kai'},room);assert.equal(result.status,200);assert.equal(result.data.order.status,'delivered');assert.equal(result.data.order.completedBy,'Kai');assert.equal(result.data.order.deliveredBy,'Mercador');assert.ok(result.data.order.completedAt);
  const saved=(await request('/api/orders','GET',null,room)).data.orders[0];assert.equal(saved.completedBy,'Kai');assert.equal(saved.events.length,3);
  assert.equal((await request('/api/orders/order-001','PATCH',{version:3,action:'deliver',actor:'Outro',completedBy:'Outro'},room)).status,409);
  result=await request('/api/orders/order-001','PATCH',{version:3,action:'reopen',actor:'Mercador'},room);assert.equal(result.data.order.status,'pending');assert.equal(result.data.order.events[2].completedBy,'Kai');assert.equal(result.data.order.events.length,4);
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

test('invalid quantities, prices and missing maker cannot corrupt orders',async()=>{
  const {request}=fixture(),room=(await request('/api/workshops','POST',{name:'Oficina'})).data;
  for(const item of [{...freeItem,qty:0},{...freeItem,unitPrice:-1},{...freeItem,qty:1.5}])assert.equal((await request('/api/orders','POST',{id:'invalid-01',customer:'Cliente',createdBy:'Mercador',items:[item]},room)).status,400);
  assert.equal((await request('/api/orders','GET',null,room)).data.orders.length,0);
  await request('/api/orders','POST',{id:'order-maker',customer:'Cliente',createdBy:'Mercador',items:[freeItem]},room);
  assert.equal((await request('/api/orders/order-maker','PATCH',{version:1,action:'deliver',actor:'Mercador',completedBy:''},room)).status,400);
  assert.equal((await request('/api/orders','GET',null,room)).data.orders[0].version,1);
});

test('frontend and backend validate the same order model',()=>{
  assert.equal(readFileSync(new URL('../backend/order-model.mjs',import.meta.url),'utf8'),readFileSync(new URL('../docs/order-model.mjs',import.meta.url),'utf8'));
});
