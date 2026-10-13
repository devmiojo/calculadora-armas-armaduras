import {calculate,recalculate} from './pricing-core.mjs';
import {OrderError} from './order-model.mjs';

const text=(value,label,max=120)=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>max)throw new OrderError(`${label} inválido.`);
  return value.trim();
};
const number=(value,label,max=1e9,min=0)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new OrderError(`${label} inválido.`);
  return value;
};
const id=value=>text(value,'Identificador',100);
export function validateCatalog(input){
  if(!input||!Array.isArray(input.materials)||!Array.isArray(input.recipes)||input.materials.length>2000||input.recipes.length>2000)throw new OrderError('Catálogo inválido ou muito grande.');
  const materials=input.materials.map(m=>({id:id(m.id),name:text(m.name,'Nome do material'),vendor:text(m.vendor,'Vendedor'),price:number(m.price,'Preço'),stock:number(m.stock,'Estoque',1e6),...(m.pricingRecipeId?{pricingRecipeId:id(m.pricingRecipeId)}:{})}));
  const recipes=input.recipes.map(r=>{
    if(!Array.isArray(r.lines)||!r.lines.length||r.lines.length>100)throw new OrderError('Adicione de 1 a 100 materiais por receita.');
    const output=number(r.output,'Produção',1e6,1);if(!Number.isInteger(output))throw new OrderError('Produção deve ser inteira.');
    return {id:id(r.id),name:text(r.name,'Nome da receita'),category:text(r.category,'Categoria',80),output,extra:number(r.extra,'Outros custos'),labourPct:number(r.labourPct??0,'Mão de obra',1000),markup:number(r.markup,'Lucro',1000),round:number(r.round,'Arredondamento'),lines:r.lines.map(l=>({materialId:l.materialId?id(l.materialId):null,name:text(l.name,'Nome do ingrediente'),vendor:text(l.vendor,'Vendedor'),qty:number(l.qty,'Quantidade',1e6,.01),price:number(l.price,'Preço do ingrediente'),...(l.manualPrice?{manualPrice:true}:{})}))};
  });
  for(const rows of [materials,recipes])if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new OrderError('Identificadores duplicados no catálogo.');
  const recipeIds=new Set(recipes.map(r=>r.id));
  for(const m of materials)if(m.pricingRecipeId&&!recipeIds.has(m.pricingRecipeId))throw new OrderError('Receita de preço não encontrada.');
  const catalog={materials,recipes};
  try{recalculate(catalog)}catch(error){throw new OrderError(error.message)}
  if(materials.some(m=>!Number.isFinite(m.price)||m.price>1e9)||recipes.some(r=>!Number.isFinite(calculate(r).sale)||calculate(r).sale>1e9))throw new OrderError('O preço calculado ultrapassa o limite.');
  return catalog;
}
