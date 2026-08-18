// Queen Ann Hotel — Service Worker v4
const CACHE='queen-ann-v4';

self.addEventListener('install', e=>{
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    // Xoá cache phiên bản cũ
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await clients.claim();
  })());
});

// Network-first cho trang HTML: luôn lấy bản mới khi có mạng, offline thì dùng cache.
// Nhờ vậy các bản cập nhật code tới máy ngay, không bị kẹt bản cũ trong cache trình duyệt.
self.addEventListener('fetch', e=>{
  const req=e.request;
  if(req.method!=='GET') return;
  let url;
  try{ url=new URL(req.url); }catch(_){ return; }
  if(url.origin!==self.location.origin) return;   // chỉ xử lý cùng máy chủ
  const isDoc = req.mode==='navigate' || (req.headers.get('accept')||'').includes('text/html') || url.pathname.endsWith('/Index.html');
  if(!isDoc) return;   // tài nguyên khác: để trình duyệt xử lý mặc định
  e.respondWith((async()=>{
    try{
      const res=await fetch(req, {cache:'no-store'});
      if(res && res.ok){ try{ const c=res.clone(); const cache=await caches.open(CACHE); await cache.put(req, c); }catch(_){} }
      return res;
    }catch(err){
      const cached=await caches.match(req) || await caches.match('/hotel/Index.html');
      if(cached) return cached;
      throw err;
    }
  })());
});

// Nhận push notification từ server (hoặc tự trigger từ app)
self.addEventListener('push', e=>{
  const data = e.data ? e.data.json() : {};
  const title = data.title || 'Queen Ann Hotel';
  const options = {
    body: data.body || 'Có thông báo mới',
    icon: '/hotel/icon.png',
    badge: '/hotel/icon.png',
    tag: data.tag || 'queen-ann',
    data: { url: data.url || '/hotel/Index.html' },
    requireInteraction: true,
    vibrate: [200, 100, 200],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

// Bấm vào notification → mở app
self.addEventListener('notificationclick', e=>{
  e.notification.close();
  const url = e.notification.data?.url || '/hotel/Index.html';
  e.waitUntil(clients.openWindow(url));
});

// Hàm gửi notification cục bộ (không cần server)
// App sẽ gọi qua postMessage
self.addEventListener('message', e=>{
  if(e.data?.type === 'LOCAL_NOTIFY'){
    const {title, body, tag} = e.data;
    self.registration.showNotification(title || 'Queen Ann Hotel', {
      body: body || '',
      tag: tag || 'local',
      icon: '/hotel/icon.png',
      requireInteraction: false,
      vibrate: [100, 50, 100],
    });
  }
});
