'use strict';
window.FORJA_CATALOG=(()=>{
  const app=window.FORJA_APP;
  let context=null,version=0,ready=false,reading=false,writing=false,generation=0;
  function status(message){document.querySelector('#save-status').textContent=message}
  function accept(data,reset=false){
    version=data.version;ready=true;
    app.applyCatalog(data.catalog,version,reset);
    status(`Compartilhado · ${context.room.name}${data.updatedBy?' · '+data.updatedBy:''}`);
  }
  async function connect(next){
    const ticket=++generation;context=next;ready=false;version=0;
    app.catalogDisconnected();status('Conectando catálogo da oficina…');
    let data=await next.api('/api/catalog');
    if(!data.catalog)data=await next.api('/api/catalog',{method:'POST',body:JSON.stringify({catalog:app.getLegacyCatalog(),actor:next.initialActor||'Importação inicial'})});
    if(ticket!==generation)return;
    accept(data,true);
  }
  function disconnect(){generation++;context=null;version=0;ready=false;app.catalogDisconnected();status('Entre em uma oficina para salvar e compartilhar')}
  async function refresh(){
    if(!context||!ready||reading||writing)return;
    reading=true;const active=context,ticket=generation;
    try{const data=await active.api('/api/catalog');if(ticket===generation&&data.version>version)accept(data)}
    catch{if(ticket===generation)status('Sem conexão · alterações ainda não sincronizadas')}
    finally{reading=false}
  }
  async function save(catalog,expected=version){
    if(!context||!ready){app.switchView('orders');throw Error('Entre na oficina em Encomendas para compartilhar receitas e preços.')}
    if(writing)throw Error('Aguarde a alteração anterior terminar.');
    const actor=context.actor(),ticket=generation,active=context;writing=true;status('Salvando na oficina…');
    try{
      const data=await active.api('/api/catalog',{method:'PATCH',body:JSON.stringify({version:expected,catalog,actor})});
      if(ticket!==generation)throw Error('A oficina mudou durante o salvamento. Volte à oficina anterior para conferir.');
      accept(data);return data;
    }catch(error){
      if(ticket===generation)status('Alteração não salva · tente novamente');
      throw error;
    }finally{writing=false}
  }
  document.querySelector('#share-browser-recipes').onclick=async()=>{
    try{if(!ready)throw Error('Entre em uma oficina primeiro.');const merged=app.mergeLegacyCatalog();if(!merged.added){app.toast('As receitas deste navegador já estão no catálogo.');return;}await app.commitCatalog(merged.catalog);app.toast(`${merged.added} registros compartilhados com a oficina.`)}catch(error){app.toast(error.message)}
  };
  document.querySelector('#refresh-catalog').onclick=async()=>{
    if(!ready){app.switchView('orders');app.toast('Entre na oficina para acessar o catálogo compartilhado.');return;}
    await refresh();
  };
  setInterval(()=>{if(!document.hidden)refresh()},20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
  return {connect,disconnect,refresh,save,getVersion:()=>version};
})();
