'use strict';
const m=require('../servidor/mvl.cjs');
module.exports=async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return m.response(res,405,{error:'Método no permitido.'});}
  let data,items,cliente;
  try{
    data=m.body(req);items=m.cart(data);
    const nombre=typeof data.nombre==='string'?data.nombre.trim():'';
    const telefono=typeof data.telefono==='string'?data.telefono.trim():'';
    const comentarios=typeof data.comentarios==='string'?data.comentarios.trim():'';
    if(!nombre||nombre.length>100||telefono.replace(/\D/g,'').length<8||telefono.length>30||comentarios.length>500)throw new Error('Completá nombre y teléfono válidos.');
    cliente={nombre,telefono,comentarios};
    if(!/^[a-f0-9]{32}$/.test(data.intento||'')||!/^[a-f0-9]{64}$/.test(data.acceso||''))throw new Error('Actualizá la página e intentá nuevamente.');
  }catch(e){return m.response(res,400,{error:e.message==='BODY'?'Solicitud inválida.':e.message});}
  let ref;
  const started=Date.now();
  let etapa='inicio';
  async function step(name,operation){
    etapa=name;
    const remaining=45000-(Date.now()-started);
    if(remaining<=0){const e=new Error('ESPERA_AGOTADA');e.code='MVL_TIMEOUT';throw e;}
    let timer;
    console.info('MVL checkout etapa:',name);
    try{
      return await Promise.race([
        Promise.resolve().then(operation),
        new Promise((_,reject)=>{timer=setTimeout(()=>{const e=new Error('ESPERA_AGOTADA');e.code='MVL_TIMEOUT';reject(e);},Math.min(remaining,10000));})
      ]);
    }finally{clearTimeout(timer);}
  }
  try{
    if(!process.env.MERCADOPAGO_WEBHOOK_SECRET)return m.response(res,503,{error:'Falta configurar la clave del webhook en Vercel.'});
    const collectorId=await step('verificar_vendedor',()=>m.verifiedSeller());
    const id='MVL-'+data.intento;
    const acceso=data.acceso;
    const solicitudHash=m.hash(JSON.stringify({cliente,items,mayor:data.mayor===true}));
    const totalCentavos=items.reduce((n,p)=>n+p.quantity*p.unit_price*100,0);
    ref=m.db().collection(m.COLLECTION).doc(id);
    try{
      // Recuperar intentos existentes sin provocar un commit que ya sabemos duplicado.
      const prior=await step('leer_intento',()=>ref.get());
      if(prior.exists){const duplicate=new Error('EXISTENTE');duplicate.code=6;throw duplicate;}
      await step('crear_pedido',()=>ref.create({solicitudHash,id,modo:m.MODE,cliente,items,entrega:'retiro',mayor:data.mayor===true,totalCentavos,moneda:'ARS',collectorId,accesoHash:m.hash(acceso),estadoPago:'pendiente',estadoPedido:m.MODE==='prueba'?'prueba':'recibido',creadoEn:new Date().toISOString(),pagos:{}}));}catch(e){
      if(e.code!==6&&e.code!=='already-exists')throw e;
      const existing=await step('recuperar_intento',()=>ref.get()),saved=existing.data();
      if(!saved||saved.collectorId!==collectorId||saved.modo!==m.MODE||!m.equal(saved.accesoHash,m.hash(acceso))||saved.solicitudHash!==solicitudHash)return m.response(res,409,{error:'Este intento no corresponde al carrito. Actualizá la página.'});
      if(saved.estadoPago==='pagado')return m.response(res,409,{error:'Este pedido ya fue pagado. Consultá su confirmación; no vuelvas a pagar.'});
      if(saved.checkoutUrl&&Date.parse(saved.expiraEn)>Date.now())return m.response(res,200,{url:saved.checkoutUrl,pedido:id,acceso,modo:m.MODE});
      return m.response(res,409,{error:'Este pedido ya se inició. Si acabás de pulsar Pagar, esperá unos segundos y reintentá. Si el problema continúa, consultá a MVL antes de volver a pagar.'});
    }
    const back=m.BASE+'/pago.html?pedido='+id;
    const preference=await step('crear_checkout',()=>m.mp('/checkout/preferences',{method:'POST',body:JSON.stringify({items,external_reference:id,metadata:{modo:m.MODE},back_urls:{success:back,pending:back,failure:back},auto_return:'approved',notification_url:m.BASE+'/api/webhook-mp',expires:true,expiration_date_to:new Date(Date.now()+30*60*1000).toISOString()})}));
    const url=new URL(preference.init_point);
    if(url.protocol!=='https:'||!(url.hostname==='mercadopago.com.ar'||url.hostname.endsWith('.mercadopago.com.ar')))throw new Error('CHECKOUT_URL');
    await step('guardar_checkout',()=>ref.update({preferenciaId:preference.id,checkoutCreado:true,checkoutUrl:url.href,expiraEn:new Date(Date.now()+29*60*1000).toISOString()}));
    return m.response(res,200,{url:url.href,pedido:id,acceso,modo:m.MODE});
  }catch(e){
    // No registrar mensajes crudos: pueden contener datos sensibles.
    const code=String(e.code||e.message||'ERROR');
    const safeCode=/^[A-Z_0-9-]{1,50}$/.test(code)?code:'ERROR_SERVICIO';
    console.error('MVL checkout fallo:',JSON.stringify({etapa,codigo:safeCode,http:e.httpStatus||null,duracionMs:Date.now()-started}));
    if(e.code==='MVL_TIMEOUT')return m.response(res,503,{error:'La conexión demoró más de lo esperado. No confirmes otro pago. Esperá unos segundos y reintentá desde este mismo carrito; conservamos el identificador del intento.'});
    return m.response(res,503,{error:e.message==='SOLO_PRUEBAS'?'La cuenta configurada no corresponde al modo de prueba.':'No se pudo registrar el pedido o abrir Mercado Pago. Revisá las variables y los registros de Vercel.'});
  }
};
