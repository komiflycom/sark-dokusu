/* CDP tabanlı gerçek tarayıcı testi
   - Headless Chromium ile yerel HTTP sunucu üzerinde index.html açar
   - Supabase mock ile deterministik ürün verisi enjekte eder
   - Her önceliği (P1-P5) test eder
   - Gerçek DOM olaylarını tetikler */
'use strict';

const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const net   = require('net');
const { execFile } = require('child_process');
const WebSocket = require('ws');

/* ── Chromium ── */
const CHROMIUMS = [
  path.join(process.env.LOCALAPPDATA||'', 'ms-playwright/chromium-1248/chrome-win/chrome.exe'),
  path.join(process.env.LOCALAPPDATA||'', 'ms-playwright/chromium-1200/chrome-win/chrome.exe'),
  path.join(process.env.LOCALAPPDATA||'', 'ms-playwright/chromium-1194/chrome-win/chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(p => { try { return fs.existsSync(p); } catch(e){ return false; } });

if (!CHROMIUMS.length) { console.log('SKIP chromium bulunamadı'); process.exit(0); }
const CHROMIUM = CHROMIUMS[0];

function freePort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); });
    s.on('error', rej);
  });
}

/* ── Statik sunucu ── */
const MIME = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.ico':'image/x-icon'};
function startServer(port) {
  const ROOT = __dirname;
  const srv = http.createServer((req, res) => {
    const fp = path.join(ROOT, req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]);
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream',
                           'Access-Control-Allow-Origin': '*' });
      res.end(data);
    });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r(srv)));
}

/* ── CDP WebSocket istemci ── */
function cdpGetWsUrl(cdpPort) {
  return new Promise((res, rej) => {
    const tryGet = (n) => {
      http.get(`http://127.0.0.1:${cdpPort}/json/list`, r => {
        let d = '';
        r.on('data', c => d += c);
        r.on('end', () => {
          try {
            const tabs = JSON.parse(d);
            const tab  = tabs.find(t => t.type === 'page') || tabs[0];
            if (tab && tab.webSocketDebuggerUrl) return res(tab);
            if (n > 0) setTimeout(() => tryGet(n-1), 400); else rej(new Error('no page tab'));
          } catch(e) { if (n > 0) setTimeout(() => tryGet(n-1), 400); else rej(e); }
        });
      }).on('error', () => { if (n > 0) setTimeout(() => tryGet(n-1), 400); else rej(new Error('CDP unreachable')); });
    };
    setTimeout(() => tryGet(20), 600);
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = {};
    this.events = {};
    this.ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.id !== undefined && this.pending[msg.id]) {
        const { res, rej } = this.pending[msg.id];
        delete this.pending[msg.id];
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
      if (msg.method) {
        const cbs = this.events[msg.method] || [];
        cbs.forEach(fn => fn(msg.params));
      }
    });
  }
  send(method, params={}) {
    return new Promise((res, rej) => {
      const id = ++this.id;
      this.pending[id] = { res, rej };
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.pending[id]) { delete this.pending[id]; rej(new Error('CDP timeout: '+method)); } }, 12000);
    });
  }
  on(event, fn) { (this.events[event] = this.events[event]||[]).push(fn); }
  ready() { return new Promise((res, rej) => { if (this.ws.readyState === 1) return res(); this.ws.on('open', res); this.ws.on('error', rej); }); }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true, timeout: 10000 });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'eval error');
    return r.result?.value;
  }
  close() { try { this.ws.close(); } catch(e){} }
}

