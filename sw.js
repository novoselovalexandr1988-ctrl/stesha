var CACHE_NAME = 'stesha-v2';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({type:'window',includeUncontrolled:true}).then(function(list){
      for(var i=0;i<list.length;i++){
        if(list[i].url.indexOf('stesha')!==-1 && 'focus' in list[i]) return list[i].focus();
      }
      if(clients.openWindow) return clients.openWindow('/stesha/');
    })
  );
});

self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Стеша', {
      body: data.body || '',
      icon: 'https://img.icons8.com/?size=192&id=Sawg2D8Sr9wA&format=png&color=000000',
      badge: 'https://img.icons8.com/?size=96&id=Sawg2D8Sr9wA&format=png&color=000000',
      vibrate: [200, 100, 200],
      tag: 'stesha-notify',
      renotify: true
    })
  );
});
