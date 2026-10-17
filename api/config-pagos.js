'use strict';
const m=require('../servidor/mvl.cjs');
module.exports=(req,res)=>{
 if(req.method!=='GET'){res.setHeader('Allow','GET');return m.response(res,405,{error:'Método no permitido.'});}
 const habilitado=!!process.env.MERCADOPAGO_ACCESS_TOKEN&&!!process.env.MERCADOPAGO_WEBHOOK_SECRET&&!!process.env.FIREBASE_SERVICE_ACCOUNT_JSON&&(m.MODE==='prueba'||/^\d+$/.test(process.env.MERCADOPAGO_SELLER_ID||''));
 return m.response(res,200,{modo:m.MODE,habilitado});
};
