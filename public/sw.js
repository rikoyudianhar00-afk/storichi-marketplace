self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  event.waitUntil((async () => {
    let payload = {};
    try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text() || "Pesan chat baru" }; }

    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const hasVisibleWindow = windows.some((client) => client.visibilityState === "visible");
    if (hasVisibleWindow) return;

    const title = payload.title || "Pesan baru di Storichi";
    const options = {
      body: payload.body || "Kamu menerima pesan chat baru.",
      icon: payload.icon || "/favicon.svg",
      badge: payload.badge || "/favicon.svg",
      tag: payload.notificationId ? `storichi-chat-${payload.notificationId}` : `storichi-chat-${payload.threadId || "message"}`,
      renotify: false,
      data: { url: payload.url || (payload.threadId ? `/chat/${payload.threadId}` : "/chat") },
    };
    await self.registration.showNotification(title, options);
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/chat", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
