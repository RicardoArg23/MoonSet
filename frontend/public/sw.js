// Service worker mínimo: hace que MoonSet se pueda instalar como app. No guarda nada en caché a propósito:
// los datos y las texturas siempre vienen de la red, así nunca se muestra una versión vieja.
// Si más adelante se quiere modo sin conexión, es acá donde se agrega (y hay que decidir qué cachear y cómo invalidarlo).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {}); // sin respondWith: el navegador hace la petición como siempre
