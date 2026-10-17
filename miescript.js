'use strict';
const $ = id => document.getElementById(id);
const pesos = n => new Intl.NumberFormat('es-AR',{style:'currency',currency:'ARS',maximumFractionDigits:0}).format(n);
const categorias = {almacen:'Almacén',libreria:'Librería',cotillon:'Cotillón',jugueteria:'Juguetería'};
let carrito = {};
try { const guardado=JSON.parse(localStorage.getItem('mvl-carrito-v1') || '{}'); for(const p of PRODUCTOS) if(p.precio !== null && Number.isInteger(guardado[p.id]) && guardado[p.id]>0) carrito[p.id]=Math.min(99,guardado[p.id]); } catch {}
const pagina = document.body.dataset.categoria || '';
$('container-principal').innerHTML = `
<header><a class="marca" href="index.html"><img src="imagenes/logo-mvl.jpg" alt="MVL, tu comercio de confianza"><span>MVL<small>Tu comercio de confianza</small></span></a><button id="abrir-carrito">Carrito <span id="contador">0</span></button></header>
<nav aria-label="Categorías"><a href="index.html">Todo</a>${Object.entries(categorias).map(([k,v])=>`<a href="${k}.html" ${pagina===k?'aria-current="page"':''}>${v}</a>`).join('')}<a href="#contacto">Contacto</a></nav>
<section class="presentacion"><div><p class="etiqueta">VILLA DOMÍNICO · AVELLANEDA</p><h1>Todo cerca.<br>Todo en MVL.</h1><p>Almacén, librería, cotillón y juguetes para todos los días.</p><a class="boton" href="#catalogo">Ver productos</a></div><img src="imagenes/logo-mvl.jpg" alt="Logo MVL"></section>
<div class="servicios"><span>Retiro en Cangallo 4198</span><span>Envíos a Avellaneda, Lanús y Quilmes</span><span>Costo de envío según dirección</span></div>
<section id="catalogo"><div class="titulo-seccion"><h2>${categorias[pagina] || 'Nuestro catálogo'}</h2><span id="resultados"></span></div><div class="filtros"><label>Buscar producto<input id="busqueda" type="search" placeholder="Yerba, cuaderno, bebote…"></label><label>Categoría<select id="categoria"><option value="">Todas</option>${Object.entries(categorias).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label></div><div id="productos" class="productos"></div><p class="nota">Precios en pesos argentinos. Disponibilidad a confirmar. Bebidas alcohólicas: solo para mayores de 18 años.</p></section>
<footer id="contacto"><h2>Estamos cerca tuyo</h2><p>${MVL.direccion}</p><p>Retiro en el local o envío con costo a cotizar según la dirección.</p><div class="acciones"><a class="boton" href="https://wa.me/${MVL.whatsapp}" target="_blank" rel="noopener">WhatsApp · 11 5820-0433</a><a class="boton secundario" href="mailto:${MVL.email}">Escribinos por correo</a></div><p>Transferencia por Mercado Pago · Alias: <strong>${MVL.aliasMercadoPago}</strong>. Confirmá tu pedido y el total antes de transferir.</p><small>© ${new Date().getFullYear()} MVL</small></footer>
<dialog id="carrito"><div class="titulo-seccion"><h2>Tu carrito</h2><button id="cerrar-carrito" aria-label="Cerrar carrito">Cerrar ✕</button></div><div id="items"></div><p class="total">Subtotal de productos: <strong id="subtotal"></strong></p><form id="pedido"><label>Tu nombre<input name="nombre" required maxlength="100" autocomplete="name"></label><label>Tu teléfono<input name="telefono" required maxlength="30" type="tel" autocomplete="tel"></label><label>Entrega<select name="entrega" id="entrega"><option value="retiro">Retiro en el negocio</option><option value="envio">Envío a domicilio</option></select></label><div id="datos-envio" hidden><label>Localidad<select name="localidad">${MVL.zonas.map(z=>`<option>${z}</option>`).join('')}</select></label><label>Dirección de entrega<input name="direccion" id="direccion" maxlength="200" autocomplete="street-address"></label><p class="nota">El envío se cotiza según tu dirección. El subtotal no incluye envío.</p></div><label>Comentarios<textarea name="comentarios" maxlength="500" placeholder="Colores, diseños o indicaciones"></textarea></label><label class="check" id="alcohol" hidden><input type="checkbox" id="mayor">Confirmo que soy mayor de 18 años.</label><p class="nota">Enviá tu solicitud por WhatsApp para confirmar stock, entrega y pago. Abrir WhatsApp no envía el mensaje automáticamente. Podés pagar mediante transferencia a Mercado Pago después de confirmar el pedido.</p><div class="total"><strong>Pago por transferencia · Mercado Pago</strong><p>Alias: <strong id="alias-pago">${MVL.aliasMercadoPago}</strong></p><button type="button" id="copiar-alias">Copiar alias</button><p id="copia-estado" role="status"></p><p class="nota">Primero confirmá stock y total final por WhatsApp, incluido el envío si corresponde. Al transferir, verificá el destinatario y enviá el comprobante al negocio. MVL confirmará la acreditación del pago.</p></div><button class="boton" id="enviar" type="submit">Enviar pedido por WhatsApp</button><p id="estado" role="status"></p></form></dialog><p id="aviso" role="status"></p>`;
$('categoria').value=pagina;
function consultar(p){return `https://wa.me/${MVL.whatsapp}?text=${encodeURIComponent('Hola MVL, quiero consultar por '+p.nombre+'.')}`;}
function mostrar(){ const q=$('busqueda').value.toLocaleLowerCase('es-AR'); const cat=$('categoria').value; const lista=PRODUCTOS.filter(p=>(!cat||p.categoria===cat)&&(p.nombre+' '+p.detalle).toLocaleLowerCase('es-AR').includes(q)); $('resultados').textContent=lista.length+' productos'; $('productos').replaceChildren(); for(const p of lista){const card=document.createElement('article'); card.className='producto'; card.innerHTML=`<img loading="lazy" src="imagenes/${p.imagen}" alt="${p.nombre}"><div class="producto-info"><small>${categorias[p.categoria]}</small><h3>${p.nombre}</h3><p>${p.detalle}</p><strong>${(p.precio===null||p.disponible===false)?'Consultar precio':pesos(p.precio)}</strong>${(p.precio===null||p.disponible===false)?`<a class="boton secundario" href="${consultar(p)}" target="_blank" rel="noopener">Consultar por WhatsApp</a>`:`<button class="boton" data-agregar="${p.id}">Agregar al carrito</button>`}</div>`; $('productos').append(card);} if(!lista.length) $('productos').textContent='No encontramos productos con esa búsqueda.'; }
function guardar(){try{localStorage.setItem('mvl-carrito-v1',JSON.stringify(carrito));}catch{$('estado').textContent='Tu navegador no permite guardar el carrito. Se conservará mientras esta página esté abierta.';} actualizar();}
function actualizar(){let total=0,cantidad=0; $('items').replaceChildren();for(const p of PRODUCTOS){const n=carrito[p.id]||0;if(!n)continue;total+=n*p.precio;cantidad+=n;const fila=document.createElement('div');fila.className='item';const titulo=document.createElement('span');titulo.textContent=p.nombre+' · '+pesos(p.precio);fila.append(titulo);for(const [texto,accion] of [['−','restar'],[String(n),null],['+','sumar'],['Eliminar','eliminar']]){const el=document.createElement(accion?'button':'span');el.textContent=texto;if(accion){el.type='button';el.dataset.accion=accion;el.dataset.id=p.id;el.setAttribute('aria-label',texto+' '+p.nombre);}fila.append(el);} $('items').append(fila);}if(!cantidad)$('items').textContent='Tu carrito está vacío. Elegí productos del catálogo.';$('subtotal').textContent=pesos(total);$('contador').textContent=cantidad;$('enviar').disabled=!cantidad;const alcohol=PRODUCTOS.some(p=>carrito[p.id]&&['ALM-001','ALM-004','ALM-005','ALM-006'].includes(p.id));$('alcohol').hidden=!alcohol;$('mayor').required=alcohol;}
$('productos').addEventListener('click',e=>{const b=e.target.closest('[data-agregar]');if(!b)return;carrito[b.dataset.agregar]=Math.min(99,(carrito[b.dataset.agregar]||0)+1);guardar();$('aviso').textContent='Producto agregado al carrito';});
$('items').addEventListener('click',e=>{const b=e.target.closest('[data-accion]');if(!b)return;const id=b.dataset.id;if(b.dataset.accion==='eliminar')delete carrito[id];else if(b.dataset.accion==='sumar')carrito[id]=Math.min(99,carrito[id]+1);else if(--carrito[id]<=0)delete carrito[id];guardar();});
$('abrir-carrito').onclick=()=>{$('carrito').showModal();$('aviso').textContent='';};$('cerrar-carrito').onclick=()=>$('carrito').close();$('busqueda').oninput=mostrar;$('categoria').onchange=mostrar;
$('entrega').onchange=()=>{const envio=$('entrega').value==='envio';$('datos-envio').hidden=!envio;$('direccion').required=envio;};
$('pedido').onsubmit=e=>{e.preventDefault();if(!Object.keys(carrito).length)return;const d=new FormData(e.target);let total=0;const lineas=['Hola MVL, quiero realizar este pedido:'];for(const p of PRODUCTOS){const n=carrito[p.id]||0;if(n){total+=n*p.precio;lineas.push(`${n} × ${p.nombre} (${p.detalle}) — ${pesos(n*p.precio)}`);}}lineas.push('Subtotal de productos: '+pesos(total),'Nombre: '+d.get('nombre'),'Teléfono: '+d.get('telefono'));if(d.get('entrega')==='envio')lineas.push('Envío a '+d.get('localidad')+': '+d.get('direccion'),'Costo de envío pendiente de cotización.');else lineas.push('Retiro en '+MVL.direccion);if(d.get('comentarios'))lineas.push('Comentarios: '+d.get('comentarios'));if(PRODUCTOS.some(p=>carrito[p.id]&&['ALM-001','ALM-004','ALM-005','ALM-006'].includes(p.id)))lineas.push('Declaro ser mayor de 18 años.');lineas.push('Forma de pago: transferencia a Mercado Pago, alias '+MVL.aliasMercadoPago+'.','Solicito confirmar disponibilidad y total final antes de transferir.');window.open(`https://wa.me/${MVL.whatsapp}?text=${encodeURIComponent(lineas.join('\n'))}`,'_blank','noopener');$('estado').textContent='Revisá y enviá el mensaje en WhatsApp. Tu carrito se conserva; el pedido todavía requiere confirmación del negocio.';};
$('copiar-alias').onclick=async()=>{try{await navigator.clipboard.writeText(MVL.aliasMercadoPago);$('copia-estado').textContent='Alias copiado: '+MVL.aliasMercadoPago;}catch{$('copia-estado').textContent='Copiá manualmente el alias: '+MVL.aliasMercadoPago;}};
mostrar();actualizar();

