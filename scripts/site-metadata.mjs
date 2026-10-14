import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const NAME = 'Cubing Comp Sim';
const DESCRIPTION = 'Simulate a Cubing Competition';
const PRODUCTION_ORIGIN = 'https://cubingcompsim.com';
const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

export function siteMetadata(appUrl = PRODUCTION_ORIGIN) {
  const parsed = new URL(appUrl);
  if (parsed.protocol !== 'https:' || parsed.origin !== appUrl || parsed.username || parsed.password) {
    throw new Error('VITE_APP_URL must be an exact HTTPS origin without a trailing slash.');
  }
  const origin = parsed.origin;
  const indexable = origin === PRODUCTION_ORIGIN;
  const url = `${origin}/`;
  const image = `${origin}/brand/share.png`;
  const graph = JSON.stringify({ '@context': 'https://schema.org', '@type': 'WebSite', name: NAME, description: DESCRIPTION, url }).replaceAll('<', '\\u003c');
  return {
    head: [
      `<meta name="description" content="${DESCRIPTION}">`,
      `<meta name="application-name" content="${NAME}">`,
      `<meta name="apple-mobile-web-app-title" content="${NAME}">`,
      `<meta name="robots" content="${indexable ? 'index, follow' : 'noindex, nofollow'}">`,
      `<link rel="canonical" href="${escapeAttribute(url)}">`,
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
      '<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">',
      '<link rel="icon" href="/favicon-32x32.png" type="image/png" sizes="32x32">',
      '<link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">',
      '<link rel="manifest" href="/site.webmanifest">',
      '<meta property="og:type" content="website">',
      `<meta property="og:site_name" content="${NAME}">`,
      `<meta property="og:title" content="${NAME}">`,
      `<meta property="og:description" content="${DESCRIPTION}">`,
      `<meta property="og:url" content="${escapeAttribute(url)}">`,
      `<meta property="og:image" content="${escapeAttribute(image)}">`,
      '<meta property="og:image:type" content="image/png">',
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      '<meta property="og:image:alt" content="CCS cube logo beside Cubing Comp Sim">',
      '<meta name="twitter:card" content="summary_large_image">',
      `<meta name="twitter:title" content="${NAME}">`,
      `<meta name="twitter:description" content="${DESCRIPTION}">`,
      `<meta name="twitter:image" content="${escapeAttribute(image)}">`,
      '<meta name="twitter:image:alt" content="CCS cube logo beside Cubing Comp Sim">',
      `<script type="application/ld+json">${graph}</script>`,
    ].join('\n    '),
    robots: indexable ? `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',
    sitemap: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${escapeAttribute(url)}</loc></url></urlset>\n`,
  };
}

export function siteMetadataPlugin() {
  let metadata;
  let outDir;
  return {
    name: 'ccs-brand-and-metadata',
    configResolved(config) { metadata = siteMetadata(config.env.VITE_APP_URL || PRODUCTION_ORIGIN); outDir = config.build.outDir; },
    transformIndexHtml(html) { return html.replace('<!-- CCS_METADATA -->', metadata.head); },
    writeBundle() {
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'robots.txt'), metadata.robots);
      writeFileSync(join(outDir, 'sitemap.xml'), metadata.sitemap);
    },
  };
}
