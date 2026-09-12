import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import { readFileSync } from 'fs';

// Read the app version from package.json so LoginPage (and anywhere else) can
// display it via `import.meta.env.VITE_APP_VERSION` — single source of truth,
// no separate constant to keep in sync when bumping semver.
const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

/**
 * The version the app SHOWS: semver plus the moment it was built.
 *
 *   1.0.5.1508261854   ->  1.0.5, built 15-08-26 at 18:54
 *
 * TWO DIFFERENT QUESTIONS, TWO DIFFERENT PARTS. `1.0.5` answers "which feature
 * set is this", and it moves when the product does — by hand, in package.json.
 * The stamp answers "which BUILD am I looking at", and it moves on its own every
 * time one is made. Bumping semver per deploy conflated the two: the number
 * climbed for reasons no user could name, and it still could not tell two
 * deploys of the same feature apart.
 *
 * IT IS ALSO WHAT BUSTS THE PWA CACHE. This string is compiled into the bundle,
 * so a fresh stamp changes the chunk, its hash, and the precache manifest —
 * meaning every build is now guaranteed to look new to the service worker,
 * rather than only the ones somebody remembered to bump.
 *
 * IST, NOT UTC. The build runs on GitHub's runners, which are UTC; stamping
 * that would print a time five and a half hours behind the person reading it
 * off a phone in Mumbai. Shifting the epoch by +05:30 and then reading the UTC
 * fields gives the IST wall clock without depending on the runner's locale or
 * on Intl being present.
 *
 * DDMMYY, matching how a date is written locally, and HHMM in 24h — the whole
 * stamp sorts within a day, which is what it is read for. Drop `HHMM` below if
 * one build a day is ever the norm again.
 */
const IST_OFFSET_MINUTES = 330;
const built = new Date(Date.now() + IST_OFFSET_MINUTES * 60_000);
const pad2 = (n) => String(n).padStart(2, '0');
const BUILD_STAMP =
  pad2(built.getUTCDate()) +
  pad2(built.getUTCMonth() + 1) +
  pad2(built.getUTCFullYear() % 100) +
  pad2(built.getUTCHours()) +
  pad2(built.getUTCMinutes());
const APP_VERSION = `${pkg.version}.${BUILD_STAMP}`;

// The API is mounted under /aksharconnect in both environments, so the proxy
// target carries that prefix (no path rewrite needed — http-proxy appends the
// request path to the target's own path):
//
//   local : http://127.0.0.1:10000/aksharconnect      -> /aksharconnect/api/v1/...
//   live  : https://api.aksharmandal.in/aksharconnect -> /aksharconnect/api/v1/...
//
// The app always calls same-origin `/api/v1/...`; this is what decides where that
// goes. Same-origin in dev also means the HttpOnly refresh cookie needs no CORS.
//
// Local FastAPI docs live at the ROOT even though the endpoints do not:
//   http://127.0.0.1:10000/docs  (spec: /openapi.json, servers: ["/aksharconnect"])
//
// Override per machine in `.env.local`:
//   VITE_API_TARGET=https://api.aksharmandal.in/aksharconnect
export default defineConfig(({ mode }) => {
  // loadEnv reads .env files only; merge process.env so a shell export or CI
  // variable can override without editing a file.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  const target = env.VITE_API_TARGET || 'http://127.0.0.1:10000/aksharconnect';
  console.log(`[api-proxy] /api  ->  ${target}/api`);

  return {
    plugins: [
      react(),
      VitePWA({
        // New deploys apply automatically on next load — no user prompt.
        registerType: 'autoUpdate',
        // Auto-inject the service-worker registration; no code needed in main.jsx.
        injectRegister: 'auto',
        // Disabled in dev: an auto-updating service worker caching the app shell
        // is a reliable source of confusing stale-asset behaviour while working.
        // Flip to `type: 'module'` temporarily if you need to debug the SW itself.
        devOptions: { enabled: false },
        // Extra static files (already in public/) to precache alongside the build.
        includeAssets: ['apple-touch-icon.png'],
        manifest: {
          id: '/aksharconnect/',
          name: 'Akshar Connect',
          short_name: 'Akshar Connect',
          description: 'Akshar Satsang Mandal — community management app.',
          // Served under the /aksharconnect/ base (Apache subpath).
          start_url: '/aksharconnect/',
          scope: '/aksharconnect/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#003158',
          background_color: '#003158',
          icons: [
            { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
            { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          // Precache the app shell (JS/CSS/HTML/fonts/images) for instant loads.
          globPatterns: ['**/*.{js,css,html,svg,png,jpg,jpeg,webp,woff,woff2,ico}'],
          maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
          // SPA offline fallback → client routes resolve to the app shell.
          navigateFallback: '/aksharconnect/index.html',
          // Only same-origin navigations reach navigateFallback, so this matters
          // solely when the API is proxied through this origin (dev, or a
          // same-origin deploy). Harmless but correct to keep either way.
          navigateFallbackDenylist: [/^\/api\//],
          cleanupOutdatedCaches: true,
          clientsClaim: true,
        },
      }),
    ],
    // The app is served from a subpath in production (aksharmandal.in/aksharconnect/).
    base: '/aksharconnect/',
    // Bake semver + build stamp into the bundle as import.meta.env.VITE_APP_VERSION
    // (see APP_VERSION above). One value, so the footer and the Help page can
    // never show two different answers to "which build is this".
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION),
    },
    resolve: {
      // import.meta.dirname, not __dirname: this file is ESM, and Vite's native
      // config loader (the coming default) does not shim the CommonJS globals.
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
    server: {
      port: 3000,
      strictPort: true, // fail loudly rather than silently moving to the next port
      proxy: {
        '/api': {
          target,
          changeOrigin: true,
          secure: true,
          // A remote API scopes the refresh cookie to its own domain; strip that
          // so the browser accepts it on localhost.
          cookieDomainRewrite: '',
          // The backend pins the refresh cookie to
          //   Path=/aksharconnect/api/v1/auth/refresh
          // but through this proxy the browser's own request path is
          //   /api/v1/auth/refresh
          // Those don't match, so without this rewrite the browser stores the
          // cookie and then never sends it — login works, any reload logs you out.
          // Production is unaffected: there the app calls the prefixed path directly.
          cookiePathRewrite: '/',
        },
      },
    },
  };
});
