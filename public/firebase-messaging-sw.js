importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyAjCCqbF1ZG5tjj2h-hvEh3wBgC_JrXEhc",
  authDomain: "gen-lang-client-0068609715.firebaseapp.com",
  projectId: "gen-lang-client-0068609715",
  storageBucket: "gen-lang-client-0068609715.firebasestorage.app",
  messagingSenderId: "854146106742",
  appId: "1:854146106742:web:ddfd42c1f41e8b9063a657"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  const notificationTitle = payload.notification.title || 'Incoming Call';
  const notificationOptions = {
    body: payload.notification.body || 'Someone is calling you.',
    icon: '/icon.svg',
    requireInteraction: true,
    data: {
      url: payload.data?.url || '/'
    }
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const url = event.notification.data.url;
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
