// Registers the service worker once the page has loaded. Kept in its own file so the
// Content-Security-Policy can stay at script-src 'self'.
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {
      // Without the worker the game still runs; only the offline start is lost.
    });
  });
})();
