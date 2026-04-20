/*!
 * Vendored from gzuidhof/coi-serviceworker (MIT).
 * https://github.com/gzuidhof/coi-serviceworker
 */

let coepCredentialless = false;

if (typeof window === 'undefined') {
  self.addEventListener('install', () => {
    self.skipWaiting();
  });

  self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
  });

  self.addEventListener('message', (event) => {
    if (!event.data) {
      return;
    }
    if (event.data.type === 'deregister') {
      self.registration
        .unregister()
        .then(() => self.clients.matchAll())
        .then((clients) => {
          clients.forEach((client) => {
            client.navigate(client.url);
          });
        });
      return;
    }
    if (event.data.type === 'coepCredentialless') {
      coepCredentialless = event.data.value;
    }
  });

  self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
      return;
    }

    const forwardedRequest =
      coepCredentialless && request.mode === 'no-cors'
        ? new globalThis.Request(request, { credentials: 'omit' })
        : request;

    event.respondWith(
      fetch(forwardedRequest)
        .then((response) => {
          if (response.status === 0) {
            return response;
          }

          const headers = new globalThis.Headers(response.headers);
          headers.set(
            'Cross-Origin-Embedder-Policy',
            coepCredentialless ? 'credentialless' : 'require-corp'
          );
          if (!coepCredentialless) {
            headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
          }
          headers.set('Cross-Origin-Opener-Policy', 'same-origin');

          return new globalThis.Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        })
        .catch((error) => {
          console.error(error);
          throw error;
        })
    );
  });
} else {
  (() => {
    const reloadedBySelf = window.sessionStorage.getItem('coiReloadedBySelf');
    window.sessionStorage.removeItem('coiReloadedBySelf');
    const coepDegrading = reloadedBySelf === 'coepdegrade';

    const coi = {
      shouldRegister: () => !reloadedBySelf,
      shouldDeregister: () => false,
      coepCredentialless: () => true,
      coepDegrade: () => true,
      doReload: () => window.location.reload(),
      quiet: false,
      ...window.coi,
    };

    const { serviceWorker } = navigator;
    const controlling = Boolean(serviceWorker && serviceWorker.controller);

    if (controlling && !window.crossOriginIsolated) {
      window.sessionStorage.setItem('coiCoepHasFailed', 'true');
    }
    const coepHasFailed = window.sessionStorage.getItem('coiCoepHasFailed');

    if (controlling) {
      const reloadToDegrade =
        coi.coepDegrade() && !(coepDegrading || window.crossOriginIsolated);

      serviceWorker.controller.postMessage({
        type: 'coepCredentialless',
        value:
          reloadToDegrade || (coepHasFailed && coi.coepDegrade())
            ? false
            : coi.coepCredentialless(),
      });

      if (reloadToDegrade) {
        if (!coi.quiet) {
          console.log('Reloading page to degrade COEP.');
        }
        window.sessionStorage.setItem('coiReloadedBySelf', 'coepdegrade');
        coi.doReload('coepdegrade');
      }

      if (coi.shouldDeregister()) {
        serviceWorker.controller.postMessage({ type: 'deregister' });
      }
    }

    if (window.crossOriginIsolated !== false || !coi.shouldRegister()) {
      return;
    }
    if (!window.isSecureContext) {
      if (!coi.quiet) {
        console.log('COOP/COEP Service Worker not registered, a secure context is required.');
      }
      return;
    }
    if (!serviceWorker) {
      if (!coi.quiet) {
        console.error(
          'COOP/COEP Service Worker not registered, perhaps due to private mode.'
        );
      }
      return;
    }

    serviceWorker.register(window.document.currentScript.src).then(
      (registration) => {
        if (!coi.quiet) {
          console.log('COOP/COEP Service Worker registered', registration.scope);
        }

        registration.addEventListener('updatefound', () => {
          if (!coi.quiet) {
            console.log(
              'Reloading page to make use of updated COOP/COEP Service Worker.'
            );
          }
          window.sessionStorage.setItem('coiReloadedBySelf', 'updatefound');
          coi.doReload();
        });

        if (registration.active && !serviceWorker.controller) {
          if (!coi.quiet) {
            console.log('Reloading page to make use of COOP/COEP Service Worker.');
          }
          window.sessionStorage.setItem('coiReloadedBySelf', 'notcontrolling');
          coi.doReload();
        }
      },
      (error) => {
        if (!coi.quiet) {
          console.error('COOP/COEP Service Worker failed to register:', error);
        }
      }
    );
  })();
}
