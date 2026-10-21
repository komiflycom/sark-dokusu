/* Temp headless browser test — loads real index.html, blocks Supabase project
   domain (never touches live Supabase), verifies i18n + USD + sample products. */
const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });
  const page = await context.newPage();

  const results = [];
  let fails = 0;
  function check(label, got, expect) {
    const ok = (expect === null ? got === null : got === expect);
    if (!ok) fails++;
    results.push((ok ? 'PASS' : 'FAIL') + '  ' + label + ' => got=' + JSON.stringify(got) + ' expect=' + JSON.stringify(expect));
  }

  // Block ONLY the Supabase project domain so fetchProducts errors -> catch -> samples.
  // The Supabase JS CDN (jsdelivr) is left untouched so initSupabase() succeeds,
  // which exercises the catch-fallback path. No live Supabase connection.
  let supaBlocked = 0;
  await page.route('**/fwfhlxjvfvmzgwdnfmbc.supabase.co/**', route => {
    supaBlocked++;
    route.abort();
  });

  const consoleMsgs = [];
  page.on('console', msg => consoleMsgs.push('[' + msg.type() + '] ' + msg.text()));
  page.on('pageerror', err => consoleMsgs.push('[pageerror] ' + err.message));

  await page.goto('file:///D:/sarkdokusu-site/index.html', { waitUntil: 'domcontentloaded' });
  // Wait for sample products to render after Supabase fetch fails
  await page.waitForSelector('.product-card', { timeout: 20000 });

  console.log('--- Supabase fallback path ---');
  check('Supabase project requests blocked', supaBlocked > 0, true);

  console.log('--- Default language (tr) ---');
  check('html[lang]', await page.getAttribute('html', 'lang'), 'tr');
  check('html[dir]', await page.getAttribute('html', 'dir'), 'ltr');
  check('body.is-rtl absent', await page.evaluate(() => document.body.classList.contains('is-rtl')), false);
  check('document.title', await page.title(), 'Şark Dokusu — Doğal Dokunuşlu El Emeği Ürünler');

  console.log('--- Sample products (tr) ---');
  check('product card count', await page.locator('.product-card').count(), 2);
  const prices = await page.locator('.price').allTextContents();
  check('price[0]', prices[0], '$49.99');
  check('price[1]', prices[1], '$29.99');
  const namesTr = await page.locator('.card-title').allTextContents();
  check('name[0] tr', namesTr[0], 'Anadolu Motifli Dokuma Şal');
  check('name[1] tr', namesTr[1], 'Geleneksel Desenli Fular');

  console.log('--- Lang picker ---');
  check('picker present', await page.locator('#lang-picker').count() > 0, true);
  check('picker label tr', await page.locator('#lang-picker .lang-label').textContent(), 'TR');

  async function switchLang(code) {
    await page.click('#lang-picker');
    await page.click('.lang-option[data-lang="' + code + '"]');
    await page.waitForTimeout(250);
  }

  console.log('--- English ---');
  await switchLang('en');
  check('en html[lang]', await page.getAttribute('html', 'lang'), 'en');
  check('en html[dir]', await page.getAttribute('html', 'dir'), 'ltr');
  check('picker label en', await page.locator('#lang-picker .lang-label').textContent(), 'EN');
  const namesEn = await page.locator('.card-title').allTextContents();
  check('name[0] en', namesEn[0], 'Anatolian Motif Woven Shawl');
  check('name[1] en', namesEn[1], 'Traditional Pattern Scarf');
  const descEn = await page.locator('.card-desc').first().textContent();
  check('desc[0] en starts with Hand-woven', descEn.indexOf('Hand-woven') === 0, true);
  const waBtnEn = await page.locator('.btn-wa').first().textContent();
  check('order btn en', waBtnEn, 'Order via WhatsApp');
  const heroEn = await page.locator('h1').first().innerHTML();
  check('hero h1 en contains patience', heroEn.indexOf('patience') > -1, true);

  console.log('--- Arabic (RTL) ---');
  await switchLang('ar');
  check('ar html[lang]', await page.getAttribute('html', 'lang'), 'ar');
  check('ar html[dir]', await page.getAttribute('html', 'dir'), 'rtl');
  check('ar body.is-rtl', await page.evaluate(() => document.body.classList.contains('is-rtl')), true);
  const namesAr = await page.locator('.card-title').allTextContents();
  check('name[0] ar', namesAr[0], 'شال منسوج بنقوش أناضولية');
  const waBtnAr = await page.locator('.btn-wa').first().textContent();
  check('order btn ar', waBtnAr, 'اطلب عبر واتساب');

  console.log('--- German ---');
  await switchLang('de');
  check('de html[dir]', await page.getAttribute('html', 'dir'), 'ltr');
  const namesDe = await page.locator('.card-title').allTextContents();
  check('name[0] de', namesDe[0], 'Anatolisches Motiv Webschal');
  check('name[1] de', namesDe[1], 'Traditionelles Muster-Tuch');

  console.log('--- French ---');
  await switchLang('fr');
  check('fr html[dir]', await page.getAttribute('html', 'dir'), 'ltr');
  const namesFr = await page.locator('.card-title').allTextContents();
  check('name[0] fr', namesFr[0], 'Châle tissé à motifs anatoliens');
  check('name[1] fr', namesFr[1], 'Foulard à motifs traditionnels');

  console.log('--- localStorage persistence ---');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.product-card', { timeout: 20000 });
  check('lang after reload', await page.getAttribute('html', 'lang'), 'fr');
  const namesAfter = await page.locator('.card-title').allTextContents();
  check('name after reload (fr)', namesAfter[0], 'Châle tissé à motifs anatoliens');
  check('dir after reload (fr)', await page.getAttribute('html', 'dir'), 'ltr');

  console.log('--- Back to tr resets RTL ---');
  await switchLang('tr');
  check('tr html[dir]', await page.getAttribute('html', 'dir'), 'ltr');
  check('tr body.is-rtl after reset', await page.evaluate(() => document.body.classList.contains('is-rtl')), false);

  console.log('--- JS console errors (excluding forced Supabase abort) ---');
  const realErrors = consoleMsgs.filter(m =>
    !/supabase|ERR_FAILED|Failed to load resource|net::ERR/i.test(m)
  );
  check('no unexpected JS errors', realErrors.length, 0);
  if (realErrors.length > 0) results.push('  Errors: ' + JSON.stringify(realErrors));

  console.log('\n' + results.join('\n'));
  console.log('\n' + (fails === 0 ? 'ALL BROWSER TESTS PASS' : fails + ' BROWSER TEST FAILURES'));

  await browser.close();
  process.exit(fails === 0 ? 0 : 1);
})().catch(e => { console.error('TEST HARNESS ERROR:', e); process.exit(2); });
