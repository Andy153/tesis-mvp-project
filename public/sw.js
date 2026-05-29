/* Trazá — Service worker mínimo (solo Web Push, sin cache offline) */

function assetUrl(path) {
  return new URL(path, self.location.origin).href;
}

function parsePushPayload(event) {
  const defaults = {
    title: 'Trazá',
    body: 'Tenés un aviso nuevo',
    icon: assetUrl('/icons/icon-192x192.png'),
    badge: assetUrl('/icons/icon-192x192.png'),
    tag: 'traza-notification',
    data: { url: '/?view=alerts' },
  };

  if (!event.data) {
    return defaults;
  }

  try {
    const parsed = event.data.json();
    return {
      title: parsed.title || defaults.title,
      body: parsed.body || defaults.body,
      icon: parsed.icon ? assetUrl(parsed.icon) : defaults.icon,
      badge: parsed.badge ? assetUrl(parsed.badge) : defaults.badge,
      tag: parsed.tag || defaults.tag,
      data: parsed.data || defaults.data,
    };
  } catch {
    /* DevTools "Push" suele enviar texto plano, no JSON */
  }

  try {
    const text = event.data.text();
    if (text) {
      return {
        ...defaults,
        body: text,
      };
    }
  } catch {
    /* ignore */
  }

  return defaults;
}

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);

  event.waitUntil(
    self.registration
      .showNotification(payload.title, {
        body: payload.body,
        icon: payload.icon,
        badge: payload.badge,
        tag: payload.tag,
        data: payload.data,
      })
      .catch((err) => {
        console.error('[TRAZA SW] showNotification failed:', err);
      }),
  );
});

function viewFromUrl(url) {
  try {
    const u = new URL(url, self.location.origin);
    const view = u.searchParams.get('view');
    if (view === 'documents' || view === 'alerts' || view === 'dashboard') return view;
  } catch {
    /* ignore */
  }
  return 'alerts';
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || '/?view=alerts';
  const view = viewFromUrl(targetUrl);

  event.waitUntil(
    (async () => {
      const allClients = await clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      for (const client of allClients) {
        if (client.url.startsWith(self.location.origin)) {
          client.postMessage({ type: 'TRAZA_NAVIGATE', view });
          return client.focus();
        }
      }

      return clients.openWindow(new URL(targetUrl, self.location.origin).href);
    })(),
  );
});
