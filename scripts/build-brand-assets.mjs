import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

// Deterministic raster exports of the approved SVG. Supply the official Geist Medium TTF.
const root = resolve(import.meta.dirname, '..');
const publicRoot = resolve(root, 'public');
const fontPath = process.argv[process.argv.indexOf('--font') + 1];
if (!process.argv.includes('--font') || !fontPath) throw new Error('Pass --font /absolute/path/to/Geist-Medium.ttf. ImageMagick must be installed.');
const temporary = await mkdtemp(resolve(tmpdir(), 'ccs-brand-'));
function render(args) {
  if (/\.(png|ico)$/.test(args.at(-1))) args.splice(args.length - 1, 0, '-depth', '8', '-strip');
  const result = spawnSync('magick', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Brand export failed.');
  return result.stdout.trim();
}
const logoPath = resolve(publicRoot, 'brand/logo.svg');
const darkLogoPath = resolve(publicRoot, 'brand/logo-dark.svg');
const raster = resolve(temporary, 'symbol.png');
try {
  render(['-background', 'none', '-density', '192', darkLogoPath, '-resize', '960x1024', raster]);
  for (const size of [16, 32, 48]) {
    render([raster, '-resize', `${size - 2}x${size - 2}`, '-gravity', 'center', '-background', 'none', '-extent', `${size}x${size}`, resolve(publicRoot, `favicon-${size}x${size}.png`)]);
  }
  render([...[16, 32, 48].map(size => resolve(publicRoot, `favicon-${size}x${size}.png`)), resolve(publicRoot, 'favicon.ico')]);
  render(['-background', 'none', '-density', '192', logoPath, '-resize', '960x1024', '-gravity', 'center', '-background', 'none', '-extent', '1024x1024', resolve(publicRoot, 'brand/logo.png')]);
  for (const [name, size, ratio] of [['apple-touch-icon.png', 180, .76], ['brand/icon-192.png', 192, .76], ['brand/icon-512.png', 512, .76], ['brand/icon-maskable-512.png', 512, .56]]) {
    const height = Math.round(size * ratio);
    render([raster, '-resize', `${height}x${height}`, '-gravity', 'center', '-background', '#111315', '-extent', `${size}x${size}`, resolve(publicRoot, name)]);
  }
  const wordmark = resolve(temporary, 'wordmark.png');
  render(['-background', 'none', '-fill', '#eef1f4', '-font', resolve(fontPath), '-pointsize', '64', 'label:Cubing Comp Sim', wordmark]);
  const [textWidth, textHeight] = render([wordmark, '-format', '%w %h', 'info:']).split(' ').map(Number);
  const symbolHeight = 220; const symbolWidth = Math.round(symbolHeight * 772 / 824); const gap = 44;
  const left = Math.round((1200 - symbolWidth - gap - textWidth) / 2);
  const socialSymbol = resolve(temporary, 'social-symbol.png');
  render([raster, '-resize', `${symbolWidth}x${symbolHeight}`, socialSymbol]);
  render(['-size', '1200x630', 'xc:#111315', socialSymbol, '-geometry', `+${left}+${Math.round((630 - symbolHeight) / 2)}`, '-composite', wordmark, '-geometry', `+${left + symbolWidth + gap}+${Math.round((630 - textHeight) / 2)}`, '-composite', resolve(publicRoot, 'brand/share.png')]);
  const logo = await readFile(logoPath, 'utf8'); const darkLogo = await readFile(darkLogoPath, 'utf8');
  const font = (await readFile(resolve(publicRoot, 'assets/geist-variable.woff2'))).toString('base64');
  const content = svg => svg.replace(/<svg[^>]*>/, '').replace('</svg>', '');
  for (const [name, svg, color] of [['header.svg', logo, '#111315'], ['header-dark.svg', darkLogo, '#eef1f4']]) {
    await writeFile(resolve(publicRoot, 'brand', name), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 120" role="img" aria-label="Cubing Comp Sim"><style>@font-face{font-family:CCSGeist;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}</style><g transform="translate(0 2) scale(.14) translate(-72 -44)">${content(svg)}</g><text x="136" y="77" fill="${color}" font-family="CCSGeist,Arial,sans-serif" font-size="52" font-weight="500" letter-spacing="-1">Cubing Comp Sim</text></svg>\n`);
  }
  console.log('Exported logo, wordmarks, sharing image, favicon, and home-screen icons.');
} finally { await rm(temporary, { recursive: true, force: true }); }
