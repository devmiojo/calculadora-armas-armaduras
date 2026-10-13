import {ORDER_STATUSES,validateItems,orderTotal} from './order-model.mjs';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const app=window.FORJA_APP,esc=app.esc,fmt=app.fmt;
const ROOM_KEY='forja-orders-workshop-v1',NAME_KEY='forja-orders-smith-v1',ROOMS_KEY='forja-orders-known-workshops-v1';
let room=null,orders=[],editor=null,deliveryId=null,busy=false,loading=false;
const stored=key=>{try{return localStorage.getItem(key)}catch{return null}};
const saveLocal=(key,value)=>{try{localStorage.setItem(key,value)}catch{app.toast('Não foi possível lembrar a oficina neste navegador. Guarde o link compartilhado.')}};
try{room=JSON.parse(stored(ROOM_KEY));if(!room?.id||!room?.key)room=null}catch{}
$('#smith-name').value=stored(NAME_KEY)||'';
$('#smith-name').oninput=e=>saveLocal(NAME_KEY,e.target.value.trim());
const date=value=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'});
const smith=()=>{const name=$('#smith-name').value.trim();if(!name){$('#smith-name').focus();throw Error('Informe seu nome de ferreiro antes de registrar uma ação.')}return name};
const totalLabel=order=>{const t=orderTotal(order);return `${fmt(t.value)} S${t.hasUnpriced?' + itens a combinar':''}`};
function knownRooms(){try{const value=JSON.parse(stored(ROOMS_KEY)||'[]');return Array.isArray(value)?value.filter(r=>r&&typeof r.id==='string'&&typeof r.key==='string'&&typeof r.name==='string'):[]}catch{return []}}
function rememberRoom(access){saveLocal(ROOMS_KEY,JSON.stringify([access,...knownRooms().filter(r=>r.id!==access.id)]))}
if(room)rememberRoom(room);
const statuses=()=>Object.entries(ORDER_STATUSES).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
$('#order-status-filter').innerHTML='<option value="">Todos os status</option>'+statuses();
const api=async(path,options={},access=room)=>{
  let response;
  try{response=await fetch(window.FORGE_ORDERS_API+path,{...options,credentials:'include',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json',...(access?{'X-Workshop-Id':access.id,'Authorization':'Bearer '+access.key}:{}),...options.headers}})}catch{throw Error('Não foi possível conectar à oficina. Confira sua conexão e tente novamente.');}
  let data;try{data=await response.json()}catch{throw Error('O serviço de encomendas ainda não está disponível para este navegador.');}
  if(!response.ok){const error=Error(data.error||'Não foi possível salvar.');error.status=response.status;throw error;}return data;
};
async function action(fn){if(busy)return;busy=true;$$('#orders button, #order-dialog button, #order-delivery-dialog button').forEach(b=>b.disabled=true);try{await fn()}catch(error){if(error.status===409)await refresh(false);app.toast(error.message)}finally{busy=false;$$('#orders button, #order-dialog button, #order-delivery-dialog button').forEach(b=>b.disabled=false)}}
function accessCode(access){return btoa(JSON.stringify({id:access.id,key:access.key,name:access.name})).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
function parseAccess(value){
  const code=value.includes('#oficina=')?value.split('#oficina=')[1].split('&')[0]:value.trim();
  const parsed=JSON.parse(atob(code.replaceAll('-','+').replaceAll('_','/')));
  if(typeof parsed.id!=='string'||typeof parsed.key!=='string'||parsed.id.length>80||parsed.key.length>200)throw Error('Link de oficina inválido.');return parsed;
}
async function join(access){const verified=await api('/api/workshops',{},access);room={...access,name:verified.name};saveLocal(ROOM_KEY,JSON.stringify(room));rememberRoom(room);history.replaceState(null,'',location.pathname+location.search);await refresh(true);app.switchView('orders');}
function render(){
  const known=knownRooms();$('#orders-known-rooms').hidden=!known.length;$('#known-workshop-select').innerHTML=known.map(r=>`<option value="${esc(r.id)}">${esc(r.name)}</option>`).join('');
  $('#orders-connect').hidden=Boolean(room);$('#orders-board').hidden=!room;$('#new-order').hidden=!room;
  $('#order-count').textContent=orders.filter(o=>o.status!=='delivered').length;
  if(!room)return;
  $('#workshop-name').textContent=room.name;
  $('#pending-orders').textContent=orders.filter(o=>o.status==='pending').length;
  $('#production-orders').textContent=orders.filter(o=>o.status==='in_progress').length;
  $('#delivered-orders').textContent=orders.filter(o=>o.status==='delivered').length;
  const q=$('#order-filter').value.trim(),status=$('#order-status-filter').value;
  const rows=orders.filter(o=>(!status||o.status===status)&&(!q||window.ITEM_SEARCH.matches({name:[o.customer,o.assignedTo,o.completedBy,...o.items.map(i=>i.name)].filter(Boolean).join(' ')},q)||o.items.some(item=>window.ITEM_SEARCH.matches(item,q))));
  $('#order-cards').innerHTML=rows.length?rows.map(order=>`<article class="card order-card"><div class="order-card-head"><span class="order-badge ${esc(order.status)}">${ORDER_STATUSES[order.status]}</span><small>#${esc(order.id.slice(0,8))}</small></div><h3>${esc(order.customer)}</h3><ul class="order-item-list">${order.items.map(item=>`<li><span><b>${fmt(item.qty)}×</b> ${esc(item.name)}</span><small>${item.unitPrice===null?'A combinar':fmt(item.unitPrice*item.qty)+' S'}</small></li>`).join('')}</ul><div class="order-value"><span>Valor combinado</span><b>${esc(totalLabel(order))}</b></div><p>${order.status==='delivered'?`Feito por <strong>${esc(order.completedBy)}</strong><br>Entregue em ${date(order.completedAt)}`:order.assignedTo?`Responsável: <strong>${esc(order.assignedTo)}</strong>`:'Aguardando um ferreiro'}<br>Criada em ${date(order.createdAt)}</p><div class="card-actions"><button class="button secondary" data-order-action="details" data-id="${esc(order.id)}">Detalhes</button>${order.status==='delivered'?`<button class="button secondary" data-order-action="reopen" data-id="${esc(order.id)}">Reabrir</button>`:`<button class="button secondary" data-order-action="edit" data-id="${esc(order.id)}">Editar</button>${order.status==='pending'?`<button class="button secondary" data-order-action="start" data-id="${esc(order.id)}">Assumir</button>`:''}<button class="button primary" data-order-action="deliver" data-id="${esc(order.id)}">Registrar entrega</button>`}</div></article>`).join(''):'<div class="empty"><span>▤</span><h3>Nenhuma encomenda por aqui</h3><p>Crie uma encomenda ou ajuste os filtros.</p></div>';
}
async function refresh(showError=true){
  if(!room){render();return}if(loading)return;loading=true;$('#orders-sync').textContent='Atualizando oficina…';
  try{const data=await api('/api/orders');orders=data.orders;$('#orders-sync').textContent='Lista compartilhada · atualizada às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});render()}catch(error){$('#orders-sync').textContent='Sem atualização · tente novamente';if(showError)app.toast(error.message)}finally{loading=false}
}
$('#create-workshop-form').onsubmit=e=>{e.preventDefault();return action(async()=>{const access=await api('/api/workshops',{method:'POST',body:JSON.stringify({name:$('#new-workshop-name').value.trim()})},null);await join(access);app.toast('Oficina criada. Compartilhe o link com os ferreiros.');})};
$('#join-workshop-form').onsubmit=e=>{e.preventDefault();return action(async()=>{await join(parseAccess($('#workshop-link').value));app.toast('Você entrou na oficina.');})};
$('#share-workshop').onclick=()=>{if(!room)return;$('#share-workshop-link').value=window.FORGE_PUBLIC_URL+'#oficina='+accessCode(room);$('#workshop-share-dialog').showModal()};
$('#copy-workshop-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#share-workshop-link').value);app.toast('Link copiado. Envie aos ferreiros.')}catch{$('#share-workshop-link').select();app.toast('Selecione e copie o link da oficina.')}};
$('#open-known-workshop').onclick=()=>action(async()=>{const access=knownRooms().find(r=>r.id===$('#known-workshop-select').value);if(!access)throw Error('Escolha uma oficina.');await join(access)});
$('#change-workshop').onclick=()=>{room=null;orders=[];try{localStorage.removeItem(ROOM_KEY)}catch{}render();app.toast('A oficina continua salva. Use o link para entrar novamente.')};
$('#refresh-orders').onclick=()=>refresh(true);$('#order-filter').oninput=$('#order-status-filter').onchange=render;
function renderEditorItems(){
  $('#order-items').innerHTML=editor.items.map((item,i)=>`<div class="order-editor-item"><label>Item<input data-order-line="${i}" data-order-field="name" list="order-recipe-options" maxlength="120" required value="${esc(item.name)}" placeholder="Nome livre ou receita cadastrada"></label><label>Qtd.<input type="number" min="1" max="1000000" step="1" required data-order-line="${i}" data-order-field="qty" value="${item.qty}"></label><label>Valor unitário (S)<input type="number" min="0" max="1000000000" step="0.01" data-order-line="${i}" data-order-field="unitPrice" value="${item.unitPrice??''}" placeholder="A combinar"></label><button type="button" class="icon-button" data-remove-order-item="${i}" aria-label="Remover item">×</button></div>`).join('');
  $('#order-editor-total').textContent=totalLabel(editor);
}
function edit(order=null){
  editor=order?structuredClone(order):{id:crypto.randomUUID(),customer:'',notes:'',items:[{name:'',qty:1,unitPrice:null,recipeId:null}]};
  $('#order-dialog-title').textContent=order?'Editar encomenda':'Criar encomenda';$('#order-customer').value=editor.customer;$('#order-notes').value=editor.notes;
  $('#order-recipe-options').innerHTML=app.getRecipes().flatMap(r=>window.ITEM_SEARCH.aliasesFor(r.name)).map(name=>`<option value="${esc(name)}"></option>`).join('');renderEditorItems();$('#order-dialog').showModal();$('#order-customer').focus();
}
$('#new-order').onclick=()=>{try{smith();edit()}catch(error){app.toast(error.message)}};
$('#add-order-item').onclick=()=>{editor.items.push({name:'',qty:1,unitPrice:null,recipeId:null});renderEditorItems();$('#order-items input:last-of-type')?.focus()};
$('#order-items').oninput=e=>{const field=e.target.dataset.orderField,index=Number(e.target.dataset.orderLine);if(!field)return;const item=editor.items[index];item[field]=field==='name'?e.target.value:field==='unitPrice'&&e.target.value===''?null:Number(e.target.value);if(field==='unitPrice')item.recipeId=null;$('#order-editor-total').textContent=totalLabel(editor)};
$('#order-items').onchange=e=>{if(e.target.dataset.orderField!=='name')return;const i=Number(e.target.dataset.orderLine),item=editor.items[i],recipe=app.getRecipes().find(r=>window.ITEM_SEARCH.aliasesFor(r.name).some(name=>window.ITEM_SEARCH.normalize(name)===window.ITEM_SEARCH.normalize(item.name)));if(recipe&&item.unitPrice===null){item.unitPrice=Math.round(app.calc(recipe).sale*100)/100;item.recipeId=recipe.id;renderEditorItems()}};
$('#order-items').onclick=e=>{const button=e.target.closest('[data-remove-order-item]');if(!button)return;editor.items.splice(Number(button.dataset.removeOrderItem),1);if(!editor.items.length)editor.items.push({name:'',qty:1,unitPrice:null,recipeId:null});renderEditorItems()};
$('#order-form').onsubmit=e=>{e.preventDefault();return action(async()=>{const actor=smith(),items=validateItems(editor.items),input={customer:$('#order-customer').value.trim(),notes:$('#order-notes').value.trim(),items};if(editor.version)await api('/api/orders/'+editor.id,{method:'PATCH',body:JSON.stringify({...input,action:'edit',actor,version:editor.version})});else await api('/api/orders',{method:'POST',body:JSON.stringify({...input,id:editor.id,createdBy:actor})});$('#order-dialog').close();await refresh(true);app.toast('Encomenda salva na oficina compartilhada.');})};
async function update(order,operation,extra={}){await api('/api/orders/'+order.id,{method:'PATCH',body:JSON.stringify({action:operation,actor:smith(),version:order.version,...extra})});await refresh(true)}
$('#order-cards').onclick=e=>{const button=e.target.closest('[data-order-action]');if(!button)return;const order=orders.find(o=>o.id===button.dataset.id);if(!order)return;switch(button.dataset.orderAction){case 'edit':edit(order);break;case 'details':details(order);break;case 'deliver':deliveryId=order.id;$('#delivery-customer').textContent=order.customer;$('#order-maker').value=order.assignedTo||$('#smith-name').value.trim();$('#order-delivery-dialog').showModal();break;case 'start':action(async()=>{await update(order,'start');app.toast('Encomenda assumida. Seu nome ficou registrado.');});break;case 'reopen':action(async()=>{await update(order,'reopen');app.toast('Encomenda reaberta. O histórico de entrega foi preservado.');});break;}};
$('#order-delivery-form').onsubmit=e=>{e.preventDefault();return action(async()=>{const order=orders.find(o=>o.id===deliveryId);if(!order)throw Error('Atualize a lista de encomendas.');await update(order,'deliver',{completedBy:$('#order-maker').value.trim()});$('#order-delivery-dialog').close();app.toast('Entrega registrada com o nome de quem fez.');})};
function details(order){
  const events={created:'Criou a encomenda',edit:'Ajustou a encomenda',start:'Assumiu a produção',deliver:'Registrou a entrega',reopen:'Reabriu a encomenda'};
  $('#order-details').innerHTML=`<span class="order-badge ${esc(order.status)}">${ORDER_STATUSES[order.status]}</span><h3>${esc(order.customer)}</h3><ul class="order-item-list">${order.items.map(item=>`<li><span>${fmt(item.qty)}× ${esc(item.name)}</span><b>${item.unitPrice===null?'A combinar':fmt(item.unitPrice*item.qty)+' S'}</b></li>`).join('')}</ul><div class="order-value"><span>Valor combinado</span><b>${esc(totalLabel(order))}</b></div>${order.notes?`<p class="order-notes">${esc(order.notes)}</p>`:''}<p class="muted">Registrada por ${esc(order.createdBy)}${order.completedBy?`<br>Feito por <strong>${esc(order.completedBy)}</strong><br>Entregue por ${esc(order.deliveredBy)} em ${date(order.completedAt)}`:''}</p><h4>Histórico</h4><ol class="order-history">${(order.events||[]).map(event=>`<li><b>${events[event.type]||esc(event.type)}</b> · ${esc(event.actor)}${event.completedBy?`<br>Feito por ${esc(event.completedBy)}`:''}<small>${date(event.at)}</small></li>`).join('')}</ol>`;$('#order-details-dialog').showModal();
}
window.FORJA_ORDERS={open:()=>refresh(true)};
render();
const fragment=location.hash;
if(fragment.startsWith('#oficina=')){action(async()=>join(parseAccess(fragment))).catch(error=>app.toast(error.message));}else if(room)refresh(false);
setInterval(()=>{if(!document.hidden&&!$('#orders').hidden&&room&&!busy)refresh(false)},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#orders').hidden&&room)refresh(false)});
