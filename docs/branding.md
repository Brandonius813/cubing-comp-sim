# Cubing Comp Sim branding

Name: **Cubing Comp Sim**. Description: **Simulate a Cubing Competition**.

The owner supplied the approved isometric CCS cube. The SVG master rebuilds its three faces and perspective letters with flat charcoal `#111315` and blue `#8babff`. The dark-background version adds a light outline so the charcoal faces remain visible. The original upload is a reference, not a production dependency.

`public/brand/logo.svg` and `logo-dark.svg` are transparent vector symbols. `header.svg` and `header-dark.svg` combine that symbol with the Geist wordmark on one line. `share.png` is the same horizontal layout on a dark 1200 × 630 canvas. `logo.png` is a transparent 1024 × 1024 export. The app uses the symbol plus live heading text, and hides the wordmark below 1101px to preserve the event selector and utility controls.

Favicons are available as SVG, ICO, and 16/32/48px PNG. Home-screen assets include an Apple 180px icon, 192/512px icons, and a separate 512px maskable icon whose artwork stays within the safe circle. The tiny favicon identifies the cube silhouette; its face letters cannot reliably be read at 16px.

The title, description, canonical URL, Open Graph, Twitter card, icon references, and WebSite structured data are emitted into HTML during the build. Sharing crawlers do not need JavaScript. `VITE_APP_URL` supplies the exact HTTPS origin for environment builds; the default is `https://cubingcompsim.com`. Only that production origin is indexable. Staging gets its own preview URLs plus noindex and a disallowing robots file. The sitemap contains the one public application route. Canonical metadata does not change DNS or redirects.

The service worker includes the generated branding in the existing coherent offline asset set. No browser data is cleared or activation forced.

Raster exports are committed. To regenerate, install ImageMagick and run `node scripts/build-brand-assets.mjs --font /absolute/path/to/Geist-Medium.ttf` with the official font from `https://github.com/vercel/geist-font/tree/main/fonts/Geist/ttf`. The wordmark SVGs embed the existing bundled Geist font; its license is in `public/assets/Geist-OFL.txt`.

Verify with `node --test scripts/site-metadata.test.mjs`, `npm test`, `npm run build`, and `node scripts/branding-check.mjs`. The browser check covers light/dark headers at 320, 375, 768, 1100, 1440, and 2560px, asset availability, preview dimensions, and metadata. Live Discord and search results may retain cached previews after publication.
