const C='cal2627-v4';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>e.waitUntil(clients.claim()));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!='GET'||u.origin!=location.origin||u.pathname.startsWith('/api/'))return;
e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(C).then(x=>x.put(e.request,c));return r}).catch(()=>caches.match(e.request)))});

// Recordatorios: recibe la notificación Push enviada por /api/cron-notify y la muestra.
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(err){}
  e.waitUntil(self.registration.showNotification(d.title||'Calendario 26/27',{
    body:d.body||'',icon:'assets/icon-192.png',badge:'assets/icon-192.png',data:{url:d.url||'/'}
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();
  const url=(e.notification.data&&e.notification.data.url)||'/';
  e.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){if(c.url.includes(self.location.origin)&&'focus' in c)return c.focus()}
    if(clients.openWindow)return clients.openWindow(url);
  }));
});
