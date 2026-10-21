/* Statik doğrulama testi — tarayıcısız, Playwright gerektirmez.
   store.js ve admin.html/style.css kaynaklarını okuyup kritik noktaları kontrol eder. */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
function read(f){ return fs.readFileSync(path.join(ROOT, f), 'utf8'); }

let pass = 0, fail = 0;
function check(label, ok, detail){
  if (ok){ console.log('PASS  '+label); pass++; }
  else { console.log('FAIL  '+label+(detail?' — '+detail:'')); fail++; }
}

const store  = read('store.js');
const css    = read('style.css');
const adminH = read('admin.html');

/* ── 1. fetchImageBlob: download() kaldırıldı mı? ── */
check('fetchImageBlob: storage.download() kullanılmıyor',
  !store.includes('storage.from(BUCKET).download('),
  'download() bulundu');

/* ── 2. fetchImageBlob: fetch() ile getPublicUrl kullanıyor mu? ── */
check('fetchImageBlob: fetch(publicUrl) mevcut',
  store.includes('return fetch(publicUrl)'));

/* ── 3. fetchImageBlob: hata durumunda publicUrl fallback var mı? ── */
check('fetchImageBlob: CORS/ağ hatasında publicUrl fallback',
  store.includes('blobCache[v]=publicUrl') && store.includes('.catch(function()'));

/* ── 4. buildProductCard: eski openLightbox direkt çağrısı yok ── */
const buildCard = store.slice(store.indexOf('function buildProductCard('), store.indexOf('\n  function buildWhatsAppLink('));
check('buildProductCard: doğrudan openLightbox() çağrısı yok',
  !buildCard.includes('openLightbox('),
  'openLightbox bulundu — çift açılım riski');

/* ── 5. buildProductCard: openProductDetail çağrısı var ── */
check('buildProductCard: openProductDetail() çağrısı mevcut',
  buildCard.includes('openProductDetail(product)'));

/* ── 6. openProductDetail: fetchImageBlob kullanıyor ── */
const detailFn = store.slice(store.indexOf('function openProductDetail('), store.indexOf('\n  /* ---- Filtreleme'));
check('openProductDetail: fetchImageBlob çağrısı mevcut',
  detailFn.includes('fetchImageBlob(imgPath)'));

/* ── 7. openProductDetail: lightbox entegre — görsel tıklaması ── */
check('openProductDetail: görsel tıklaması openLightbox açıyor',
  detailFn.includes("openLightbox(blobUrl, name)"));

/* ── 8. openProductDetail: kapat butonu, overlay tıklama, ESC ── */
check('openProductDetail: closeBtn click',   detailFn.includes('closeBtn.addEventListener'));
check('openProductDetail: overlay tıklama',  detailFn.includes("e.target===panel"));
check('openProductDetail: ESC tuşu',         detailFn.includes("e.key==='Escape'"));

/* ── 9. Görsel koruması: 3 alan dahil ── */
const prot = store.slice(store.indexOf('function attachImageProtection('), store.indexOf('\n  /* ---- Olaylar'));
check('attachImageProtection: card-media kontrol',       prot.includes("closest('.card-media')"));
check('attachImageProtection: lightbox kontrol',         prot.includes("closest('.lightbox')"));
check('attachImageProtection: prod-detail-media kontrol',prot.includes("closest('.prod-detail-media')"));

/* ── 10. blobCache tekrar indirmeyi önlüyor ── */
check('blobCache: aynı path için önbellek kontrolü',
  store.includes('if (blobCache[v]) return Promise.resolve(blobCache[v])'));

/* ── 11. CSS: .prod-detail-overlay var ── */
check('CSS: .prod-detail-overlay tanımlı', css.includes('.prod-detail-overlay'));
check('CSS: .prod-detail-inner tanımlı',   css.includes('.prod-detail-inner'));
check('CSS: .prod-detail-media tanımlı',   css.includes('.prod-detail-media'));
check('CSS: .prod-detail-img tanımlı',     css.includes('.prod-detail-img'));
check('CSS: .pd-title tanımlı',            css.includes('.pd-title'));
check('CSS: .pd-wa tanımlı',               css.includes('.pd-wa'));
check('CSS: shimmer animasyonu',           css.includes('@keyframes shimmer'));
check('CSS: .pd-spinner tanımlı',          css.includes('.pd-spinner'));
check('CSS: @keyframes spin',              css.includes('@keyframes spin'));

/* ── 12. Admin: boyut ipuçları ── */
check('admin.html: ürün görseli 800×1000 önerisi',
  adminH.includes('800 × 1000 px'));
check('admin.html: banner 1440×300 önerisi',
  adminH.includes('1440 × 300 px'));

/* ── 13. Genel JS sözdizimi: temel kontrol ── */
try {
  new Function(store); // SyntaxError yakalar
  check('store.js: sözdizimi geçerli', true);
} catch(e) {
  check('store.js: sözdizimi geçerli', false, e.message);
}

console.log('\n' + (fail===0 ? '✓ Tüm testler geçti' : `✗ ${fail} test başarısız`) +
  ' — pass:'+pass+' fail:'+fail);
process.exit(fail > 0 ? 1 : 0);
