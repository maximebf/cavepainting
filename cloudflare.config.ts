// Assets-only Worker for the static PWA build. Deploy with `npm run deploy`
// (build, then `cf deploy dist`). Credentials come from CLOUDFLARE_API_TOKEN /
// CLOUDFLARE_ACCOUNT_ID in .env.
import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'cavepainting',
    compatibilityDate: '2026-11-01',
    assets: {
      notFoundHandling: 'single-page-application',
    },
    domains: ['cavepainting.play.maximebf.com'],
  },
});
