var CACHE_NAME = 'stesha-v5';

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

var CACHEABLE_MODES = ['history', 'refresh', 'notes'];

// Нормализация URL — убираем token чтобы кэш не зависел от него
function normalizeUrl(url) {
  try {
    var u = new URL(url);
    u.searchParams.delete('token');
    return u.toString();
  } catch(e) {
    // fallback для относительных URL
    return url.replace(/([?&])token=[^&]*/g, function(m, sep) {
      return sep === '?' ? '?' : '';
    }).replace(/\?&/, '?').replace(/[?&]$/, '');
  }
}

function isCacheableApiRequest(url) {
  if (url.indexOf('script.google.com') === -1) return false;
  for (var i = 0; i < CACHEABLE_MODES.length; i++) {
    if (url.indexOf('mode=' + CACHEABLE_MODES[i]) !== -1) return true;
  }
  if (url.indexOf('mode=') === -1 && url.indexOf('script.google.com') !== -1) return true;
  return false;
}

function isWriteApiRequest(url) {
  return url.indexOf('script.google.com') !== -1 && !isCacheableApiRequest(url);
}

var OFFLINE_JSON = JSON.stringify({ ok: false, offline: true });

// ── INSTALL ──
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(APP_SHELL)
        .then(function() {
          return Promise.all(FONT_URLS.concat(ICON_URLS).map(function(url) {
            return cache.add(url).catch(function(err) {
              console.warn('[SW] Optional cache failed:', url, err);
            });
          }));
        })
        .catch(function(err) { console.error('[SW] App shell cache failed:', err); });
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
// SW timeout wrapper — защита от зависания GAS
function swFetch(request, ms) {
  ms = ms || 10000;
  return Promise.race([
    fetch(request),
    new Promise(function(_, rej) {
      setTimeout(function() { rej(new Error('SW timeout')); }, ms);
    })
  ]);
}

self.addEventListener('fetch', function(e) {
  var url = e.request.url;
  var normUrl = normalizeUrl(url);

  // 1. Шрифты и иконки — cache-first
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
        }).catch(function() {
          return cached || new Response('', { status: 503 });
        });
      })
    );
    return;
  }

  // 2. Read-only API — stale-while-revalidate с нормализацией URL
  if (isCacheableApiRequest(url)) {
    e.respondWith(
      caches.open(CACHE_NAME).then(function(cache) {
        return cache.match(new Request(normUrl)).then(function(cached) {
          var fetchPromise = swFetch(e.request).then(function(response) {
            if (response && response.ok) {
              cache.put(new Request(normUrl), response.clone());
            }
            return response;
          }).catch(function() {
            return cached || new Response(OFFLINE_JSON, {
              headers: { 'Content-Type': 'application/json' }
            });
          });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // 3. Write API — только сеть, не кэшируем
  if (isWriteApiRequest(url)) {
    e.respondWith(
      swFetch(e.request).catch(function() {
        return new Response(OFFLINE_JSON, {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 4. App shell — cache-first
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      if (cached) return cached;
      return swFetch(e.request).then(function(response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) { cache.put(e.request, clone); });
        }
        return response;
      }).catch(function() {
        return cached || new Response('Offline', { status: 503 });
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
        if (list[i].url.indexOf('stesha') !== -1 && 'focus' in list[i]) return list[i].focus();
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
