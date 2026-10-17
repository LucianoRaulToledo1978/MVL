'use strict';
const m=require('../servidor/mvl.cjs');
module.exports=async(req,res)=>{
  if(req.method!=='POST'){res.setHeader('Allow','POST');return m.response(res,405,{error:'Método no permitido.'});}
  const id=m.signature(req);
  if(!id){
    let codigo='MP_FIRMA_NO_COINCIDE';
    const secret=process.env.MERCADOPAGO_WEBHOOK_SECRET;
    const query=new URL(req.url,m.BASE).searchParams;
    const ids=query.getAll('data.id');
    const signature=req.headers['x-signature'];
    const requestId=req.headers['x-request-id'];
    if(!secret)codigo='MP_FALTA_SECRET';
    else if(ids.length!==1||!/^\d{1,30}$/.test(ids[0]))codigo='MP_ID_QUERY_AUSENTE_O_INVALIDO';
    else if(typeof signature!=='string'||!signature)codigo='MP_FALTA_X_SIGNATURE';
    else if(typeof requestId!=='string'||!requestId)codigo='MP_FALTA_X_REQUEST_ID';
    else {
      const partes=signature.split(',').map(v=>v.trim());
      const ts=partes.find(v=>v.startsWith('ts='))?.slice(3);
      if(!/^\d{10,16}$/.test(ts||''))codigo='MP_TIMESTAMP_INVALIDO';
      else if(!partes.some(v=>/^v1=[a-fA-F0-9]{64}$/.test(v)))codigo='MP_FORMATO_FIRMA_INVALIDO';
      else if(secret!==secret.trim())codigo='MP_SECRET_CON_ESPACIOS';
    }
    // Solo indicadores: nunca registrar encabezados, firmas, claves ni cuerpo.
    console.warn('MVL webhook diagnóstico:',codigo,JSON.stringify({
      tieneDataIdEnUrl:query.has('data.id'),
      tieneDataIdEnQuery:typeof req.query?.['data.id']==='string',
      tieneFirma:typeof signature==='string'&&signature.length>0,
      tieneRequestId:typeof requestId==='string'&&requestId.length>0
    }));
    return m.response(res,401,{error:'Firma inválida.',diagnostico:codigo});
  }
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
