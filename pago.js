'use strict';
const pedido=new URLSearchParams(location.search).get('pedido');
let acceso;try{acceso=sessionStorage.getItem('mvl-acceso-'+pedido);}catch{}
const estado=document.getElementById('estado'),detalle=document.getElementById('detalle'),boton=document.getElementById('actualizar');
const textos={pendiente:'Esperando confirmación del pago',pagado:'Pago confirmado',rechazado:'Pago rechazado o cancelado',reembolsado:'Pago reembolsado o con devolución',contracargo:'Pago con contracargo'};
let intentos=0,timer;
async function consultar(){
 clearTimeout(timer);
 if(!pedido||!acceso){estado.textContent='No pudimos identificar tu sesión de compra.';detalle.textContent='Volvé desde la misma ventana en la que iniciaste la compra. Consultá al negocio si necesitás verificar la operación; no vuelvas a pagar por este mensaje.';boton.hidden=true;return;}
 boton.disabled=true;
 try{
  const r=await fetch('/api/estado-pedido',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pedido,acceso})});
  const d=await r.json();if(!r.ok)throw new Error(d.error);
  document.getElementById('modo').textContent=d.modo==='prueba'?'Operación de prueba · No corresponde a un pedido real.':'Retiro en Cangallo 4198, Villa Domínico. Conservá el número de pedido y coordiná con MVL antes de acercarte.';
  document.getElementById('catalogo').href=d.modo==='prueba'?'/?prueba_mp=1':'/';
  estado.textContent=d.estado==='pagado'&&d.modo==='prueba'?'Pago de prueba confirmado':textos[d.estado]||'Estado en revisión';
  if(d.estado==='pagado'){try{const i=JSON.parse(sessionStorage.getItem('mvl-intento-pago')||'null');if(i&&'MVL-'+i.intento===pedido)sessionStorage.removeItem('mvl-intento-pago');}catch{}}
  detalle.textContent='Total: '+new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS'}).format(d.total)+(d.confirmacion==='webhook'?' · Confirmado mediante notificación de Mercado Pago.':'.');
  document.getElementById('referencia').textContent='Pedido: '+pedido;
  if(d.estado==='pendiente'&&++intentos<12)timer=setTimeout(consultar,5000);
 }catch(e){estado.textContent='La confirmación todavía no está disponible.';detalle.textContent=e.message||'Podés actualizar nuevamente.';}
 finally{boton.disabled=false;}
}
boton.onclick=()=>{intentos=0;consultar();};consultar();