// El modo lo informa el servidor. Un parámetro en la URL nunca habilita cobros reales.
(async()=>{
 let config;
 try{const r=await fetch('/api/config-pagos');if(!r.ok)return;config=await r.json();}catch{return;}
 const prueba=config.modo==='prueba';
 if(!config.habilitado||prueba&&new URLSearchParams(location.search).get('prueba_mp')!=='1')return;
 const panel=document.createElement('div');
 panel.innerHTML='<p class="nota" id="nota-mp"></p><button type="button" class="boton" id="pagar-mp"></button><p id="estado-mp" role="status"></p>';
 $('pedido').append(panel);
 $('nota-mp').textContent=prueba?'PRUEBA · Usá una cuenta compradora de prueba. No corresponde a una compra real.':'Pago online con Mercado Pago para retiro en Cangallo 4198. Para envíos, solicitá primero la cotización por WhatsApp. Si necesitás un color o diseño específico, consultá disponibilidad antes de pagar.';
 $('pagar-mp').textContent=prueba?'Probar Mercado Pago':'Pagar con Mercado Pago';
 $('pagar-mp').onclick=async()=>{
  const boton=$('pagar-mp'),estado=$('estado-mp');
  if(!$('pedido').reportValidity())return;
  if($('entrega').value!=='retiro'){estado.textContent='El envío requiere cotización previa. Enviá el pedido por WhatsApp para confirmar el total.';return;}
  const items=Object.entries(carrito).map(([id,cantidad])=>({id,cantidad}));
  if(!items.length){estado.textContent='Agregá un producto al carrito.';return;}
  boton.disabled=true;
  estado.textContent=prueba?'Abriendo Mercado Pago de prueba…':'Registrando tu pedido y abriendo Mercado Pago…';
  let redirigiendo=false;
  try{
   const solicitud={items,entrega:'retiro',mayor:$('mayor').checked,nombre:$('pedido').elements.nombre.value,telefono:$('pedido').elements.telefono.value,comentarios:$('pedido').elements.comentarios.value};
   const huella=JSON.stringify({modo:config.modo,...solicitud});
   const random=n=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
   let intento;try{intento=JSON.parse(sessionStorage.getItem('mvl-intento-pago')||'null');}catch{}
   if(!intento||intento.huella!==huella)intento={huella,intento:random(16),acceso:random(32)};
   // Guardar acceso antes de crear el pedido: una falla de almacenamiento no inicia un cobro.
   sessionStorage.setItem('mvl-intento-pago',JSON.stringify(intento));
   sessionStorage.setItem('mvl-acceso-MVL-'+intento.intento,intento.acceso);
   const r=await fetch('/api/crear-preferencia',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...solicitud,intento:intento.intento,acceso:intento.acceso})});
   const datos=await r.json();if(!r.ok)throw new Error(datos.error||'No se pudo iniciar el pago.');
   const url=new URL(datos.url);
   if(url.protocol!=='https:'||!(url.hostname==='mercadopago.com.ar'||url.hostname.endsWith('.mercadopago.com.ar')))throw new Error('No se pudo validar la dirección de pago.');
   redirigiendo=true;location.assign(url.href);
  }catch(error){estado.textContent=error.message||'No se pudo conectar. Reintentá desde este mismo carrito.';}
  finally{if(!redirigiendo)boton.disabled=false;}
 };
})();
