import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    // The published Verify SDK is a UMD bundle with React as a peer. Ensure
    // Vite's dependency prebundle and the app render against one dispatcher.
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    // Keep the browser and SDK on the local origin. Only protocol endpoints
    // belong on the optional phone-facing edge.
    // Allow the stable Compose service name for internal health checks and
    // reverse-proxy deployments without accepting arbitrary Host headers.
    allowedHosts: ['playground-frontend'],
    proxy: {
      '/api': process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
      '/v1/certify': {
        target: process.env.VITE_CERTIFY_PROXY_TARGET || 'http://localhost:8091',
        changeOrigin: false,
        configure: (proxy) => proxy.on('proxyReq', (proxyRequest, request) => {
          const forwarded = request.headers['x-forwarded-proto'];
          const refererScheme = request.headers.referer?.split(':', 1)[0];
          if (request.headers.host) proxyRequest.setHeader('Host', request.headers.host);
          proxyRequest.setHeader('X-Forwarded-Proto', forwarded || refererScheme || 'http');
        }),
      },
      // Certify's public DID document is repaired and served by the BFF. The
      // Certify gateway only proxies /v1/certify/* and returns 404 at this path.
      '/.well-known/did.json': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:4000',
        rewrite: () => '/api/did/certify',
      },
      // Certify's offer identifies the issuer and authorization server at the
      // origin root, so wallets resolve these root well-known URLs after scan.
      '/.well-known/openid-credential-issuer': {
        target: process.env.VITE_CERTIFY_PROXY_TARGET || 'http://localhost:8091',
        rewrite: () => '/v1/certify/.well-known/openid-credential-issuer',
      },
      '/.well-known/oauth-authorization-server': {
        target: process.env.VITE_CERTIFY_PROXY_TARGET || 'http://localhost:8091',
        rewrite: () => '/v1/certify/.well-known/oauth-authorization-server',
      },
      '/v1/verify': process.env.VITE_VERIFY_PROXY_TARGET || 'http://localhost:8096',
      // Keep Mimoto on the same browser origin so the authenticated Inji Web
      // session cookie can be used for read-only wallet status and presentation.
      '/v1/mimoto': process.env.VITE_MIMOTO_PROXY_TARGET || 'http://localhost:8099',
    },
  },
  build: {
    // Mermaid loads its diagram renderers as separate optional chunks. The
    // larger ELK renderer is never part of the playground's initial bundle.
    chunkSizeWarningLimit: 1900,
  },
})
