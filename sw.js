// Queen Ann Hotel — Service Worker v1
const CACHE='queen-ann-v1';

self.addEventListener('install', e=>{
  self.skipWaiting();
});

self.addEventListener('activate', e=>{
  e.waitUntil(clients.claim());
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
