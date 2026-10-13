import {createOrder,changeOrder,normalizeOrder,OrderError} from './order-model.mjs';
import {validateCatalog} from './catalog-model.mjs';

const ALLOWED_ORIGINS=new Set(['https://devmiojo.github.io','https://forja-encomendas.lannahechee.chatgpt.site']);
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(b=>b.toString(16).padStart(2,'0')).join('');
const accessToken=()=>[...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
const json=(data,status=200,origin='')=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin',...(origin?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true'}:{})}});
const decode=row=>({...normalizeOrder(JSON.parse(row.document)),id:row.id,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at});
async function body(request,limit=65536){
  if(!request.headers.get('content-type')?.includes('application/json'))throw new OrderError('Envie dados em JSON.',415);
  const raw=await request.text();if(raw.length>limit)throw new OrderError('Dados muito grandes.',413);
  try{return JSON.parse(raw);}catch{throw new OrderError('Dados inválidos.');}
}
async function workshop(request,db){
  const id=request.headers.get('X-Workshop-Id'),authorization=request.headers.get('Authorization')||'';
  const token=authorization.startsWith('Bearer ')?authorization.slice(7):'';
  if(!id||!token||token.length>200)throw new OrderError('Entre na oficina pelo link compartilhado.',401);
  const tokenHash=await hash(token);
  const room=await db.prepare('SELECT id, name FROM workshops WHERE id = ? AND token_hash = ? AND deleted_at IS NULL').bind(id,tokenHash).first()||await db.prepare('SELECT w.id, w.name FROM workshops w JOIN workshop_access a ON a.workshop_id = w.id WHERE w.id = ? AND a.token_hash = ? AND w.deleted_at IS NULL').bind(id,tokenHash).first();
  if(!room)throw new OrderError('Link de oficina inválido.',401);return room;
}
export async function handleOrders(request,db,masterPassword){
  const origin=request.headers.get('Origin')||'';
  if(origin&&!ALLOWED_ORIGINS.has(origin))return json({error:'Origem não permitida.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{'Access-Control-Allow-Origin':origin||'https://devmiojo.github.io','Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, POST, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Workshop-Id','Access-Control-Max-Age':'600','Vary':'Origin'}});
  const requireMaster=async input=>{
    if(!masterPassword)throw new OrderError('Exclusões estão indisponíveis. Configure a senha master.',503);
    if(typeof input.masterPassword!=='string'||input.masterPassword.length>200||await hash(input.masterPassword)!==await hash(masterPassword))throw new OrderError('Senha master incorreta.',403);
  };
  try{
    if(!db)throw new OrderError('O serviço de encomendas está indisponível.',503);
    const path=new URL(request.url).pathname.replace(/\/$/,'');
    if(path==='/api/health'&&request.method==='GET'){
      await db.prepare('SELECT id FROM workshops LIMIT 1').first();
      await db.prepare('SELECT id FROM orders LIMIT 1').first();
      return json({ok:true},200,origin);
    }
    if(path==='/api/workshops'&&request.method==='GET'&&!request.headers.get('X-Workshop-Id')){
      const rows=await db.prepare('SELECT id, name, created_at FROM workshops WHERE deleted_at IS NULL ORDER BY name COLLATE NOCASE, id LIMIT 5000').all();
      return json({workshops:rows.results.map(row=>({id:row.id,name:row.name,createdAt:row.created_at}))},200,origin);
    }
    const entry=path.match(/^\/api\/workshops\/([a-zA-Z0-9_-]{8,80})\/join$/);
    if(entry&&request.method==='POST'){
      const room=await db.prepare('SELECT id, name FROM workshops WHERE id = ? AND deleted_at IS NULL').bind(entry[1]).first();
      if(!room)throw new OrderError('Oficina não encontrada. Atualize a lista.',404);
      const token=accessToken();
      await db.prepare('INSERT INTO workshop_access (token_hash, workshop_id, created_at) VALUES (?, ?, ?)').bind(await hash(token),room.id,new Date().toISOString()).run();
      return json({...room,key:token},200,origin);
    }
    if(path==='/api/workshops'&&request.method==='POST'){
      const input=await body(request),name=typeof input.name==='string'?input.name.trim():'';
      if(!name||name.length>120)throw new OrderError('Dê um nome à oficina com até 120 caracteres.');
      const id=crypto.randomUUID(),token=accessToken(),now=new Date().toISOString();
      await db.prepare('INSERT INTO workshops (id, name, token_hash, created_at) VALUES (?, ?, ?, ?)').bind(id,name,await hash(token),now).run();
      return json({id,name,key:token},201,origin);
    }
    const room=await workshop(request,db);
    if(path==='/api/workshops'&&request.method==='GET')return json(room,200,origin);
    const removal=path.match(/^\/api\/workshops\/([a-zA-Z0-9_-]{8,80})$/);
    if(removal&&request.method==='DELETE'){
      if(removal[1]!==room.id)throw new OrderError('Acesso inválido para esta oficina.',403);
      const input=await body(request);await requireMaster(input);
      if(input.confirmationName!==room.name)throw new OrderError('Digite exatamente o nome da oficina para confirmar.');
      const actor=typeof input.actor==='string'?input.actor.trim():'';
      if(!actor||actor.length>120)throw new OrderError('Informe seu nome antes de excluir a oficina.');
      const result=await db.prepare('UPDATE workshops SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL').bind(new Date().toISOString(),actor,room.id).run();
      if(!result.meta.changes)throw new OrderError('Esta oficina já foi excluída.',409);
      return json({deleted:true,id:room.id},200,origin);
    }
    if(path==='/api/catalog'){
      const read=()=>db.prepare('SELECT * FROM catalogs WHERE workshop_id = ?').bind(room.id).first();
      const decodeCatalog=row=>row?{catalog:JSON.parse(row.document),version:row.version,updatedBy:row.updated_by,updatedAt:row.updated_at}:{catalog:null,version:0};
      if(request.method==='GET')return json(decodeCatalog(await read()),200,origin);
      if(['POST','PATCH'].includes(request.method)){
        const input=await body(request,2*1024*1024),actor=typeof input.actor==='string'?input.actor.trim():'';
        if(!actor||actor.length>120)throw new OrderError('Informe seu nome antes de alterar o catálogo.');
        const catalog=validateCatalog(input.catalog),now=new Date().toISOString();
        if(request.method==='POST'){
          await db.prepare('INSERT INTO catalogs (workshop_id, document, version, updated_by, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(workshop_id) DO NOTHING').bind(room.id,JSON.stringify(catalog),actor,now).run();
        }else{
          if(!Number.isInteger(input.version)||input.version<1)throw new OrderError('Versão do catálogo inválida.');
          const current=await read();
          if(!current||current.version!==input.version)throw new OrderError('Outro jogador alterou o catálogo. Atualize antes de salvar.',409);
          const previous=JSON.parse(current.document),nextIds=new Set(catalog.recipes.map(r=>r.id)),materialIds=new Set(catalog.materials.map(m=>m.id));
          if(previous.recipes.some(r=>!nextIds.has(r.id))||previous.materials.some(m=>!materialIds.has(m.id)))await requireMaster(input);
          const result=await db.prepare('UPDATE catalogs SET document = ?, version = version + 1, updated_by = ?, updated_at = ? WHERE workshop_id = ? AND version = ?').bind(JSON.stringify(catalog),actor,now,room.id,input.version).run();
          if(!result.meta.changes)throw new OrderError('Outro jogador alterou o catálogo. Atualize e reabra a receita ou material antes de salvar. Seu rascunho foi preservado.',409);
        }
        return json(decodeCatalog(await read()),200,origin);
      }
    }
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
