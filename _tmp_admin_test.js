const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const results = []; let fails = 0;
  function check(label, got, expect) {
    const ok = (expect === null ? got === null : JSON.stringify(got) === JSON.stringify(expect));
    if (!ok) fails++;
    results.push((ok ? 'PASS' : 'FAIL') + '  ' + label + ' => got=' + JSON.stringify(got) + ' expect=' + JSON.stringify(expect));
  }

  await page.route('**/fwfhlxjvfvmzgwdnfmbc.supabase.co/**', r => r.abort());
  await page.route('**/cdn.jsdelivr.net/**', r => r.abort());

  await page.addInitScript(() => {
    function q(table) {
      const state = { table, single: false };
      const api = {
        select() { return api; }, order() { return api; }, eq() { return api; },
        update(p) { window.__inserts[table].push({ op: 'update', p }); return api; },
        insert(p) { window.__inserts[table].push({ op: 'insert', p }); return api; },
        delete() { return api; }, single() { state.single = true; return api; },
        then(res, rej) {
          let data = [];
          if (table === 'site_settings') data = window.__settings;
          return Promise.resolve({ data: state.single ? (table === 'site_settings' ? window.__settings : null) : data, error: null }).then(res, rej);
        }
      };
      return api;
    }
    window.__inserts = { products: [], categories: [], site_settings: [] };
    window.__settings = {
      id: 1, store_name: 'Şark Dokusu', logo_url: null, banner_url: null, banner_link: null,
      banner_text: { tr: 'TR metin', en: 'EN metin' }, banner_active: true,
      about_items: [], address: '', phone: '', whatsapp: '', email: '',
      instagram: '', facebook: '', youtube: ''
    };
    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: () => Promise.resolve({ data: { session: { user: { email: 'admin@test.local' } } } }),
          onAuthStateChange: () => ({}),
          signOut: () => Promise.resolve({}),
          updateUser: () => Promise.resolve({ error: null })
        },
        rpc: () => Promise.resolve({ data: true, error: null }),
        from: q,
        storage: {
          from: () => ({
            getPublicUrl: () => ({ data: { publicUrl: 'https://example.invalid/x.png' } }),
            upload: () => Promise.resolve({ error: null }),
            remove: () => Promise.resolve({})
          })
        }
      })
    };
  });

  const errs = [];
  page.on('pageerror', e => errs.push('[pageerror] ' + e.message));

  await page.goto('file:///D:/sarkdokusu-site/admin.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  check('page errors', errs, []);
  check('admin view visible', await page.locator('#admin-view').isVisible(), true);
  check('login view hidden', await page.locator('#login-view').isVisible(), false);

  /* ---- PRODUCT ---- */
  await page.fill('#p-name-tr', 'Türkçe Ürün');
  await page.fill('#p-desc-tr', 'Türkçe açıklama');
  await page.click('#product-lang-tabs .ltab[data-lang="en"]');
  check('EN product block visible', await page.locator('#pf-name-en').isVisible(), true);
  check('TR product block hidden', await page.locator('#pf-name-tr').isVisible(), false);
  check('EN field empty', await page.inputValue('#p-name-en'), '');
  check('TR value kept in DOM', await page.inputValue('#p-name-tr'), 'Türkçe Ürün');
  await page.fill('#p-name-en', 'English Product');
  await page.click('#product-lang-tabs .ltab[data-lang="ar"]');
  check('AR direction rtl', await page.getAttribute('#p-name-ar', 'dir'), 'rtl');
  await page.fill('#p-name-ar', 'منتج عربي');
  await page.fill('#p-price', '49.90');
  await page.click('#save-btn');
  await page.waitForTimeout(600);
  const inserts1 = await page.evaluate(() => window.__inserts);
  const pInsert = inserts1.products.find(x => x.op === 'insert');
  check('product insert created', !!pInsert, true);
  if (pInsert) {
    check('payload name_tr', pInsert.p.name_tr, 'Türkçe Ürün');
    check('payload name_en', pInsert.p.name_en, 'English Product');
    check('payload name_ar', pInsert.p.name_ar, 'منتج عربي');
    check('payload desc_tr', pInsert.p.desc_tr, 'Türkçe açıklama');
    check('payload price', pInsert.p.price, 49.9);
  }

  /* ---- CATEGORY ---- */
  await page.click('.snav-item[data-tab="categories"]');
  await page.fill('#cat-name-tr', 'Türkçe Kategori');
  await page.click('#cat-lang-tabs .ltab[data-lang="de"]');
  check('DE category block visible', await page.locator('#cf-name-de').isVisible(), true);
  await page.fill('#cat-name-de', 'Deutsche Kategorie');
  await page.click('#cat-save-btn');
  await page.waitForTimeout(600);
  const inserts2 = await page.evaluate(() => window.__inserts);
  const cInsert = inserts2.categories.find(x => x.op === 'insert');
  check('category insert created', !!cInsert, true);
  if (cInsert) {
    check('category name_tr', cInsert.p.name_tr, 'Türkçe Kategori');
    check('category name_de', cInsert.p.name_de, 'Deutsche Kategorie');
  }
  check('cat list element exists', await page.locator('#cat-list').count(), 1);
  check('cat count element exists', await page.locator('#cat-count').count(), 1);

  /* ---- BANNER ---- */
  await page.click('.snav-item[data-tab="settings"]');
  await page.click('.stab[data-stab="banner"]');
  await page.waitForTimeout(400);
  check('banner TR text loaded', await page.inputValue('#s-banner-text-tr'), 'TR metin');
  await page.click('#banner-lang-tabs .ltab[data-lang="en"]');
  check('banner EN block visible', await page.locator('#bf-en').isVisible(), true);
  check('banner EN text loaded', await page.inputValue('#s-banner-text-en'), 'EN metin');
  await page.click('#banner-lang-tabs .ltab[data-lang="fr"]');
  check('banner FR block visible', await page.locator('#bf-fr').isVisible(), true);
  await page.fill('#s-banner-text-fr', 'Texte FR');
  await page.click('#banner-save-btn');
  await page.waitForTimeout(600);
  const inserts3 = await page.evaluate(() => window.__inserts);
  const bSave = inserts3.site_settings.filter(x => x.op === 'update').pop();
  check('banner update created', !!bSave, true);
  if (bSave) {
    check('banner_text.tr', bSave.p.banner_text.tr, 'TR metin');
    check('banner_text.en', bSave.p.banner_text.en, 'EN metin');
    check('banner_text.fr', bSave.p.banner_text.fr, 'Texte FR');
  }

  /* ---- ABOUT ---- */
  await page.click('.stab[data-stab="about"]');
  await page.waitForTimeout(300);
  const before = await page.locator('#about-items-editor .about-item-block').count();
  await page.click('#add-about-item');
  await page.waitForTimeout(200);
  check('about item added', await page.locator('#about-items-editor .about-item-block').count(), before + 1);
  const visInputs = await page.locator('#about-items-editor .about-item-block').last().locator('input:not([type=hidden]), textarea').count();
  check('visible fields in new about item', visInputs, 2);

  /* ---- PASSWORD ---- */
  await page.click('.snav-item[data-tab="account"]');
  await page.fill('#pw-new', '123456');
  await page.fill('#pw-confirm', '654321');
  await page.click('#pw-save-btn');
  await page.waitForTimeout(300);
  check('password mismatch warning', await page.locator('#pw-alert').textContent(), 'Şifreler eşleşmiyor.');

  console.log(results.join('\n'));
  console.log('\nFAILS: ' + fails);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
