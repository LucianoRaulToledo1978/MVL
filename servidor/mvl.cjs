'use strict';
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const BASE='https://mvl-avellaneda.vercel.app';
const MODE=process.env.MERCADOPAGO_MODO||'prueba';
if(!['prueba','produccion'].includes(MODE))throw new Error('MP_MODO_INVALIDO');
const COLLECTION=MODE==='produccion'?'pedidos':'pedidos_prueba';
const ALCOHOL=['ALM-001','ALM-004','ALM-005','ALM-006'];
let firestore;
function db(){
  if(!firestore){
    const {initializeApp,cert}=require('firebase-admin/app');
    const {getFirestore}=require('firebase-admin/firestore');
    const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if(!raw)throw new Error('FIREBASE_CONFIG');
    const credential=JSON.parse(raw);
    const app=initializeApp({credential:cert(credential)},'mvl-pedidos');
    firestore=getFirestore(app);firestore.settings({preferRest:true});
  }
  return firestore;
}
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
function equal(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));}
function body(req){
  let value=req.body;
  if(typeof value==='string'){if(Buffer.byteLength(value)>8000)throw new Error('BODY');value=JSON.parse(value);}
  if(!value||typeof value!=='object'||Buffer.byteLength(JSON.stringify(value))>8000)throw new Error('BODY');
  return value;
}
function catalog(){const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(process.cwd(),'productos.js'),'utf8'),sandbox,{timeout:1000});return sandbox.window.PRODUCTOS;}
function cart(data){
  if(data.entrega!=='retiro')throw new Error('Para pagar un envío primero necesitamos cotizarlo. El pago web admite retiro en el negocio.');
  if(!Array.isArray(data.items)||!data.items.length||data.items.length>30)throw new Error('Carrito inválido.');
  const productos=catalog(),seen=new Set();
  return data.items.map(item=>{
    if(!item||seen.has(item.id)||!Number.isInteger(item.cantidad)||item.cantidad<1||item.cantidad>99)throw new Error('Cantidades inválidas.');
    const p=productos.find(p=>p.id===item.id);
    if(!p||p.disponible===false||!Number.isSafeInteger(p.precio)||p.precio<=0)throw new Error('Producto no disponible para pagar.');
    if(ALCOHOL.includes(p.id)&&data.mayor!==true)throw new Error('Confirmá que sos mayor de 18 años.');
    seen.add(p.id);return {id:p.id,title:p.nombre,description:p.detalle,quantity:item.cantidad,currency_id:'ARS',unit_price:p.precio};
  });
}
async function mp(route,options={}){
  if(!process.env.MERCADOPAGO_ACCESS_TOKEN)throw new Error('MP_CONFIG');
  const r=await fetch('https://api.mercadopago.com'+route,{...options,headers:{Authorization:'Bearer '+process.env.MERCADOPAGO_ACCESS_TOKEN,'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(12000)});
  if(!r.ok){const error=new Error('MP_API');error.httpStatus=r.status;throw error;}
  return r.json();
}
async function verifiedSeller(){
  const seller=await mp('/users/me');
  const id=String(seller.id),isTest=Array.isArray(seller.tags)&&seller.tags.includes('test_user');
  if(!/^\d+$/.test(id)||!Array.isArray(seller.tags))throw new Error('MP_VENDEDOR_INVALIDO');
  if(MODE==='prueba'&&!isTest)throw new Error('SOLO_PRUEBAS');
  if(MODE==='produccion'){
    const expected=process.env.MERCADOPAGO_SELLER_ID;
    if(!expected||!/^\d+$/.test(expected)||id!==expected||isTest)throw new Error('MP_VENDEDOR_INVALIDO');
  }
  return id;
}

function signature(req){
  const secret=process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if(!secret)return false;
  const query=new URL(req.url,BASE).searchParams;
  const ids=query.getAll('data.id');if(ids.length!==1||!/^\d{1,30}$/.test(ids[0]))return false;
  const id=ids[0],requestId=req.headers['x-request-id'],header=req.headers['x-signature'];
  if(typeof requestId!=='string'||!requestId||typeof header!=='string')return false;
  const ts=header.split(',').map(s=>s.trim()).find(s=>s.startsWith('ts='))?.slice(3);
  const v1=header.split(',').map(s=>s.trim()).filter(s=>s.startsWith('v1=')).map(s=>s.slice(3));
  if(!/^\d{10,16}$/.test(ts||''))return false;
  // Las repeticiones auténticas se procesan de forma idempotente con la fecha de la API.
  const expected=crypto.createHmac('sha256',secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return v1.some(value=>/^[a-fA-F0-9]{64}$/.test(value)&&equal(value.toLowerCase(),expected))?id:false;
}
function checkedPayment(payment,order,sellerId){
  // Verificar identidad del vendedor y separar pedidos por ambiente.
  return (MODE!=='produccion'||payment.live_mode===true) && order.modo===MODE && typeof sellerId==='string' && /^\d+$/.test(sellerId) && sellerId===order.collectorId && String(payment.collector_id)===sellerId && payment.currency_id==='ARS' && Number.isFinite(payment.transaction_amount) && Math.round(payment.transaction_amount*100)===order.totalCentavos && payment.external_reference===order.id;
}
async function savePayment(payment,source){
  if(typeof payment.external_reference!=='string'||!/^MVL-[a-f0-9]{32}$/.test(payment.external_reference))return 'ignored';
  const id=String(payment.id);if(!/^\d{1,30}$/.test(id))return 'ignored';
  const updated=Date.parse(payment.date_last_updated);if(!Number.isFinite(updated))throw new Error('PAYMENT_DATE');
  const sellerId=await verifiedSeller();
  const ref=db().collection(COLLECTION).doc(payment.external_reference);
  return db().runTransaction(async tx=>{
    const snap=await tx.get(ref);if(!snap.exists)return 'ignored';
    const order=snap.data();if(!checkedPayment(payment,order,sellerId))return 'mismatch';
    const payments={...(order.pagos||{})};
    if(payments[id]&&payments[id].actualizadoMs>=updated)return 'duplicate';
    // Límite de intentos para mantener acotado el documento.
    if(!payments[id]&&Object.keys(payments).length>=20)throw new Error('PAYMENT_LIMIT');
    payments[id]={estado:payment.status,actualizadoMs:updated,reembolsado:Number(payment.transaction_amount_refunded)||0};
    const all=Object.values(payments);
    let status='pendiente';
    if(all.some(p=>p.estado==='charged_back'))status='contracargo';
    else if(all.some(p=>p.estado==='refunded'||p.reembolsado>0))status='reembolsado';
    else if(all.some(p=>p.estado==='approved'&&p.reembolsado===0))status='pagado';
    else if(all.some(p=>['pending','in_process','authorized','in_mediation'].includes(p.estado)))status='pendiente';
    else if(all.some(p=>['rejected','cancelled'].includes(p.estado)))status='rechazado';
    const states={pagado:'pagado',rechazado:'rechazado',pendiente:'pendiente',contracargo:'contracargo',reembolsado:'reembolsado'};
    tx.update(ref,{pagos:payments,estadoPago:states[status],actualizadoEn:new Date().toISOString(),ultimaConfirmacion:source});
    return status;
  });
}
function response(res,status,payload){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');return res.status(status).json(payload);}
module.exports={BASE,MODE,COLLECTION,ALCOHOL,db,hash,equal,body,cart,mp,verifiedSeller,signature,checkedPayment,savePayment,response};
