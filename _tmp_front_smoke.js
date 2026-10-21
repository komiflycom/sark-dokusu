const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();

  const results = []; let fails = 0;
  function check(label, got, expect) {
    const ok = JSON.stringify(got) === JSON.stringify(expect);
    if (!ok) fails++;
    results.push((ok ? 'PASS' : 'FAIL') + '  ' + label + ' => got=' + JSON.stringify(got) + ' expect=' + JSON.stringify(expect));
  }

  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('[console.error] ' + m.text()); });

  // Ağ: gerçek Supabase/CDN'e çıkma. İptal edilen istekler konsola ERR_FAILED
  // bırakır; bunlar testin kurgusundan gelir, uygulama hatası değildir.
  await page.route('**/fwfhlxjvfvmzgwdnfmbc.supabase.co/**', r => r.abort());
  await page.route('**/cdn.jsdelivr.net/**', r => r.abort());

  await page.addInitScript(() => {
    const PRODUCTS = [
      { id: 'p1', name_tr: 'El Dokuma Şal', name_en: 'Handwoven Shawl', name_ar: 'شال يدوي', name_de: 'Handgewebter Schal', name_fr: 'Châle tissé',
        desc_tr: 'Yün', desc_en: 'Wool', desc_ar: 'صوف', desc_de: 'Wolle', desc_fr: 'Laine',
        price: 1200, stock: 5, category_id: 'c1', image_url: null, active: true, sort_order: 0 },
      { id: 'p2', name_tr: 'Tükenmiş Ürün', name_en: 'Sold Out', name_ar: 'نفد', name_de: 'Ausverkauft', name_fr: 'Épuisé',
        desc_tr: 'x', desc_en: 'x', desc_ar: 'x', desc_de: 'x', desc_fr: 'x',
        price: 300, stock: 0, category_id: null, image_url: null, active: true, sort_order: 1 }
    ];
    const CATS = [
      { id: 'c1', name_tr: 'Dokuma', name_en: 'Weaving', name_ar: 'نسيج', name_de: 'Weben', name_fr: 'Tissage', parent_id: null, sort_order: 0, active: true }
    ];
    const SETTINGS = {
      id: 1, store_name: 'Test Mağaza', logo_url: null, banner_url: null, banner_link: null,
      banner_text: { tr: 'TR duyuru', en: 'EN announcement', ar: 'إعلان', de: 'DE Hinweis', fr: 'FR annonce' },
      banner_active: true,
      about_items: [{ title_tr: 'Doğal', desc_tr: 'Doğal dokuma', title_en: 'Natural', desc_en: 'Natural weave',
                      title_ar: 'طبيعي', desc_ar: 'نسيج طبيعي', title_de: 'Natürlich', desc_de: 'Natur', title_fr: 'Naturel', desc_fr: 'Naturel' }],
      address: '', phone: '', whatsapp: '', email: '', instagram: '', facebook: '', youtube: ''
    };
    function q(table) {
      const state = { single: false };
      const api = {
        select() { return api; }, order() { return api; }, eq() { return api; },
        update() { return api; }, insert() { return api; }, delete() { return api; },
        single() { state.single = true; return api; },
        then(res, rej) {
          let data = [];
          if (table === 'products') data = PRODUCTS;
          else if (table === 'categories') data = CATS;
          else if (table === 'site_settings') data = SETTINGS;
          return Promise.resolve({ data: state.single ? (table === 'site_settings' ? SETTINGS : data[0]) : data, error: null }).then(res, rej);
        }
      };
      return api;
    }
    window.supabase = {
      createClient: () => ({
        auth: { getSession: () => Promise.resolve({ data: { session: null } }), onAuthStateChange: () => ({}) },
        from: q,
        storage: { from: () => ({ getPublicUrl: (p) => ({ data: { publicUrl: 'https://example.invalid/' + p } }) }) }
      })
    };
  });

  await page.goto('file:///D:/sarkdokusu-site/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  /* ---- 1. i18n altyapısı ---- */
  const i18n = await page.evaluate(() => {
    const I = window.__sarkI18n;
    return I ? { has: true, langs: I.langs.map(l => l.code), current: I.current, t: I.t('count.products', { n: 3 }) } : { has: false };
  });
  check('i18n global hazır', i18n.has, true);
  check('dil listesi', i18n.langs, ['tr', 'en', 'ar', 'de', 'fr']);
  check('varsayılan dil', i18n.current, 'tr');
  check('çeviri çalışıyor', i18n.t, '3 ürün');

  /* ---- 2. Dil seçici DOM ---- */
  check('#lang-picker butonu', await page.locator('#lang-picker').count(), 1);
  await page.click('#lang-picker');
  await page.waitForTimeout(200);
  check('dil seçenekleri', await page.locator('ul.lang-dropdown li.lang-option').count(), 5);

  /* ---- 3. Ürün listesi ---- */
  check('ürün kartı sayısı', await page.locator('#product-grid li.product-card').count(), 2);
  check('ürün sayacı', await page.textContent('#result-count'), '2 ürün');
  check('ilk ürün adı (TR)', await page.textContent('#product-grid li.product-card .card-title'), 'El Dokuma Şal');
  check('tükenmiş rozeti', await page.locator('#product-grid li.product-card .card-badge.is-out').count(), 1);
  check('kategori rozeti', (await page.textContent('#product-grid li.product-card .card-badge:not(.is-out)')).trim(), 'Dokuma');

  /* ---- 4. Kategori çipleri ---- */
  check('çip kapsayıcı görünür', await page.locator('#category-chips').isVisible(), true);
  check('çip sayısı (Tümü + 1)', await page.locator('#category-chips .chip').count(), 2);

  /* ---- 5. Banner + hakkımızda (site_settings) ---- */
  check('banner metni (TR)', (await page.textContent('#site-banner .banner-text')).trim(), 'TR duyuru');
  check('mağaza adı', (await page.textContent('.brand .brand-name[data-store-name]')).trim(), 'Test Mağaza');
  check('hakkımızda ilk başlık', (await page.textContent('.trust-grid .trust-item h3')).trim(), 'Doğal');

  /* ---- 6. Dil değiştirme: her dilde içerik + yön ---- */
  const langExpect = [
    { code: 'en', name: 'Handwoven Shawl', banner: 'EN announcement', dir: 'ltr' },
    { code: 'ar', name: 'شال يدوي', banner: 'إعلان', dir: 'rtl' },
    { code: 'de', name: 'Handgewebter Schal', banner: 'DE Hinweis', dir: 'ltr' },
    { code: 'fr', name: 'Châle tissé', banner: 'FR annonce', dir: 'ltr' }
  ];
  async function openPicker() {
    const open = await page.getAttribute('#lang-picker', 'aria-expanded');
    if (open !== 'true') { await page.click('#lang-picker'); await page.waitForTimeout(150); }
  }
  for (const L of langExpect) {
    await openPicker();
    await page.click(`ul.lang-dropdown li.lang-option[data-lang="${L.code}"]`);
    await page.waitForTimeout(300);
    check(`${L.code} ürün adı`, await page.textContent('#product-grid li.product-card .card-title'), L.name);
    check(`${L.code} banner`, (await page.textContent('#site-banner .banner-text')).trim(), L.banner);
    check(`${L.code} html[dir]`, await page.getAttribute('html', 'dir'), L.dir);
    check(`${L.code} html[lang]`, await page.getAttribute('html', 'lang'), L.code);
    check(`${L.code} body.is-rtl`, await page.evaluate(() => document.body.classList.contains('is-rtl')), L.dir === 'rtl');
  }

  /* ---- 7. Aramada dil korunuyor mu (FR) ---- */
  await page.fill('#search-input', 'châle');
  await page.waitForTimeout(400);
  check('FR arama sonucu', await page.locator('#product-grid li.product-card').count(), 1);
  await page.fill('#search-input', 'zzzz');
  await page.waitForTimeout(400);
  check('sonuçsuz durum kutusu', await page.locator('#product-grid .state-box').count(), 1);
  await page.click('#search-clear');
  await page.waitForTimeout(300);
  check('arama temizlendi', await page.locator('#product-grid li.product-card').count(), 2);

  /* ---- 8. Konsol / sayfa hataları (iptal edilen istekler hariç) ---- */
  const realErrs = errs.filter(e => !/ERR_FAILED|net::ERR_|Failed to load resource|ERR_BLOCKED/i.test(e));
  check('gerçek konsol hatası yok', realErrs, []);

  console.log(results.join('\n'));
  if (errs.length) console.log('\n(yoksayılan ağ hatası: ' + errs.length + ')');
  console.log('\nFAILS: ' + fails);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
