import {createOrder,changeOrder,normalizeOrder,OrderError} from './order-model.mjs';

const ALLOWED_ORIGINS=new Set(['https://devmiojo.github.io','https://forja-encomendas.lannahechee.chatgpt.site']);
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}:{})}});
const decode=row=>({...normalizeOrder(JSON.parse(row.document)),id:row.id,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
async function body(request){
  if(!request.headers.get('content-type')?.includes('application/json'))throw new OrderError('Envie dados em JSON.',415);
  const raw=await request.text();if(raw.length>65536)throw new OrderError('Encomenda muito grande.',413);
  try{return JSON.parse(raw);}catch{throw new OrderError('Dados inválidos.');}
}
async function workshop(request,db){
  const id=request.headers.get('X-Workshop-Id'),authorization=request.headers.get('Authorization')||'';
  const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!id||!token||token.length>200)throw new OrderError('Entre na oficina pelo link compartilhado.',401);
  const room=await db.prepare('SELECT id, name FROM workshops WHERE id = ? AND token_hash = ?').bind(id,await hash(token)).first();
  if(!room)throw new OrderError('Link de oficina inválido.',401);return room;
}
export async function handleOrders(request,db){
  const origin=request.headers.get('Origin')||'';
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:'Origem não permitida.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||'https://devmiojo.github.io','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Workshop-Id','Access-Control-Max-Age':'600','Vary':'Origin'}});
  try{
    if(!db)throw new OrderError('O serviço de encomendas está indisponível.',503);
    const path=new URL(request.url).pathname.replace(/\/$/,'');
    if(path==='/api/health'&&request.method==='GET'){
      await db.prepare('SELECT id FROM workshops LIMIT 1').first();
      await db.prepare('SELECT id FROM orders LIMIT 1').first();
      return json({ok:true},200,origin);
    }
    if(path==='/api/workshops'&&request.method==='POST'){
      const input=await body(request),name=typeof input.name==='string'?input.name.trim():'';
      if(!name||name.length>120)throw new OrderError('Dê um nome à oficina com até 120 caracteres.');
      const id=crypto.randomUUID(),token=[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join(''),now=new Date().toISOString();
      await db.prepare('INSERT INTO workshops (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)').bind(id,name,await hash(token),now).run();
      return json({id,name,key:token},201,origin);
    }
    const room=await workshop(request,db);
    if(path==='/api/workshops'&&request.method==='GET')return json(room,200,origin);
    if(path==='/api/orders'&&request.method==='GET'){
      const rows=await db.prepare('SELECT * FROM orders WHERE workshop_id = ? ORDER BY created_at DESC LIMIT 5000').bind(room.id).all();
      return json({orders:rows.results.map(decode)},200,origin);
    }
    if(path==='/api/orders'&&request.method==='POST'){
      const input=await body(request);
      if(typeof input.id!=='string'||!/^[a-zA-Z0-9_-]{8,80}$/.test(input.id))throw new OrderError('Identificador de encomenda inválido.');
      const document=createOrder(input),now=new Date().toISOString();
      const result=await db.prepare('INSERT INTO orders (id, workshop_id, customer, status, document, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING').bind(input.id,room.id,document.customer,document.status,JSON.stringify(document),now,now).run();
      const row=await db.prepare('SELECT * FROM orders WHERE id = ? AND workshop_id = ?').bind(input.id,room.id).first();
      if(!row)throw new OrderError('Identificador já utilizado. Tente uma nova encomenda.',409);
      return json({order:decode(row)},result.meta.changes?201:200,origin);
    }
    const match=path.match(/^\/api\/orders\/([a-zA-Z0-9_-]{8,80})$/);
    if(match&&request.method==='PATCH'){
      const input=await body(request),row=await db.prepare('SELECT * FROM orders WHERE id = ? AND workshop_id = ?').bind(match[1],room.id).first();
      if(!row)throw new OrderError('Encomenda não encontrada.',404);
      if(input.version!==row.version)throw new OrderError('Outro ferreiro alterou esta encomenda. Atualize a lista e reabra antes de salvar.',409);
      const document=changeOrder(JSON.parse(row.document),input),now=new Date().toISOString();
      const result=await db.prepare('UPDATE orders SET customer = ?, status = ?, document = ?, version = version + 1, updated_at = ? WHERE id = ? AND workshop_id = ? AND version = ?').bind(document.customer,document.status,JSON.stringify(document),now,match[1],room.id,row.version).run();
      if(!result.meta.changes)throw new OrderError('Outro ferreiro alterou esta encomenda. Atualize a lista antes de salvar.',409);
      const updated=await db.prepare('SELECT * FROM orders WHERE id = ? AND workshop_id = ?').bind(match[1],room.id).first();
      return json({order:decode(updated)},200,origin);
    }
    return json({error:'Operação não encontrada.'},404,origin);
  }catch(error){return json({error:error instanceof OrderError?error.message:'Não foi possível salvar a encomenda. Tente novamente.'},error instanceof OrderError?error.status:500,origin);}
}
