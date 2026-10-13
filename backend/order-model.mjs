export const ORDER_STATUSES = {pending:'Pendente', in_progress:'Em produção', delivered:'Entregue'};
export class OrderError extends Error {
  constructor(message, status=400){super(message);this.status=status;}
}
const text=(value,label,max=120,required=true)=>{
  const result=typeof value==='string'?value.trim():'';
  if((required&&!result)||result.length>max)throw new OrderError(`Preencha ${label} com até ${max} caracteres.`);
  return result;
};
export function validateItems(items){
  if(!Array.isArray(items)||!items.length||items.length>100)throw new OrderError('Inclua entre 1 e 100 itens.');
  return items.map(item=>{
    const name=text(item?.name,'o nome do item');
    if(!Number.isSafeInteger(item.qty)||item.qty<1||item.qty>1000000)throw new OrderError('A quantidade deve ser um inteiro maior que zero.');
    let unitPrice=item.unitPrice;
    if(unitPrice!==null){if(!Number.isFinite(unitPrice)||unitPrice<0||unitPrice>1000000000)throw new OrderError('Informe um valor válido ou deixe o preço a combinar.');unitPrice=Math.round(unitPrice*100)/100;}
    return {name,qty:item.qty,unitPrice,recipeId:typeof item.recipeId==='string'?item.recipeId.slice(0,80):null};
  });
}
export function orderTotal(order){
  return {value:Math.round(order.items.reduce((sum,item)=>sum+(item.unitPrice??0)*item.qty,0)*100)/100,hasUnpriced:order.items.some(item=>item.unitPrice===null)};
}
export function createOrder(input,now=new Date().toISOString()){
  const createdBy=text(input.createdBy,'quem está registrando a encomenda');
  return {customer:text(input.customer,'o cliente'),notes:text(input.notes,'as observações',2000,false),items:validateItems(input.items),status:'pending',createdBy,assignedTo:null,completedBy:null,deliveredBy:null,completedAt:null,events:[{type:'created',actor:createdBy,at:now}]};
}
export function changeOrder(current,input,now=new Date().toISOString()){
  const actor=text(input.actor,'o nome do ferreiro');
  const order=structuredClone(current);
  let event={type:input.action,actor,at:now};
  switch(input.action){
    case 'edit':
      if(order.status==='delivered')throw new OrderError('Reabra a encomenda antes de editar.',409);
      order.customer=text(input.customer,'o cliente');order.notes=text(input.notes,'as observações',2000,false);order.items=validateItems(input.items);break;
    case 'start':
      if(order.status!=='pending')throw new OrderError('Esta encomenda já foi assumida ou entregue. Atualize a lista.',409);
      order.status='in_progress';order.assignedTo=actor;break;
    case 'deliver':
      if(order.status==='delivered')throw new OrderError('Esta encomenda já foi entregue. Atualize a lista.',409);
      order.status='delivered';order.completedBy=text(input.completedBy,'quem fez os itens');order.deliveredBy=actor;order.completedAt=now;event.completedBy=order.completedBy;break;
    case 'reopen':
      if(order.status!=='delivered')throw new OrderError('Esta encomenda já está aberta.',409);
      order.status='pending';order.assignedTo=null;order.completedBy=null;order.deliveredBy=null;order.completedAt=null;break;
    default:throw new OrderError('Ação de encomenda inválida.');
  }
  order.events=[...(order.events||[]),event].slice(-100);
  return order;
}
