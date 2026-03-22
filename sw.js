var CACHE_NAME = 'stesha-v4';

var APP_SHELL = [
  '/stesha/',
  '/stesha/index.html',
  '/stesha/manifest.json'
];

var FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Unbounded:wght@400;600;700&display=swap'
];

var ICON_URLS = [
  'https://img.icons8.com/?size=180&id=Sawg2D8Sr9wA&format=png&color=000000',
  'https://img.icons8.com/?size=192&id=Sawg2D8Sr9wA&format=png&color=000000',
  'https://img.icons8.com/?size=96&id=Sawg2D8Sr9wA&format=png&color=000000'
];

// Режимы API которые можно кэшировать (только read-only)
var CACHEABLE_MODES = ['history', 'refresh', 'notes'];

function isCacheableApiRequest(url) {
  if (url.indexOf('script.google.com') === -1) return false;
  for (var i = 0; i < CACHEABLE_MODES.length; i++) {
    if (url.indexOf('mode=' + CACHEABLE_MODES[i]) !== -1) return true;
  }
  // Запрос без mode= — это history по умолчанию
  if (url.indexOf('mode=') === -1 && url.indexOf('script.google.com') !== -1) return true;
  return false;
}

function isWriteApiRequest(url) {
  return url.indexOf('script.google.com') !== -1 && !isCacheableApiRequest(url);
}

// ── INSTALL ──
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      // Кэшируем app shell — обязательно
      return cache.addAll(APP_SHELL)
        .then(function() {
          // Кэшируем шрифты и иконки — опционально, не блокируем install
          var optionals = FONT_URLS.concat(ICON_URLS);
          return Promise.all(optionals.map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Optional cache failed:', url, err);
            });
          }));
        })
        .catch(function(err) {
          console.error('[SW] App shell cache failed:', err);
        });
    })
  );
  self.skipWaiting();
});

// ── ACTIVATE ──
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE_NAME; })
            .map(function(k) {
              console.log('[SW] Deleting old cache:', k);
              return caches.delete(k);
            })
      );
    })
  );
  e.waitUntil(clients.claim());
});

// ── FETCH ──
self.addEventListener('fetch', function(e) {
  var url = e.request.url;

  // 1. Шрифты и иконки — cache-first (меняются редко)
  if (url.indexOf('fonts.googleapis.com') !== -1 ||
      url.indexOf('fonts.gstatic.com') !== -1 ||
      url.indexOf('img.icons8.com') !== -1) {
    e.respondWith(
      caches.match(e.request).then(function(cached) {
        if (cached) return cached;
        return fetch(e.request).then(function(response) {
          if (response && response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
          }
          return response;
        }).catch(function() { return cached; });
      })
    );
    return;
  }

  // 2. Read-only API (history, refresh, notes) — stale-while-revalidate
  if (isCacheableApiRequest(url)) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var fetchPromise = fetch(e.request).then(function(response) {
            if (response && response.ok) {
              cache.put(e.request, response.clone());
            }
            return response;
          }).catch(function() {
            return cached; // fallback на кэш если сеть упала
          });
          // Возвращаем кэш сразу + обновляем в фоне
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Write API (add, edit, delete, device, noteAdd...) — только сеть, не кэшируем
  if (isWriteApiRequest(url)) {
    return; // браузер обработает сам
  }

  // 4. App shell и всё остальное — cache-first с network fallback
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return fetch(e.request).then(function(response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        return cached;
      });
    })
  );
});

// ── NOTIFICATION CLICK ──
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('stesha') !== -1 && 'focus' in list[i]) {
          return list[i].focus();
        }
      }
      if (clients.openWindow) return clients.openWindow('/stesha/');
    })
  );
});

// ── PUSH ──
self.addEventListener('push', function(e) {
  var data = e.data ? e.data.json() : {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Стеша', {
      body:     data.body || '',
      icon:     'https://img.icons8.com/?size=192&id=Sawg2D8Sr9wA&format=png&color=000000',
      badge:    'https://img.icons8.com/?size=96&id=Sawg2D8Sr9wA&format=png&color=000000',
      vibrate:  [200, 100, 200],
      tag:      'stesha-notify',
      renotify: true
    })
  );
});
