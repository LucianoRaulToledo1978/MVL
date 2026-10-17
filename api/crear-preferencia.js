const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const contexto = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(process.cwd(),'productos.js'),'utf8'), contexto, {timeout:1000});
const productos = contexto.window.PRODUCTOS;
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  const salir=(status,error)=>res.status(status).json({error});
  if(req.method!=='POST'){res.setHeader('Allow','POST');return salir(405,'Método no permitido.');}
  const token=process.env.MERCADOPAGO_ACCESS_TOKEN;
  if(!token)return salir(503,'Falta configurar MERCADOPAGO_ACCESS_TOKEN en Vercel.');
  try {
    let body=req.body;
    if(typeof body==='string'){if(body.length>5000)return salir(413,'Solicitud demasiado grande.');body=JSON.parse(body);}
    if(!body || body.entrega!=='retiro')return salir(400,'Esta prueba solo admite retiro en el local.');
    if(!Array.isArray(body.items)||!body.items.length||body.items.length>30)return salir(400,'Carrito inválido.');
    const vistos=new Set();
    const items=[];
    for(const item of body.items){
      if(!item||vistos.has(item.id)||!Number.isInteger(item.cantidad)||item.cantidad<1||item.cantidad>99)return salir(400,'Cantidades inválidas.');
      const p=productos.find(p=>p.id===item.id);
      if(!p||!Number.isFinite(p.precio)||p.precio<=0)return salir(400,'Producto no disponible para pagar.');
      if(['ALM-001','ALM-004','ALM-005','ALM-006'].includes(p.id)&&body.mayor!==true)return salir(400,'Confirmá que sos mayor de 18 años.');
      vistos.add(p.id);items.push({id:p.id,title:p.nombre,description:p.detalle,quantity:item.cantidad,currency_id:'ARS',unit_price:p.precio});
    }
    const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
    const usuario=await fetch('https://api.mercadopago.com/users/me',{headers,signal:AbortSignal.timeout(10000)});
    if(!usuario.ok)return salir(502,'Mercado Pago no validó la credencial. Revisá que sea la de prueba.');
    const cuenta=await usuario.json();
    // Nunca habilitar cobros reales con esta primera integración.
    if(!Array.isArray(cuenta.tags)||!cuenta.tags.includes('test_user'))return salir(403,'La credencial no corresponde a una cuenta de prueba. Los cobros reales están bloqueados.');
    const respuesta=await fetch('https://api.mercadopago.com/checkout/preferences',{
      method:'POST',headers,signal:AbortSignal.timeout(15000),body:JSON.stringify({
        items,external_reference:'MVL-PRUEBA-'+crypto.randomUUID(),
        metadata:{modo:'prueba',entrega:'retiro'},
        expires:true,expiration_date_to:new Date(Date.now()+30*60*1000).toISOString()
      })
    });
    if(!respuesta.ok)return salir(502,'No se pudo abrir el checkout de prueba. Revisá la aplicación y las credenciales de Mercado Pago.');
    const preferencia=await respuesta.json();
    const url=new URL(preferencia.init_point);
    if(url.protocol!=='https:'||!(url.hostname==='mercadopago.com.ar'||url.hostname.endsWith('.mercadopago.com.ar')))return salir(502,'Respuesta de Mercado Pago no válida.');
    return res.status(200).json({url:url.href});
  }catch(error){return salir(502,'No se pudo conectar con Mercado Pago. Intentá nuevamente.');}
};
