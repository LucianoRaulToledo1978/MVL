'use strict';
const crypto=require('node:crypto');
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
  }catch(e){return m.response(res,400,{error:e.message==='BODY'?'Solicitud inválida.':e.message});}
  let ref;
  try{
    if(!process.env.MERCADOPAGO_WEBHOOK_SECRET)return m.response(res,503,{error:'Falta configurar la clave del webhook en Vercel.'});
    const collectorId=await m.testSeller();
    const id='MVL-'+crypto.randomBytes(16).toString('hex');
    const acceso=crypto.randomBytes(32).toString('hex');
    const totalCentavos=items.reduce((n,p)=>n+p.quantity*p.unit_price*100,0);
    ref=m.db().collection(m.COLLECTION).doc(id);
    await ref.create({id,modo:'prueba',cliente,items,entrega:'retiro',mayor:data.mayor===true,totalCentavos,moneda:'ARS',collectorId,accesoHash:m.hash(acceso),estadoPago:'pendiente',estadoPedido:'prueba',creadoEn:new Date().toISOString(),pagos:{}});
    const back=m.BASE+'/pago.html?pedido='+id;
    const preference=await m.mp('/checkout/preferences',{method:'POST',body:JSON.stringify({items,external_reference:id,metadata:{modo:'prueba'},back_urls:{success:back,pending:back,failure:back},auto_return:'approved',notification_url:m.BASE+'/api/webhook-mp',expires:true,expiration_date_to:new Date(Date.now()+30*60*1000).toISOString()})});
    const url=new URL(preference.init_point);
    if(url.protocol!=='https:'||!(url.hostname==='mercadopago.com.ar'||url.hostname.endsWith('.mercadopago.com.ar')))throw new Error('CHECKOUT_URL');
    await ref.update({preferenciaId:preference.id,checkoutCreado:true});
    return m.response(res,200,{url:url.href,pedido:id,acceso});
  }catch(e){
    console.error('MVL crear-preferencia:',e.message==='SOLO_PRUEBAS'?'SOLO_PRUEBAS':'CONFIGURACION_O_CONEXION');
    if(ref)try{await ref.update({checkoutError:true});}catch{}
    return m.response(res,503,{error:e.message==='SOLO_PRUEBAS'?'Los cobros reales están bloqueados. Usá la credencial vendedora de prueba.':'No se pudo registrar el pedido o abrir Mercado Pago. Revisá las variables y los registros de Vercel.'});
  }
};