/* ── Mock Supabase enjeksiyonu ── */
const MOCK_SCRIPT = `
(function(){
  const PRODUCTS = [
    { id:'p1', name_tr:'El Dokuma Şal', name_en:'Handwoven Shawl', name_ar:'شال يدوي', name_de:'Handgewebter Schal', name_fr:'Châle tissé',
      desc_tr:'Yün iplikten elle dokunmuş geleneksel şal.', desc_en:'Handwoven traditional shawl.', desc_ar:'شال تقليدي', desc_de:'Handgewebter Schal', desc_fr:'Châle tissé à la main',
      price:1200, stock:5, category_id:'c1', image_url:'products/test.jpg', active:true },
    { id:'p2', name_tr:'Tükenmiş Ürün', name_en:'Sold Out', name_ar:'نفد', name_de:'Ausverkauft', name_fr:'Épuisé',
      desc_tr:'Stokta yok', price:300, stock:0, category_id:null, image_url:null, active:true }
  ];
  const CATS = [{ id:'c1', name_tr:'Dokuma', name_en:'Weaving', name_ar:'نسيج', name_de:'Weben', name_fr:'Tissage', parent_id:null, sort_order:0, active:true }];
  const SETTINGS = { id:1, store_name:'Test Mağaza', logo_url:null, banner_url:null, banner_link:null,
    banner_text:{tr:'Ücretsiz kargo',en:'Free shipping',ar:'شحن مجاني',de:'Kostenlos',fr:'Livraison gratuite'},
    banner_active:true,
    about_items:[{title_tr:'Doğal',desc_tr:'Doğal malzeme',title_en:'Natural',desc_en:'Natural'}],
    address:'', phone:'', whatsapp:'905323303482', email:'', instagram:'', facebook:'', youtube:''
  };
  function q(table){
    const api = { _table:table };
    ['select','order','eq','update','insert','delete','limit'].forEach(m => { api[m] = function(){ return api; }; });
    api.single = function(){ api._single=true; return api; };
    api.then = function(res,rej){
      let data = [];
      if (table==='products') data = PRODUCTS;
      else if (table==='categories') data = CATS;
      else if (table==='site_settings') data = SETTINGS;
      const val = api._single ? (table==='site_settings'?SETTINGS:(Array.isArray(data)?data[0]:data)) : data;
      return Promise.resolve({data:val,error:null}).then(res,rej);
    };
    return api;
  }
  window.__MOCK_ACTIVE = true;
  window.supabase = {
    createClient: function() {
      return {
        auth: {
          getSession: () => Promise.resolve({data:{session:null}}),
          onAuthStateChange: () => ({data:{subscription:{unsubscribe:function(){}}}}),
          signInWithPassword: () => Promise.resolve({data:{},error:null})
        },
        from: q,
        rpc: function(){ return Promise.resolve({data:true,error:null}); },
        storage: {
          from: function(bucket){
            return {
              getPublicUrl: function(p){ return {data:{publicUrl:'https://example.invalid/'+p}}; },
              upload: function(){ return Promise.resolve({data:{path:'test'},error:null}); },
              download: function(){ return Promise.resolve({data:null,error:{message:'not allowed'}}); },
              remove: function(){ return Promise.resolve({data:{},error:null}); }
            };
          }
        }
      };
    }
  };
})();
`;

