import {ORDER_STATUSES,validateItems,orderTotal,validateRecipe,recipeQuote} from './order-model.mjs?v=7';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const app=window.FORJA_APP,esc=app.esc,fmt=app.fmt;
const ROOM_KEY='forja-orders-workshop-v1',NAME_KEY='forja-orders-smith-v1',ROOMS_KEY='forja-orders-known-workshops-v1';
let room=null,orders=[],directory=[],directoryLoading=false,editor=null,deliveryId=null,busy=false,loading=false,recipeEditor=null,deleteTarget=null;
const removedRooms=new Set();
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
async function action(fn){if(busy)return;busy=true;$$('#orders button, #order-dialog button, #order-delivery-dialog button, #order-item-recipe-dialog button, #workshop-delete-dialog button').forEach(b=>b.disabled=true);try{await fn()}catch(error){if(error.status===409)await refresh(false);app.toast(error.message)}finally{busy=false;$$('#orders button, #order-dialog button, #order-delivery-dialog button, #order-item-recipe-dialog button, #workshop-delete-dialog button').forEach(b=>b.disabled=false);renderDirectory();syncDeleteButton()}}
function accessCode(access){return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify({id:access.id,key:access.key,name:access.name})))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'')}
function parseAccess(value){
  const code=value.includes('#oficina=')?value.split('#oficina=')[1].split('&')[0]:value.trim();
  let parsed;try{parsed=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(code.replaceAll('-','+').replaceAll('_','/')),char=>char.charCodeAt(0))))}catch{throw Error('Link de oficina inválido.');}
  if(!parsed||typeof parsed.id!=='string'||typeof parsed.key!=='string'||parsed.id.length>80||parsed.key.length>200)throw Error('Link de oficina inválido.');return parsed;
}
async function join(access){const verified=await api('/api/workshops',{},access);room={...access,name:verified.name};saveLocal(ROOM_KEY,JSON.stringify(room));rememberRoom(room);history.replaceState(null,'',location.pathname+location.search);await window.FORJA_CATALOG.connect({room,api:((access)=>(path,options)=>api(path,options,access))(room),actor:smith,initialActor:$('#smith-name').value.trim()});await refresh(true);app.switchView('orders');}
function renderDirectory(){
  const q=$('#workshop-filter').value.trim();
  const available=[...directory,...knownRooms().filter(r=>!directory.some(d=>d.id===r.id))].filter(r=>!removedRooms.has(r.id));
  const rows=available.filter(r=>!q||window.ITEM_SEARCH.matches({name:r.name},q));
  $('#workshop-list').innerHTML=rows.length?rows.map(r=>`<article class="workshop-entry"><div><h3>${esc(r.name)}</h3><small>#${esc(r.id.slice(0,8))}${r.createdAt?' · '+date(r.createdAt):''}</small></div><div class="workshop-entry-actions"><button class="button ${room?.id===r.id?'secondary':'primary'}" data-enter-workshop="${esc(r.id)}" ${room?.id===r.id?'disabled':''}>${room?.id===r.id?'Oficina atual':'Entrar'}</button><button class="text-button workshop-delete" data-delete-workshop="${esc(r.id)}">Excluir</button></div></article>`).join(''):`<p class="fine">${q?'Nenhuma oficina encontrada.':'Nenhuma oficina criada ainda. Crie a primeira abaixo.'}</p>`;
}
async function refreshDirectory(showError=true){
  if(directoryLoading)return;directoryLoading=true;$('#workshops-sync').textContent='Buscando oficinas…';
  try{const data=await api('/api/workshops',{},null);directory=data.workshops.filter(r=>!removedRooms.has(r.id));const ids=new Set(directory.map(r=>r.id));saveLocal(ROOMS_KEY,JSON.stringify(knownRooms().filter(r=>ids.has(r.id))));if(room&&!ids.has(room.id))leaveRoom();$('#workshops-sync').textContent='Oficinas salvas · disponíveis em qualquer computador';renderDirectory()}
  catch(error){$('#workshops-sync').textContent='Não foi possível atualizar as oficinas. Tente novamente.';if(showError)app.toast(error.message)}
  finally{directoryLoading=false}
}
function render(){
  renderDirectory();
  $('#orders-connect').hidden=Boolean(room);$('#orders-board').hidden=!room;$('#new-order').hidden=!room;
  $('#order-count').textContent=orders.filter(o=>o.status!=='delivered').length;
  if(!room)return;
  $('#workshop-name').textContent=room.name;
  $('#pending-orders').textContent=orders.filter(o=>o.status==='pending').length;
  $('#production-orders').textContent=orders.filter(o=>o.status==='in_progress').length;
  $('#ready-orders').textContent=orders.filter(o=>o.status==='ready').length;
  $('#delivered-orders').textContent=orders.filter(o=>o.status==='delivered').length;
  const q=$('#order-filter').value.trim(),status=$('#order-status-filter').value;
  const rows=orders.filter(o=>(!status||o.status===status)&&(!q||window.ITEM_SEARCH.matches({name:[o.customer,o.assignedTo,o.completedBy,...o.items.map(i=>i.name)].filter(Boolean).join(' ')},q)||o.items.some(item=>window.ITEM_SEARCH.matches(item,q))));
  $('#order-cards').innerHTML=rows.length?rows.map(order=>`<article class="card order-card"><div class="order-card-head"><span class="order-badge ${esc(order.status)}">${ORDER_STATUSES[order.status]}</span><small>#${esc(order.id.slice(0,8))}</small></div><h3>${esc(order.customer)}</h3><ul class="order-item-list">${order.items.map((item,index)=>`<li class="order-production-item"><div class="order-item-heading"><span><b>${fmt(item.qty)}×</b> ${esc(item.name)}</span><small>${item.unitPrice===null?'A combinar':fmt(item.unitPrice*item.qty)+' S'}</small></div>${item.productionStatus==='made'?`<small class="item-made">Feito por <strong>${esc(item.madeBy)}</strong>${item.madeAt?' · '+date(item.madeAt):''}</small>`:'<small>Produção pendente</small>'}<div class="order-item-actions">${item.recipe?`<button class="text-button" data-order-action="recipe" data-id="${esc(order.id)}" data-item-index="${index}">${item.productionStatus==='made'?'Ver materiais':'Editar materiais'}</button>`:order.status!=='delivered'?`<button class="text-button" data-order-action="recipe" data-id="${esc(order.id)}" data-item-index="${index}">Definir materiais e calcular</button>`:''}${order.status!=='delivered'?item.productionStatus==='made'?`<button class="text-button" data-order-action="reopen_item" data-id="${esc(order.id)}" data-item-index="${index}">Reabrir produção</button>`:`<button class="text-button" data-order-action="make_item" data-id="${esc(order.id)}" data-item-index="${index}">Marcar item como feito</button>`:''}</div></li>`).join('')}</ul><div class="order-value"><span>Valor combinado</span><b>${esc(totalLabel(order))}</b></div><p>${order.status==='delivered'?`Feito por <strong>${esc(order.completedBy)}</strong><br>Entregue ao cliente em ${date(order.deliveredAt||order.completedAt)}`:order.status==='ready'?`Pronta para entregar · feita por <strong>${esc(order.completedBy)}</strong>`:order.assignedTo?`Responsável: <strong>${esc(order.assignedTo)}</strong>`:'Aguardando um ferreiro'}<br>Criada em ${date(order.createdAt)}</p><div class="card-actions"><button class="button secondary" data-order-action="details" data-id="${esc(order.id)}">Detalhes</button>${order.status==='delivered'?`<button class="button secondary" data-order-action="reopen" data-id="${esc(order.id)}">Reabrir</button>`:`<button class="button secondary" data-order-action="edit" data-id="${esc(order.id)}">Editar pedido</button>${order.status==='pending'?`<button class="button secondary" data-order-action="start" data-id="${esc(order.id)}">Assumir</button>`:''}${order.status!=='ready'?`<button class="button primary" data-order-action="complete" data-id="${esc(order.id)}">Marcar tudo como feito</button>`:`<button class="button primary" data-order-action="deliver" data-id="${esc(order.id)}">Entregar ao cliente</button>`}`}</div></article>`).join(''):'<div class="empty"><span>▤</span><h3>Nenhuma encomenda por aqui</h3><p>Crie uma encomenda ou ajuste os filtros.</p></div>';
}
async function refresh(showError=true){
  if(!room){render();return}if(loading)return;loading=true;$('#orders-sync').textContent='Atualizando oficina…';
  try{const data=await api('/api/orders');orders=data.orders;$('#orders-sync').textContent='Lista compartilhada · atualizada às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});render()}catch(error){$('#orders-sync').textContent='Sem atualização · tente novamente';if(showError)app.toast(error.message)}finally{loading=false}
}
$('#create-workshop-form').onsubmit=e=>{e.preventDefault();return action(async()=>{const access=await api('/api/workshops',{method:'POST',body:JSON.stringify({name:$('#new-workshop-name').value.trim()})},null);await refreshDirectory(false);await join(access);app.toast('Oficina criada. Agora ela aparece na lista para todos entrarem.');})};
$('#refresh-workshops').onclick=()=>refreshDirectory(true);
$('#workshop-filter').oninput=renderDirectory;
$('#workshop-list').onclick=e=>{const button=e.target.closest('[data-enter-workshop], [data-delete-workshop]');if(!button||button.disabled)return;if(button.dataset.deleteWorkshop){deleteTarget=directory.find(r=>r.id===button.dataset.deleteWorkshop)||knownRooms().find(r=>r.id===button.dataset.deleteWorkshop);if(!deleteTarget)return;$('#delete-workshop-name').textContent=deleteTarget.name;$('#delete-workshop-info').textContent='#'+deleteTarget.id.slice(0,8)+(deleteTarget.createdAt?' · Criada em '+date(deleteTarget.createdAt):'');$('#delete-workshop-confirmation').value='';$('#delete-workshop-password').value='';syncDeleteButton();$('#workshop-delete-dialog').showModal();return;}return action(async()=>{const id=button.dataset.enterWorkshop;if(room?.id===id)return;const access=knownRooms().find(r=>r.id===id)||await api('/api/workshops/'+encodeURIComponent(id)+'/join',{method:'POST'},null);await join(access);app.toast('Você entrou na oficina. Receitas, preços e encomendas carregados.');})};
function leaveRoom(){window.FORJA_CATALOG.disconnect();room=null;orders=[];try{localStorage.removeItem(ROOM_KEY)}catch{}render()}
function syncDeleteButton(){$('#confirm-delete-workshop').disabled=busy||!deleteTarget||$('#delete-workshop-confirmation').value!==deleteTarget.name||!$('#delete-workshop-password').value}
$('#delete-workshop-confirmation').oninput=$('#delete-workshop-password').oninput=syncDeleteButton;
$('#workshop-delete-dialog').addEventListener('close',()=>{$('#delete-workshop-password').value='';deleteTarget=null;syncDeleteButton()});
$('#workshop-delete-form').onsubmit=e=>{e.preventDefault();return action(async()=>{if(!deleteTarget||$('#delete-workshop-confirmation').value!==deleteTarget.name)throw Error('Digite exatamente o nome da oficina para confirmar.');const target=deleteTarget,masterPassword=$('#delete-workshop-password').value;if(!masterPassword)throw Error('Informe a senha master.');try{const access=knownRooms().find(r=>r.id===target.id)||await api('/api/workshops/'+encodeURIComponent(target.id)+'/join',{method:'POST'},null);await api('/api/workshops/'+encodeURIComponent(target.id),{method:'DELETE',body:JSON.stringify({confirmationName:target.name,masterPassword})},access);removedRooms.add(target.id);saveLocal(ROOMS_KEY,JSON.stringify(knownRooms().filter(r=>r.id!==target.id)));directory=directory.filter(r=>r.id!==target.id);if(room?.id===target.id)leaveRoom();$('#workshop-delete-dialog').close();await refreshDirectory(false);app.toast('Oficina excluída da lista.')}finally{$('#delete-workshop-password').value=''}})};
$('#join-workshop-form').onsubmit=e=>{e.preventDefault();return action(async()=>{await join(parseAccess($('#workshop-link').value));app.toast('Você entrou na oficina.');})};
$('#share-workshop').onclick=()=>{if(!room)return;$('#share-workshop-link').value=window.FORGE_PUBLIC_URL+'#oficina='+accessCode(room);$('#workshop-share-dialog').showModal()};
$('#copy-workshop-link').onclick=async()=>{try{await navigator.clipboard.writeText($('#share-workshop-link').value);app.toast('Link copiado. Envie aos ferreiros.')}catch{$('#share-workshop-link').select();app.toast('Selecione e copie o link da oficina.')}};
$('#change-workshop').onclick=()=>{leaveRoom();refreshDirectory(false);app.toast('Escolha uma oficina na lista para entrar.')};
$('#refresh-orders').onclick=()=>action(async()=>{if(!window.FORJA_CATALOG.getVersion())await window.FORJA_CATALOG.connect({room,api:((access)=>(path,options)=>api(path,options,access))(room),actor:smith,initialActor:$('#smith-name').value.trim()});else await window.FORJA_CATALOG.refresh();await refresh(true)});$('#order-filter').oninput=$('#order-status-filter').onchange=render;
function renderEditorItems(){
  $('#order-items').innerHTML=editor.items.map((item,i)=>`<div class="order-editor-item"><label>Item<input data-order-line="${i}" data-order-field="name" list="order-recipe-options" maxlength="120" required value="${esc(item.name)}" placeholder="Nome livre ou receita cadastrada"></label><label>Qtd.<input type="number" min="1" max="1000000" step="1" required data-order-line="${i}" data-order-field="qty" value="${item.qty}"></label><label>Valor unitário (S)<input type="number" min="0" max="1000000000" step="0.01" data-order-line="${i}" data-order-field="unitPrice" value="${item.unitPrice??''}" placeholder="A combinar"></label><button type="button" class="icon-button" data-remove-order-item="${i}" aria-label="Remover item">×</button><button type="button" class="text-button order-editor-recipe" data-edit-order-recipe="${i}">${item.recipe?'Editar materiais e cálculo':'Definir materiais e calcular'}</button></div>`).join('');
  $('#order-editor-total').textContent=totalLabel(editor);
}
function edit(order=null){
  editor=order?structuredClone(order):{id:crypto.randomUUID(),customer:'',notes:'',items:[{id:crypto.randomUUID(),name:'',qty:1,unitPrice:null,recipeId:null}]};
  $('#order-dialog-title').textContent=order?'Editar encomenda':'Criar encomenda';$('#order-customer').value=editor.customer;$('#order-notes').value=editor.notes;
  $('#order-recipe-options').innerHTML=app.getRecipes().flatMap(r=>window.ITEM_SEARCH.aliasesFor(r.name)).map(name=>`<option value="${esc(name)}"></option>`).join('');renderEditorItems();$('#order-dialog').showModal();$('#order-customer').focus();
}
$('#new-order').onclick=()=>{try{smith();edit()}catch(error){app.toast(error.message)}};
$('#add-order-item').onclick=()=>{editor.items.push({id:crypto.randomUUID(),name:'',qty:1,unitPrice:null,recipeId:null});renderEditorItems();$('#order-items input:last-of-type')?.focus()};
$('#order-items').oninput=e=>{const field=e.target.dataset.orderField,index=Number(e.target.dataset.orderLine);if(!field)return;const item=editor.items[index];item[field]=field==='name'?e.target.value:field==='unitPrice'&&e.target.value===''?null:Number(e.target.value);if(field==='unitPrice'){item.recipeId=null;item.priceMode='manual';}$('#order-editor-total').textContent=totalLabel(editor)};
$('#order-items').onchange=e=>{if(e.target.dataset.orderField!=='name')return;const i=Number(e.target.dataset.orderLine),item=editor.items[i],recipe=app.getRecipes().find(r=>window.ITEM_SEARCH.aliasesFor(r.name).some(name=>window.ITEM_SEARCH.normalize(name)===window.ITEM_SEARCH.normalize(item.name)));if(recipe&&item.unitPrice===null){item.unitPrice=Math.round(app.calc(recipe).sale*100)/100;item.recipeId=recipe.id;item.recipe=validateRecipe(recipe);item.priceMode='recipe';renderEditorItems()}};
$('#order-items').onclick=e=>{const recipeButton=e.target.closest('[data-edit-order-recipe]');if(recipeButton){openItemRecipe(null,Number(recipeButton.dataset.editOrderRecipe));return;}const button=e.target.closest('[data-remove-order-item]');if(!button)return;editor.items.splice(Number(button.dataset.removeOrderItem),1);if(!editor.items.length)editor.items.push({id:crypto.randomUUID(),name:'',qty:1,unitPrice:null,recipeId:null});renderEditorItems()};
$('#order-form').onsubmit=e=>{e.preventDefault();return action(async()=>{const actor=smith(),items=validateItems(editor.items),input={customer:$('#order-customer').value.trim(),notes:$('#order-notes').value.trim(),items};if(editor.version)await api('/api/orders/'+editor.id,{method:'PATCH',body:JSON.stringify({...input,action:'edit',actor,version:editor.version})});else await api('/api/orders',{method:'POST',body:JSON.stringify({...input,id:editor.id,createdBy:actor})});$('#order-dialog').close();await refresh(true);app.toast('Encomenda salva na oficina compartilhada.');})};
async function update(order,operation,extra={}){await api('/api/orders/'+order.id,{method:'PATCH',body:JSON.stringify({action:operation,actor:smith(),version:order.version,...extra})});await refresh(true)}
$('#order-cards').onclick=e=>{const button=e.target.closest('[data-order-action]');if(!button)return;const order=orders.find(o=>o.id===button.dataset.id);if(!order)return;const item=order.items[Number(button.dataset.itemIndex)];switch(button.dataset.orderAction){case 'edit':edit(order);break;case 'details':details(order);break;case 'recipe':openItemRecipe(order,Number(button.dataset.itemIndex));break;case 'make_item':return action(async()=>{await update(order,'make_item',{itemId:item.id});app.toast('Item marcado como feito. Seu nome ficou registrado.');});case 'reopen_item':return action(async()=>{await update(order,'reopen_item',{itemId:item.id});app.toast('Produção do item reaberta.');});case 'complete':return action(async()=>{await update(order,'complete');app.toast('Encomenda pronta (craftada). A entrega ao cliente é uma etapa separada.');});case 'deliver':deliveryId=order.id;$('#delivery-customer').textContent=order.customer;$('#order-maker').value=order.completedBy||order.assignedTo||$('#smith-name').value.trim();$('#order-maker').readOnly=order.status==='ready';$('#order-delivery-dialog').showModal();break;case 'start':return action(async()=>{await update(order,'start');app.toast('Encomenda assumida. Seu nome ficou registrado.');});case 'reopen':return action(async()=>{await update(order,'reopen');app.toast('Encomenda reaberta. O histórico foi preservado.');});}};
$('#order-delivery-form').onsubmit=e=>{e.preventDefault();return action(async()=>{const order=orders.find(o=>o.id===deliveryId);if(!order)throw Error('Atualize a lista de encomendas.');await update(order,'deliver',{completedBy:$('#order-maker').value.trim()});$('#order-delivery-dialog').close();app.toast('Entrega registrada com o nome de quem fez.');})};
function details(order){
  const events={created:'Criou a encomenda',edit:'Ajustou a encomenda',start:'Assumiu a produção',deliver:'Registrou a entrega',reopen:'Reabriu a encomenda',edit_item:'Definiu os materiais e recalculou o item',make_item:'Marcou item como feito',complete:'Concluiu a produção',reopen_item:'Reabriu a produção do item'};
  $('#order-details').innerHTML=`<span class="order-badge ${esc(order.status)}">${ORDER_STATUSES[order.status]}</span><h3>${esc(order.customer)}</h3><ul class="order-item-list">${order.items.map(item=>`<li><span>${fmt(item.qty)}× ${esc(item.name)}</span><b>${item.unitPrice===null?'A combinar':fmt(item.unitPrice*item.qty)+' S'}</b></li>`).join('')}</ul><div class="order-value"><span>Valor combinado</span><b>${esc(totalLabel(order))}</b></div>${order.notes?`<p class="order-notes">${esc(order.notes)}</p>`:''}<p class="muted">Registrada por ${esc(order.createdBy)}${order.completedBy?`<br>Feito por <strong>${esc(order.completedBy)}</strong>${order.deliveredBy?`<br>Entregue por ${esc(order.deliveredBy)} em ${date(order.deliveredAt||order.completedAt)}`:''}`:''}</p><h4>Histórico</h4><ol class="order-history">${(order.events||[]).map(event=>`<li><b>${events[event.type]||esc(event.type)}</b> · ${esc(event.actor)}${event.itemName?`<br>Item: ${esc(event.itemName)}`:''}${event.completedBy?`<br>Feito por ${esc(event.completedBy)}`:''}<small>${date(event.at)}</small></li>`).join('')}</ol>`;$('#order-details-dialog').showModal();
}
function openItemRecipe(order,index){
  const item=(order||editor)?.items[index];if(!item?.name.trim()){app.toast('Informe o nome do item primeiro.');return;}
  const known=app.getRecipes().find(r=>r.id===item.recipeId),recipe=structuredClone(item.recipe||known||{name:item.name,category:'Outros',output:1,labourPct:15,extra:0,markup:0,round:0,lines:[]});
  const readOnly=item.productionStatus==='made'||order?.status==='delivered';
  recipe.name=item.name;
  if(!readOnly)for(const line of recipe.lines){const material=app.getMaterials().find(m=>m.id===line.materialId);if(material){line.price=material.price;line.name=material.name;line.vendor=material.vendor;}}
  recipeEditor={order,index,itemId:item.id||'item-'+index,orderedQty:item.qty,recipe,readOnly};
  $('#order-recipe-item-name').textContent=item.name;
  $('#order-recipe-category').innerHTML=[...new Set([...app.getCategories(),recipe.category])].map(category=>`<option value="${esc(category)}" ${category===recipe.category?'selected':''}>${esc(category)}</option>`).join('');
  for(const [id,field] of [['output','output'],['labour','labourPct'],['extra','extra'],['markup','markup'],['round','round']])$('#order-recipe-'+id).value=recipe[field]||0;
  $('#order-recipe-save-local').checked=false;$('#order-recipe-search').value='';$('#order-recipe-results').hidden=true;
  $$('#order-item-recipe-form input, #order-item-recipe-form select').forEach(input=>input.disabled=readOnly);
  $('#add-free-order-material').disabled=readOnly;$('#apply-order-recipe').hidden=readOnly;$('#order-recipe-local-option').hidden=readOnly;
  renderRecipeMaterials();$('#order-item-recipe-dialog').showModal();
}
function readItemRecipe(){
  const recipe=recipeEditor.recipe;
  recipe.category=$('#order-recipe-category').value;
  for(const [id,field] of [['output','output'],['labour','labourPct'],['extra','extra'],['markup','markup'],['round','round']])recipe[field]=Number($('#order-recipe-'+id).value);
  const quote=recipeQuote({...recipe,output:Math.max(1,recipe.output)});
  $('#order-recipe-material-cost').textContent=fmt(quote.materials)+' S';$('#order-recipe-labour-cost').textContent=fmt(quote.labour)+' S';$('#order-recipe-unit-price').textContent=fmt(quote.sale)+' S';$('#order-recipe-total-price').textContent=fmt(quote.sale*recipeEditor.orderedQty)+' S';
}
function renderRecipeMaterials(){
  $('#order-recipe-lines').innerHTML=recipeEditor.recipe.lines.map((line,index)=>`<tr><td><input required maxlength="120" data-recipe-line="${index}" data-recipe-field="name" value="${esc(line.name)}" aria-label="Nome do material" ${recipeEditor.readOnly?'disabled':''}><small>${esc(line.vendor||'Preço informado')}</small></td><td><input type="number" required min="0.01" max="1000000" step="0.01" data-recipe-line="${index}" data-recipe-field="qty" value="${line.qty}" aria-label="Quantidade do material" ${recipeEditor.readOnly?'disabled':''}></td><td><input type="number" required min="0" step="0.01" data-recipe-line="${index}" data-recipe-field="price" value="${line.price}" aria-label="Preço do material" ${recipeEditor.readOnly?'disabled':''}></td><td>${recipeEditor.readOnly?'':`<button type="button" class="icon-button" data-remove-recipe-line="${index}" aria-label="Remover material">×</button>`}</td></tr>`).join('');
  $('#order-recipe-empty').hidden=Boolean(recipeEditor.recipe.lines.length);readItemRecipe();
}
$('#order-recipe-search').oninput=()=>{
  const query=$('#order-recipe-search').value.trim();$('#order-recipe-results').hidden=!query;if(!query)return;
  const materials=app.getMaterials().filter(m=>window.ITEM_SEARCH.matches(m,query,['vendor'])).sort((a,b)=>(a.stock===0)-(b.stock===0)||a.price-b.price).slice(0,40);
  $('#order-recipe-results').innerHTML=materials.length?materials.map(m=>`<button type="button" class="result" data-order-material="${esc(m.id)}"><span class="result-name"><b>${esc(m.name)}</b><small>${esc(m.vendor)}</small></span><strong>${fmt(m.price)} S</strong><span>＋</span></button>`).join(''):'<p class="fine">Nenhum material encontrado. Use “Adicionar material livre”.</p>';
};
$('#order-recipe-results').onclick=e=>{
  const button=e.target.closest('[data-order-material]');if(!button||recipeEditor.readOnly)return;
  const material=app.getMaterials().find(m=>m.id===button.dataset.orderMaterial);if(!material)return;
  const existing=recipeEditor.recipe.lines.find(line=>line.materialId===material.id);
  if(existing)existing.qty++;else recipeEditor.recipe.lines.push({materialId:material.id,name:material.name,vendor:material.vendor,qty:1,price:material.price});
  $('#order-recipe-search').value='';$('#order-recipe-results').hidden=true;renderRecipeMaterials();
};
$('#add-free-order-material').onclick=()=>{if(recipeEditor.readOnly)return;recipeEditor.recipe.lines.push({materialId:null,name:'',vendor:'Preço informado',qty:1,price:0});renderRecipeMaterials()};
$('#order-recipe-lines').oninput=e=>{const {recipeLine,recipeField}=e.target.dataset;if(recipeField===undefined||recipeEditor.readOnly)return;recipeEditor.recipe.lines[Number(recipeLine)][recipeField]=recipeField==='name'?e.target.value:Number(e.target.value);readItemRecipe()};
$('#order-recipe-lines').onclick=e=>{const button=e.target.closest('[data-remove-recipe-line]');if(button&&!recipeEditor.readOnly){recipeEditor.recipe.lines.splice(Number(button.dataset.removeRecipeLine),1);renderRecipeMaterials()}};
for(const id of ['output','labour','extra','markup','round'])$('#order-recipe-'+id).oninput=readItemRecipe;
$('#order-item-recipe-form').onsubmit=e=>{e.preventDefault();return action(async()=>{
  if(recipeEditor.readOnly)return;smith();readItemRecipe();const recipe=validateRecipe(recipeEditor.recipe),quote=recipeQuote(recipe),context=recipeEditor;
  if(context.order){await api('/api/orders/'+context.order.id,{method:'PATCH',body:JSON.stringify({action:'edit_item',actor:smith(),version:context.order.version,itemId:context.itemId,recipe})});await refresh(true);}
  else{const item=editor.items[context.index];item.recipe=recipe;item.priceMode='recipe';item.unitPrice=Math.round(quote.sale*100)/100;renderEditorItems();}
  if($('#order-recipe-save-local').checked)await app.saveOrderRecipe(recipe);
  $('#order-item-recipe-dialog').close();app.toast(context.order?'Materiais salvos. Valor do item e da encomenda recalculados.':'Receita aplicada ao item. Salve a encomenda para compartilhar.');
})};
window.FORJA_ORDERS={open:()=>{refreshDirectory(false);refresh(true);window.FORJA_CATALOG.refresh()}};
render();
refreshDirectory(false);
const fragment=location.hash;
if(fragment.startsWith('#oficina=')){action(async()=>join(parseAccess(fragment))).catch(error=>app.toast(error.message));}else if(room)action(async()=>{const access=room;await window.FORJA_CATALOG.connect({room:access,api:(path,options)=>api(path,options,access),actor:smith,initialActor:$('#smith-name').value.trim()});await refresh(false)});
setInterval(()=>{if(!document.hidden&&!busy){refreshDirectory(false);if(!$('#orders').hidden&&room)refresh(false)}},20000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('#orders').hidden){refreshDirectory(false);if(room)refresh(false)}});
