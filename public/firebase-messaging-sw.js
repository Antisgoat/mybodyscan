/* MyBodyScan background push handler. No Firebase credentials are embedded here. */
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      notification: {
        title: "MyBodyScan",
        body: event.data?.text() || "You have a new update.",
      },
    };
  }
  const notification = payload.notification || payload.data || {};
  const title = String(notification.title || "MyBodyScan");
  const options = {
    body: String(
      notification.body || "Open MyBodyScan to review your progress."
    ),
    icon: "/favicon.svg",
    badge: "/favicon.svg",
    tag: String(notification.tag || payload.data?.tag || "mbs-update"),
    data: {
      url: String(payload.data?.url || notification.click_action || "/home"),
    },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requested = new URL(
    event.notification.data?.url || "/home",
    self.location.origin
  );
  const target =
    requested.origin === self.location.origin
      ? requested.href
      : new URL("/home", self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) =>
          client.url.startsWith(self.location.origin)
        );
        if (existing) {
          existing.navigate(target);
          return existing.focus();
        }
        return self.clients.openWindow(target);
      })
  );
});