/* ── Test runner ── */
let pass = 0, fail = 0, skip = 0;
const results = [];
function check(label, ok, detail) {
  if (ok===null) { console.log('SKIP  '+label); skip++; results.push('SKIP  '+label); return; }
  if (ok) { console.log('PASS  '+label); pass++; results.push('PASS  '+label); }
  else     { console.log('FAIL  '+label+(detail?' — '+detail:'')); fail++; results.push('FAIL  '+label+(detail?' — '+detail:'')); }
}

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const srvPort = await freePort();
  const cdpPort = await freePort();

  const srv = await startServer(srvPort);
  const BASE = `http://127.0.0.1:${srvPort}`;

  /* Chromium başlat */
  const proc = execFile(CHROMIUM, [
    '--headless=new', `--remote-debugging-port=${cdpPort}`,
    '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--disable-background-networking', '--disable-sync',
    'about:blank'
  ], { timeout: 30000 });
  proc.on('error', e => console.error('Chromium error:', e.message));

  let tab, cdp;
  try {
    tab = await cdpGetWsUrl(cdpPort);
    cdp = new CDP(tab.webSocketDebuggerUrl);
    await cdp.ready();
  } catch(e) {
    console.log('FAIL CDP bağlantısı —', e.message);
    fail++;
    proc.kill(); srv.close(); process.exit(1);
  }

  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');
  await cdp.send('DOM.enable');

  /* Konsol hatalarını yakala */
  const consoleErrors = [];
  cdp.on('Runtime.consoleAPICalled', p => {
    if (p.type === 'error') {
      const txt = p.args.map(a => a.value||a.description||'').join(' ');
      if (!/ERR_FAILED|ERR_BLOCKED|ERR_NAME_NOT_RESOLVED|net::ERR|Failed to load resource/i.test(txt))
        consoleErrors.push(txt);
    }
  });
  cdp.on('Runtime.exceptionThrown', p => {
    const txt = p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '';
    if (txt) consoleErrors.push('[exception] '+txt);
  });

  /* ════════════════════════════════════════
     ÖNCELİK 1 — Siteyi aç, mock enjekte et
     ════════════════════════════════════════ */
  console.log('\n── ÖNCELİK 1: Site açılışı ──');

  /* Sayfa yüklenmeden önce mock enjekte et */
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: MOCK_SCRIPT });

  const navDone = new Promise(r => {
    cdp.on('Page.loadEventFired', r);
    setTimeout(r, 8000); // fallback
  });
  await cdp.send('Page.navigate', { url: `${BASE}/index.html` });
  await navDone;
  await sleep(1800); // store.js async yüklemesi için bekle

  check('P1: mock aktif',      await cdp.eval('window.__MOCK_ACTIVE===true'), 'mock yüklenmedi');
  check('P1: i18n hazır',      await cdp.eval('typeof window.__sarkI18n !== "undefined"'), 'i18n yok');
  check('P1: supabase hazır',  await cdp.eval('typeof window.__sarkSupabase !== "undefined"'), 'supabase init olmadı');

  const cardCount = await cdp.eval('document.querySelectorAll("#product-grid li.product-card").length');
  check('P1: 2 ürün kartı yüklendi', cardCount === 2, `${cardCount} kart`);

  const bannerVisible = await cdp.eval('!!document.getElementById("site-banner")');
  check('P1: banner görünür', bannerVisible, 'banner yok');

  const storeName = await cdp.eval('(document.querySelector("[data-store-name]")||{}).textContent');
  check('P1: mağaza adı uygulandı', storeName === 'Test Mağaza', storeName);

  /* ════════════════════════════════════════
     ÖNCELİK 2 — Ürün detay testi
     ════════════════════════════════════════ */
  console.log('\n── ÖNCELİK 2: Ürün detay paneli ──');

  /* İlk kart mediasına tıkla */
  await cdp.eval('document.querySelector("#product-grid li.product-card .card-media").click()');
  await sleep(600);

  const overlayExists = await cdp.eval('!!document.querySelector(".prod-detail-overlay")');
  check('P2: detay paneli açıldı', overlayExists, 'overlay yok');

  const overlayOpen = await cdp.eval('document.querySelector(".prod-detail-overlay")?.classList.contains("is-open")');
  check('P2: overlay is-open sınıfı', overlayOpen, 'is-open eksik');

  const pdTitle = await cdp.eval('document.querySelector(".pd-title")?.textContent?.trim()');
  check('P2: ürün adı görünür', pdTitle === 'El Dokuma Şal', pdTitle);

  const pdPrice = await cdp.eval('document.querySelector(".pd-price")?.textContent?.trim()');
  check('P2: fiyat görünür', pdPrice && pdPrice.length > 0, pdPrice);

  const pdDesc = await cdp.eval('document.querySelector(".pd-desc")?.textContent?.trim()');
  check('P2: açıklama görünür', pdDesc && pdDesc.length > 0, pdDesc);

  const pdWa = await cdp.eval('!!document.querySelector(".pd-wa")');
  check('P2: WhatsApp butonu mevcut', pdWa, 'WA butonu yok');

  const pdWaHref = await cdp.eval('document.querySelector(".pd-wa")?.href||""');
  check('P2: WhatsApp linki wa.me içeriyor', pdWaHref.includes('wa.me'), pdWaHref.slice(0,60));

  const pdCat = await cdp.eval('document.querySelector(".pd-cat")?.textContent?.trim()');
  check('P2: kategori etiketi görünür', pdCat === 'Dokuma', pdCat);

  /* Görsel tıklaması → lightbox */
  const pdImgExists = await cdp.eval('!!document.querySelector(".prod-detail-img")');
  check('P2: detay görseli yüklendi (null değil)', pdImgExists, 'detay img yok');

  if (pdImgExists) {
    await cdp.eval('document.querySelector(".prod-detail-img").click()');
    await sleep(400);
    const lbOpen = await cdp.eval('!!document.querySelector(".lightbox.is-open")');
    check('P2: görsel tıklaması lightbox açıyor', lbOpen, 'lightbox açılmadı');

    if (lbOpen) {
      /* Lightbox'ı kapat — X butonu */
      await cdp.eval('document.querySelector(".lightbox-close").click()');
      await sleep(300);
      const lbGone = await cdp.eval('!document.querySelector(".lightbox.is-open")');
      check('P2: lightbox X ile kapanıyor', lbGone, 'lightbox kapanmadı');
    }
  } else { check('P2: görsel tıklaması lightbox açıyor', null); check('P2: lightbox X ile kapanıyor', null); }

  /* Kapat butonu */
  const closeBtn = await cdp.eval('!!document.querySelector(".prod-detail-close")');
  check('P2: kapat butonu mevcut', closeBtn, 'closeBtn yok');
  if (closeBtn) {
    await cdp.eval('document.querySelector(".prod-detail-close").click()');
    await sleep(300);
    const panelGone = await cdp.eval('!document.querySelector(".prod-detail-overlay.is-open")');
    check('P2: kapat butonu paneli kapatıyor', panelGone, 'panel kapanmadı');
  } else check('P2: kapat butonu paneli kapatıyor', null);

  /* Overlay tıklama (yeniden aç) */
  await cdp.eval('document.querySelector("#product-grid li.product-card .card-media").click()');
  await sleep(500);
  await cdp.eval('document.querySelector(".prod-detail-overlay").click()');
  await sleep(300);
  const panelGone2 = await cdp.eval('!document.querySelector(".prod-detail-overlay.is-open")');
  check('P2: overlay dışına tıklama kapatıyor', panelGone2, 'panel kapanmadı');

  /* ESC tuşu (yeniden aç) */
  await cdp.eval('document.querySelector("#product-grid li.product-card .card-media").click()');
  await sleep(500);
  await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await cdp.send('Input.dispatchKeyEvent', { type:'keyUp',   key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await sleep(300);
  const panelGone3 = await cdp.eval('!document.querySelector(".prod-detail-overlay.is-open")');
  check('P2: ESC paneli kapatıyor', panelGone3, 'panel kapanmadı');

  /* Çift açılım yok — iki hızlı tıklama */
  await cdp.eval('document.querySelector("#product-grid li.product-card .card-media").click()');
  await cdp.eval('document.querySelector("#product-grid li.product-card .card-media").click()');
  await sleep(400);
  const overlayCount = await cdp.eval('document.querySelectorAll(".prod-detail-overlay").length');
  check('P2: çift tıklamada tek panel açılıyor', overlayCount <= 1, `${overlayCount} overlay`);
  /* Temizle */
  if (overlayCount > 0) await cdp.eval('document.querySelector(".prod-detail-close")?.click()');
  await sleep(200);

  /* ════════════════════════════════════════
     ÖNCELİK 3 — Görseller
     ════════════════════════════════════════ */
  console.log('\n── ÖNCELİK 3: Görseller ──');

  /* Kart 1: image_url var → fetchImageBlob çağrılır, mock'ta fetch URL'i example.invalid olduğu için
     fetch başarısız olur ama fallback olarak publicUrl atanmalı (blobCache'e). */
  const blobCacheHasKey = await cdp.eval(`
    (function(){
      // fetchImageBlob async; biraz bekle
      return new Promise(function(res){
        setTimeout(function(){
          // blobCache doğrudan erişilemez (closure) ama kart img veya placeholder kontrol edebiliriz
          var card1 = document.querySelectorAll('#product-grid li.product-card')[0];
          var hasImg = !!card1.querySelector('.card-media img');
          var hasFallback = !!card1.querySelector('.card-media .media-fallback');
          // img varsa src kontrolü
          var imgSrc = card1.querySelector('.card-media img')?.src || '';
          res(JSON.stringify({hasImg:hasImg, hasFallback:hasFallback, src:imgSrc.slice(0,60)}));
        }, 2500);
      });
    })()
  `);
  let card1Info = {};
  try { card1Info = JSON.parse(blobCacheHasKey); } catch(e){}
  /* mock fetch example.invalid → ağ hatası → fallback (publicUrl) → img src örnek URL veya fallback div */
  check('P3: kart 1 görsel veya fallback gösteriliyor', card1Info.hasImg || card1Info.hasFallback,
    'ikisi de yok: '+JSON.stringify(card1Info));

  /* Kart 2: image_url null → fallback div doğrudan eklenmeli */
  const card2Fallback = await cdp.eval(`
    (function(){
      var card2 = document.querySelectorAll('#product-grid li.product-card')[1];
      return !!card2.querySelector('.card-media .media-fallback');
    })()
  `);
  check('P3: image_url null → fallback gösteriliyor', card2Fallback, 'fallback yok');

  /* fetchImageBlob: fetch hatası sonrası kart kaybolmadı */
  const cardStillRendered = await cdp.eval('document.querySelectorAll("#product-grid li.product-card").length');
  check('P3: fetch hatası sonrası kartlar kaybolmuyor', cardStillRendered === 2, `${cardStillRendered} kart`);

  /* ════════════════════════════════════════
     ÖNCELİK 4 — Mobil ve masaüstü
     ════════════════════════════════════════ */
  console.log('\n── ÖNCELİK 4: Masaüstü ve mobil görünüm ──');

  /* Masaüstü: 1280px */
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width:1280, height:900, deviceScaleFactor:1, mobile:false
  });
  await sleep(400);
  const gridColsDesktop = await cdp.eval(`
    (function(){
      var g = document.querySelector('#product-grid');
      return g ? window.getComputedStyle(g).gridTemplateColumns : 'n/a';
    })()
  `);
  check('P4: masaüstü ürün grid render oluyor', gridColsDesktop !== 'none' && gridColsDesktop !== 'n/a', gridColsDesktop);

  /* Detay panelini masaüstünde aç */
  await cdp.eval('document.querySelector("#product-grid li.product-card .card-media").click()');
  await sleep(500);
  const desktopInnerCols = await cdp.eval(`
    (function(){
      var el = document.querySelector('.prod-detail-inner');
      return el ? window.getComputedStyle(el).gridTemplateColumns : 'none';
    })()
  `);
  check('P4: masaüstü detay paneli 2 kolon', desktopInnerCols.split(' ').length >= 2, desktopInnerCols);
  const desktopOverflow = await cdp.eval(`
    (function(){
      var el = document.querySelector('.prod-detail-inner');
      return el ? window.getComputedStyle(el).overflowY : 'n/a';
    })()
  `);
  check('P4: masaüstü detay paneli scroll overflow-y', desktopOverflow === 'auto' || desktopOverflow === 'scroll', desktopOverflow);
  await cdp.eval('document.querySelector(".prod-detail-close")?.click()');
  await sleep(200);

  /* Mobil: 390px */
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width:390, height:844, deviceScaleFactor:2, mobile:true
  });
  await sleep(400);
  const mobileCards = await cdp.eval('document.querySelectorAll("#product-grid li.product-card").length');
  check('P4: mobilde kartlar görünür', mobileCards === 2, `${mobileCards}`);

  await cdp.eval('document.querySelector("#product-grid li.product-card .card-media").click()');
  await sleep(500);
  const mobileOverlayOpen = await cdp.eval('document.querySelector(".prod-detail-overlay")?.classList.contains("is-open")');
  check('P4: mobil detay paneli açılıyor', mobileOverlayOpen, 'açılmadı');

  const mobileInnerCols = await cdp.eval(`
    (function(){
      var el = document.querySelector('.prod-detail-inner');
      return el ? window.getComputedStyle(el).gridTemplateColumns : 'none';
    })()
  `);
  /* Mobil 390px → tek kolon bekliyoruz */
  check('P4: mobil detay paneli tek kolon', !mobileInnerCols.includes(' ') || mobileInnerCols.split(' ').length < 2, mobileInnerCols);

  const mobileBodyOverflow = await cdp.eval('window.getComputedStyle(document.body).overflow');
  check('P4: mobil panel açıkken body scroll kilidi', mobileBodyOverflow === 'hidden', mobileBodyOverflow);

  /* ESC ile mobil kapat */
  await cdp.send('Input.dispatchKeyEvent', { type:'keyDown', key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await cdp.send('Input.dispatchKeyEvent', { type:'keyUp',   key:'Escape', code:'Escape', windowsVirtualKeyCode:27 });
  await sleep(300);
  const mobileGone = await cdp.eval('!document.querySelector(".prod-detail-overlay.is-open")');
  check('P4: mobil ESC ile panel kapanıyor', mobileGone, 'kapanmadı');

  /* ════════════════════════════════════════
     ÖNCELİK 5 — Görsel güvenlik + admin hint
     ════════════════════════════════════════ */
  console.log('\n── ÖNCELİK 5: Görsel güvenlik ve admin hint ──');

  /* 1280px geri al */
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width:1280, height:900, deviceScaleFactor:1, mobile:false
  });
  await sleep(300);

  /* Sağ tık engeli: contextmenu tetikle, preventDefault çalıştı mı kontrol et */
  const ctxBlocked = await cdp.eval(`
    (function(){
      // card img üzerinde contextmenu tetikle
      var card = document.querySelector('#product-grid li.product-card .card-media');
      if (!card) return false;
      var prevented = false;
      var handler = function(e){ if (!e.defaultPrevented) prevented=false; else prevented=true; };
      card.addEventListener('contextmenu', handler, {once:true, capture:true});
      var ev = new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
      // attachImageProtection img üzerinde çalışıyor; card div'de değil
      // img yoksa (placeholder), null döner
      var img = card.querySelector('img');
      if (!img) return null; // görsel yoksa test atla
      var ev2 = new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
      img.dispatchEvent(ev2);
      return ev2.defaultPrevented;
    })()
  `);
  if (ctxBlocked === null) check('P5: img sağ tık engelleniyor', null);
  else check('P5: img sağ tık engelleniyor', ctxBlocked === true, 'engellenmedi');

  /* Drag engeli */
  const dragBlocked = await cdp.eval(`
    (function(){
      var img = document.querySelector('#product-grid li.product-card .card-media img');
      if (!img) return null;
      var ev = new DragEvent('dragstart',{bubbles:true,cancelable:true});
      img.dispatchEvent(ev);
      return ev.defaultPrevented;
    })()
  `);
  if (dragBlocked === null) check('P5: img sürükleme engelleniyor', null);
  else check('P5: img sürükleme engelleniyor', dragBlocked === true, 'engellenmedi');

  /* Admin hint — statik dosya kontrolü */
  const adminHtml = fs.readFileSync(path.join(__dirname, 'admin.html'), 'utf8');
  check('P5: admin ürün 800×1000 px önerisi', adminHtml.includes('800 × 1000 px'), 'bulunamadı');
  check('P5: admin banner 1440×300 px önerisi', adminHtml.includes('1440 × 300 px'), 'bulunamadı');
  check('P5: admin 4:5 oran notu', adminHtml.includes('4:5'), 'bulunamadı');

  /* ════════════════════════════════════════
     Konsol hata raporu
     ════════════════════════════════════════ */
  console.log('\n── Konsol hataları ──');
  if (consoleErrors.length === 0) {
    check('Konsol: JavaScript hatası yok', true);
  } else {
    consoleErrors.forEach(e => console.log('  ERR:', e));
    check('Konsol: JavaScript hatası yok', false, `${consoleErrors.length} hata`);
  }

  /* ═══════════════════════════
     Özet
     ═══════════════════════════ */
  console.log('\n' + '─'.repeat(54));
  console.log(`Tarayıcı: Chrome/${tab.title||'?'} | CDP üzeri headless`);
  console.log(`Toplam: pass=${pass}  fail=${fail}  skip=${skip}`);
  console.log(fail === 0 ? '✓ Tüm tarayıcı testleri geçti' : `✗ ${fail} test başarısız`);

  cdp.close();
  proc.kill();
  srv.close();
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => {
  console.error('Test hatası:', e.message);
  process.exit(1);
});
