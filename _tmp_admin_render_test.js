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

  await page.route('**/fwfhlxjvfvmzgwdnfmbc.supabase.co/**', r => r.abort());
  await page.route('**/cdn.jsdelivr.net/**', r => r.abort());
  await page.addInitScript(() => {
    const PRODUCTS = [{
      id: 'p1', name: 'Şal', name_tr: 'Şal', name_en: 'Shawl', name_ar: 'شال', name_de: 'Schal', name_fr: 'Châle',
      description: 'd', desc_tr: 'd', desc_en: 'de', desc_ar: 'د', desc_de: 'dd', desc_fr: 'df',
      price: 49.9, stock: 3, category_id: 'c1', category: 'Dokuma', image_url: null, active: true, sort_order: 0
    }];
    const CATS = [
      { id: 'c1', name_tr: 'Dokuma', name_en: 'Weaving', name_ar: 'نسيج', name_de: 'Weben', name_fr: 'Tissage', parent_id: null, sort_order: 0, active: true },
      { id: 'c2', name_tr: 'Alt Kategori', name_en: 'Child', name_ar: 'فرعي', name_de: 'Kind', name_fr: 'Enfant', parent_id: 'c1', sort_order: 1, active: true }
    ];
    const SETTINGS = {
      id: 1, store_name: 'Test Mağaza', logo_url: null, banner_url: null, banner_link: null,
      banner_text: {}, banner_active: false, about_items: [],
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
        auth: {
          getSession: () => Promise.resolve({ data: { session: { user: { email: 'a@b.c' } } } }),
          onAuthStateChange: () => ({}), signOut: () => Promise.resolve({}),
          updateUser: () => Promise.resolve({ error: null })
        },
        rpc: () => Promise.resolve({ data: true, error: null }),
        from: q,
        storage: { from: () => ({ getPublicUrl: () => ({ data: { publicUrl: 'x' } }), upload: () => Promise.resolve({ error: null }), remove: () => Promise.resolve({}) }) }
      })
    };
  });

  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file:///D:/sarkdokusu-site/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  check('page errors', errs, []);

  /* products list */
  check('ürün listesi satırı', await page.locator('#admin-list .admin-item').count(), 1);
  check('ürün sayacı', await page.locator('#product-count').textContent(), '1 ürün');
  check('sidebar mağaza adı', await page.locator('[data-store-name]').first().textContent(), 'Test Mağaza');

  /* edit product -> prefill all languages */
  await page.click('#admin-list .admin-item .icon-btn[title="Düzenle"]');
  await page.waitForTimeout(300);
  check('düzenleme TR ad', await page.inputValue('#p-name-tr'), 'Şal');
  await page.click('#product-lang-tabs .ltab[data-lang="fr"]');
  check('düzenleme FR ad', await page.inputValue('#p-name-fr'), 'Châle');
  check('düzenleme FR açıklama', await page.inputValue('#p-desc-fr'), 'df');

  /* categories list */
  await page.click('.snav-item[data-tab="categories"]');
  await page.waitForTimeout(400);
  check('kategori sayacı', await page.locator('#cat-count').textContent(), '2 kategori');
  check('kategori satırı', await page.locator('#cat-list .admin-item').count(), 2);
  check('alt kategori işareti', (await page.locator('#cat-list .admin-item-title').nth(1).textContent()).includes('↳'), true);

  /* category edit prefill */
  await page.click('#cat-list .admin-item .icon-btn[title="Düzenle"]');
  await page.waitForTimeout(200);
  check('kategori düzenleme TR', await page.inputValue('#cat-name-tr'), 'Dokuma');
  await page.click('#cat-lang-tabs .ltab[data-lang="ar"]');
  check('kategori düzenleme AR', await page.inputValue('#cat-name-ar'), 'نسيج');
  check('kategori AR yönü', await page.getAttribute('#cat-name-ar', 'dir'), 'rtl');

  console.log(results.join('\n'));
  console.log('\nFAILS: ' + fails);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
