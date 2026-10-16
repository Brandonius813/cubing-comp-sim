// All translations ship with the site and work from the offline asset cache.
// Never send page text or account data to a translation service at runtime.
(async () => {
  const languages = [['en','English'],['es','Español'],['fr','Français'],['de','Deutsch'],['pl','Polski'],['it','Italiano'],['pt-BR','Português (Brasil)'],['nl','Nederlands'],['ru','Русский'],['uk','Українська'],['tr','Türkçe'],['ja','日本語'],['zh-Hans','简体中文'],['zh-Hant','繁體中文'],['ko','한국어'],['id','Bahasa Indonesia']];
  const supported = value => languages.some(([id]) => id === value);
  const requested = new URL(location.href).searchParams.get('lang');
  let saved;
  try { saved = localStorage.getItem('comp-sim-language'); } catch { /* Storage is optional. */ }
  let locale = supported(requested) ? requested : supported(saved) ? saved : 'en';
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.parentElement?.closest('script,style,code')) continue;
    if (node.textContent.trim()) nodes.push([node, node.textContent]);
  }
  const attributes = [];
  for (const node of document.querySelectorAll('[aria-label],meta[name="description"]')) {
    const name = node.tagName === 'META' ? 'content' : 'aria-label';
    attributes.push([node, name, node.getAttribute(name)]);
  }
  let catalogs;
  try {
    const response = await fetch('/information-locales.json');
    if (!response.ok) return;
    catalogs = await response.json();
  } catch { return; } // Keep the complete original readable if loading fails.
  const label = document.createElement('label');
  const caption = document.createElement('span');
  const select = document.createElement('select');
  label.className = 'information-language';
  label.append(caption, select);
  for (const [id, name] of languages) {
    const option = document.createElement('option');
    option.value = id; option.textContent = name; select.append(option);
  }
  document.querySelector('footer')?.prepend(label);
  function apply(next) {
    if (!supported(next) || !catalogs[next]) return;
    locale = next;
    const catalog = catalogs[next];
    for (const [node, original] of nodes) {
      const key = original.trim();
      node.textContent = original.replace(key, () => catalog[key] ?? key);
    }
    for (const [node, name, original] of attributes) node.setAttribute(name, catalog[original] ?? original);
    document.documentElement.lang = next;
    caption.textContent = catalog.Language ?? 'Language';
    select.value = next;
    for (const anchor of document.querySelectorAll('a[href]')) {
      const url = new URL(anchor.getAttribute('href'), location.href);
      if (url.origin === location.origin && /^\/(about|privacy|terms)\/$/.test(url.pathname)) {
        url.searchParams.set('lang', next); anchor.href = url.pathname + url.search + url.hash;
      }
    }
  }
  apply(locale);
  select.addEventListener('change', () => {
    apply(select.value);
    const url = new URL(location.href); url.searchParams.set('lang', locale);
    history.replaceState(null, '', url);
  });
})();
