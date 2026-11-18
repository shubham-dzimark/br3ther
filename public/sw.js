/* Service worker for admin Web Push. Deliberately minimal: it only shows
   notifications and focuses the admin when one is clicked. */
self.addEventListener("push", (event) => {
  let payload = { title: "Br3thr", body: "", href: "/admin" };
  try {
    payload = { ...payload, ...(event.data ? event.data.json() : {}) };
  } catch {
    // A push with no JSON body still shows the default title.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { href: payload.href },
      tag: "br3thr-admin",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const href = event.notification.data?.href || "/admin";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Reuse an open admin tab rather than piling up new ones.
      for (const client of list) {
        if (client.url.includes("/admin") && "focus" in client) {
          client.navigate(href);
          return client.focus();
        }
      }
      return self.clients.openWindow(href);
    }),
  );
});
