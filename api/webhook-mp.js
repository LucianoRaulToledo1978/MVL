'use strict';
const m=require('../servidor/mvl.cjs');
module.exports=async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return m.response(res,405,{error:'Método no permitido.'});}
  const id=m.signature(req);if(!id)return m.response(res,401,{error:'Firma inválida.'});
  let body;try{body=m.body(req);}catch{return m.response(res,400,{error:'Solicitud inválida.'});}
  if(body.type!=='payment')return m.response(res,200,{recibido:true});
  if(String(body.data?.id)!==id)return m.response(res,400,{error:'ID inconsistente.'});
  try{
    const payment=await m.mp('/v1/payments/'+id);
    if(String(payment.id)!==id)return m.response(res,502,{error:'Respuesta inconsistente.'});
    const result=await m.savePayment(payment,'webhook');
    if(result==='mismatch')console.error('MVL webhook: PAGO_NO_COINCIDE');
    return m.response(res,200,{recibido:true});
  }catch(e){
    if(e.httpStatus===404)return m.response(res,200,{recibido:true});
    console.error('MVL webhook: FALLO_DE_VERIFICACION_O_BASE');
    return m.response(res,503,{error:'No se pudo verificar. Reintentar.'});
  }
};
