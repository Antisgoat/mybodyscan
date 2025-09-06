export function killServiceWorkers() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations?.().then(rs => rs.forEach(r => r.unregister()));
  }
}
