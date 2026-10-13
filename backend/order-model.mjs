export const ORDER_STATUSES = {pending:'Pendente', in_progress:'Em produção', ready:'Pronta (craftada)', delivered:'Entregue'};
export class OrderError extends Error {
  constructor(message, status=400){super(message);this.status=status;}
}
const text=(value,label,max=120,required=true)=>{
  const result=typeof value==='string'?value.trim():'';
  if((required&&!result)||result.length>max)throw new OrderError(`Preencha ${label} com até ${max} caracteres.`);
  return result;
};
export function recipeQuote(recipe){
  const materials=recipe.lines.reduce((sum,line)=>sum+line.qty*line.price,0),labour=materials*recipe.labourPct/100,total=materials+labour+recipe.extra,unit=total/recipe.output,raw=unit*(1+recipe.markup/100);
  const sale=Math.max(0,recipe.round?Math.ceil((raw-1e-9)/recipe.round)*recipe.round:raw);
  return {materials,labour,total,unit,sale};
}
export function validateRecipe(recipe){
  if(!recipe||!Array.isArray(recipe.lines)||!recipe.lines.length||recipe.lines.length>100)throw new OrderError('Adicione os materiais necessários para fazer este item.');
  const result={name:text(recipe.name,'o nome da receita'),category:text(recipe.category||'Outros','a categoria'),output:recipe.output,labourPct:recipe.labourPct??15,extra:recipe.extra??0,markup:recipe.markup??0,round:recipe.round??0};
  if(!Number.isSafeInteger(result.output)||result.output<1||result.output>1000000)throw new OrderError('Informe quantas unidades a receita produz.');
  for(const field of ['labourPct','extra','markup','round'])if(!Number.isFinite(result[field])||result[field]<0||result[field]>1000000000)throw new OrderError('Custos e percentuais da receita devem ser valores válidos.');
  if(result.labourPct>1000||result.markup>1000)throw new OrderError('O percentual máximo é 1000%.');
  result.lines=recipe.lines.map(line=>{
    if(!Number.isFinite(line.qty)||line.qty<=0||line.qty>1000000||!Number.isFinite(line.price)||line.price<0||line.price>1000000000)throw new OrderError('Informe quantidades e preços válidos para os materiais.');
    return {materialId:typeof line.materialId==='string'?line.materialId.slice(0,80):null,name:text(line.name,'o nome do material'),vendor:text(line.vendor||'Preço informado','o fornecedor'),qty:line.qty,price:Math.round(line.price*100)/100};
  });
  if(recipeQuote(result).sale>1000000000)throw new OrderError('O valor calculado do item excede o limite.');
  return result;
}
export function validateItems(items){
  if(!Array.isArray(items)||!items.length||items.length>100)throw new OrderError('Inclua entre 1 e 100 itens.');
  const ids=new Set();
  return items.map((item,index)=>{
    const name=text(item?.name,'o nome do item');
    if(!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>1000000)throw new OrderError('A quantidade deve ser um inteiro maior que zero.');
    const recipe=item.recipe?validateRecipe(item.recipe):null,priceMode=recipe&&item.priceMode!=='manual'?'recipe':'manual';
    let unitPrice=priceMode==='recipe'?recipeQuote(recipe).sale:item.unitPrice;
    if(unitPrice!==null){if(!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1000000000)throw new OrderError('Informe um valor válido ou deixe o preço a combinar.');unitPrice=Math.round(unitPrice*100)/100;}
    const id=typeof item.id==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(item.id)?item.id:'item-'+index;
    if(ids.has(id))throw new OrderError('Os itens precisam de identificadores diferentes.');ids.add(id);
    return {id,name,qty:item.qty,unitPrice,recipeId:typeof item.recipeId==='string'?item.recipeId.slice(0,80):null,recipe,priceMode};
  });
}
export function normalizeOrder(current){
  const order=structuredClone(current);
  order.items=validateItems(order.items).map((item,index)=>{
    const old=current.items[index],made=old.productionStatus==='made'||current.status==='ready'||current.status==='delivered';
    return {...item,productionStatus:made?'made':'pending',madeBy:made?(old.madeBy||current.completedBy||current.assignedTo||current.createdBy):null,madeAt:made?(old.madeAt||current.completedAt||null):null};
  });
  order.deliveredAt=current.deliveredAt||(current.status==='delivered'?current.completedAt:null);
  return order;
}
function summarizeProduction(order,now){
  if(order.items.every(item=>item.productionStatus==='made')){
    order.status='ready';order.completedBy=[...new Set(order.items.map(item=>item.madeBy))].join(', ');order.completedAt=now;
  }else{order.status=order.assignedTo||order.items.some(item=>item.productionStatus==='made')?'in_progress':'pending';order.completedBy=null;order.completedAt=null;}
}
export function orderTotal(order){
  return {value:Math.round(order.items.reduce((sum,item)=>sum+(item.unitPrice??0)*item.qty,0)*100)/100,hasUnpriced:order.items.some(item=>item.unitPrice===null)};
}
export function createOrder(input,now=new Date().toISOString()){
  const createdBy=text(input.createdBy,'quem está registrando a encomenda');
  return {customer:text(input.customer,'o cliente'),notes:text(input.notes,'as observações',2000,false),items:validateItems(input.items).map(item=>({...item,productionStatus:'pending',madeBy:null,madeAt:null})),status:'pending',createdBy,assignedTo:null,completedBy:null,deliveredBy:null,completedAt:null,deliveredAt:null,events:[{type:'created',actor:createdBy,at:now}]};
}
export function changeOrder(current,input,now=new Date().toISOString()){
  const actor=text(input.actor,'o nome do ferreiro');
  const order=normalizeOrder(current);
  let event={type:input.action,actor,at:now};
  switch(input.action){
    case 'edit':
      if(order.status==='delivered')throw new OrderError('Reabra a encomenda antes de editar.',409);
      {const items=validateItems(input.items);for(const old of order.items.filter(item=>item.productionStatus==='made')){const updated=items.find(item=>item.id===old.id);const original=validateItems([old])[0];if(!updated||JSON.stringify(updated)!==JSON.stringify(original))throw new OrderError('Reabra a produção do item feito antes de alterá-lo.',409);}order.items=items.map(item=>{const old=order.items.find(old=>old.id===item.id);return {...item,productionStatus:old?.productionStatus||'pending',madeBy:old?.madeBy||null,madeAt:old?.madeAt||null}});order.customer=text(input.customer,'o cliente');order.notes=text(input.notes,'as observações',2000,false);if(order.status==='ready'&&!order.items.every(item=>item.productionStatus==='made'))summarizeProduction(order,now);break;}
    case 'edit_item':
      if(order.status==='delivered')throw new OrderError('Reabra a encomenda antes de editar.',409);
      {const item=order.items.find(item=>item.id===input.itemId);if(!item)throw new OrderError('Item não encontrado.',404);if(item.productionStatus==='made')throw new OrderError('Reabra a produção deste item antes de alterar seus materiais.',409);item.recipe=validateRecipe({...input.recipe,name:item.name});item.unitPrice=Math.round(recipeQuote(item.recipe).sale*100)/100;item.priceMode='recipe';event.itemName=item.name;break;}
    case 'make_item':
      if(order.status==='delivered')throw new OrderError('Esta encomenda já foi entregue.',409);
      {const item=order.items.find(item=>item.id===input.itemId);if(!item)throw new OrderError('Item não encontrado.',404);if(item.productionStatus==='made')throw new OrderError('Este item já está feito.',409);item.productionStatus='made';item.madeBy=actor;item.madeAt=now;event.itemName=item.name;event.completedBy=actor;summarizeProduction(order,now);break;}
    case 'complete':
      if(order.status==='ready'||order.status==='delivered')throw new OrderError('Esta encomenda já está feita.',409);
      for(const item of order.items)if(item.productionStatus!=='made'){item.productionStatus='made';item.madeBy=actor;item.madeAt=now;}summarizeProduction(order,now);event.completedBy=order.completedBy;break;
    case 'reopen_item':
      if(order.status==='delivered')throw new OrderError('Reabra a encomenda entregue antes de reabrir um item.',409);
      {const item=order.items.find(item=>item.id===input.itemId);if(!item)throw new OrderError('Item não encontrado.',404);if(item.productionStatus!=='made')throw new OrderError('Este item já está aberto.',409);event.itemName=item.name;event.completedBy=item.madeBy;item.productionStatus='pending';item.madeBy=null;item.madeAt=null;summarizeProduction(order,now);break;}
    case 'start':
      if(order.status!=='pending')throw new OrderError('Esta encomenda já foi assumida ou entregue. Atualize a lista.',409);
      order.status='in_progress';order.assignedTo=actor;break;
    case 'deliver':
      if(order.status==='delivered')throw new OrderError('Esta encomenda já foi entregue. Atualize a lista.',409);
      if(order.status!=='ready')throw new OrderError('Marque a produção como pronta (craftada) antes de registrar a entrega.',409);
      order.status='delivered';order.deliveredBy=actor;order.deliveredAt=now;event.completedBy=order.completedBy;break;
    case 'reopen':
      if(order.status!=='delivered'&&order.status!=='ready')throw new OrderError('Esta encomenda já está aberta.',409);
      order.status='pending';order.assignedTo=null;order.completedBy=null;order.deliveredBy=null;order.completedAt=null;order.deliveredAt=null;for(const item of order.items){item.productionStatus='pending';item.madeBy=null;item.madeAt=null;}break;
    default:throw new OrderError('Ação de encomenda inválida.');
  }
  order.events=[...(order.events||[]),event].slice(-100);
  return order;
}
