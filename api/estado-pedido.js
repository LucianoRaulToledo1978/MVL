'use strict';
const m=require('../servidor/mvl.cjs');
module.exports=async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return m.response(res,405,{error:'Método no permitido.'});}
  let d;try{d=m.body(req);}catch{return m.response(res,400,{error:'Solicitud inválida.'});}
  if(!/^MVL-[a-f0-9]{32}$/.test(d.pedido||'')||!/^[a-f0-9]{64}$/.test(d.acceso||''))return m.response(res,404,{error:'Pedido no disponible.'});
  try{
    const snap=await m.db().collection(m.COLLECTION).doc(d.pedido).get();
    if(!snap.exists||!m.equal(snap.data().accesoHash,m.hash(d.acceso)))return m.response(res,404,{error:'Pedido no disponible.'});
    const order=snap.data();
    // No se confía en status/collection_status enviados en la URL de retorno.
    return m.response(res,200,{pedido:order.id,modo:order.modo,estado:order.estadoPago,total:order.totalCentavos/100,confirmacion:order.ultimaConfirmacion||null});
  }catch{return m.response(res,503,{error:'No se pudo consultar el pedido. Intentá nuevamente.'});}
};
