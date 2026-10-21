/* ==========================================================================
   ŞARK DOKUSU — store.js (v2)
   Vitrin: ayarları, kategorileri ve ürünleri Supabase'den okur; çok dilli
   gösterir; WhatsApp siparişi üretir; görsel yakınlaştırma ve koruma sağlar.
   --------------------------------------------------------------------------
   GÜVENLİK: Tüm metinler textContent ile basılır. Hiçbir ürün alanı
   innerHTML'e verilmez. Görsel koruması (sağ tık engeli) caydırıcılıktır;
   tam koruma sağlamaz (tarayıcı önbelleği, ekran görüntüsü).
   NOT: Ürün görselleri product-images bucket'ından getPublicUrl ile yüklenir.
   Görsellerin vitrinde görünmesi için bucket'ta herkese açık okuma politikası
   olmalıdır (SQL'de ürün görselleri için ayrı bir public read policy eklenebilir).
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = window.SARK_CONFIG || {};
  var BUCKET = 'product-images';
  var ASSETS_BUCKET = 'site-assets';
  var LOW_STOCK = 3;
  var SEARCH_DEBOUNCE = 180;
  var LANGS = ['tr','en','ar','de','fr'];

  var els = {};
  var state = {
    products: [], categories: [], settings: null,
    search: '', category: '__all__', loading: true, error: null,
    supabaseReady: false
  };

  function t(key, vars){ if (!window.__sarkI18n) return key; return window.__sarkI18n.t(key, vars); }
  function curLang(){ return (window.__sarkI18n && window.__sarkI18n.current) || 'tr'; }
  function byId(id){ return document.getElementById(id); }

  function formatPrice(v){
    var n = Number(v);
    if (v===null||v===undefined||v===''||!isFinite(n)) return '—';
    try { return new Intl.NumberFormat(curLang()==='tr'?'tr-TR':'en-US',{style:'currency',currency:curLang()==='tr'?'TRY':'USD',minimumFractionDigits:2,maximumFractionDigits:2}).format(n); }
    catch(e){ return n.toFixed(2); }
  }

  function imgPublicUrl(path){
    if (!path||typeof path!=='string') return '';
    var v=path.trim(); if (!v) return '';
    if (/^https?:\/\//i.test(v)||/^data:image\//i.test(v)) return v;
    if (!state.supabaseReady||!window.__sarkSupabase) return '';
    try { var r=window.__sarkSupabase.storage.from(BUCKET).getPublicUrl(v.replace(/^\/+/,'')); return (r&&r.data&&r.data.publicUrl)||''; }
    catch(e){ return ''; }
  }
  /* Görseli blob olarak indirip geçici bir object URL döndürür. Böylece
     depo yolu sayfa kaynağında/öge denetlede görünmez; yalnızca blob: URL'i
     gösterilir. Caydırıcılık düzeyinde bir korumadır (ekran görüntüsü/önbellek
     yine mümkün). Aynı yol için sonuç önbelleğe alınır.
     NOT: Supabase public bucket'ta download() anon key ile çalışmaz.
     Bu yüzden önce fetch() ile dener, başarısız olursa getPublicUrl'e düşer. */
  var blobCache = {};
  function fetchImageBlob(path){
    if (!path||typeof path!=='string') return Promise.resolve('');
    var v=path.trim(); if (!v) return Promise.resolve('');
    /* Zaten tam URL ise direkt kullan (herhangi bir koruma yok) */
    if (/^https?:\/\//i.test(v)||/^data:image\//i.test(v)) return Promise.resolve(v);
    if (blobCache[v]) return Promise.resolve(blobCache[v]);
    if (!state.supabaseReady||!window.__sarkSupabase) return Promise.resolve('');
    /* Önce public URL'i al, sonra fetch ile blob'a dönüştür */
    var publicUrl;
    try {
      var r=window.__sarkSupabase.storage.from(BUCKET).getPublicUrl(v.replace(/^\/+/,''));
      publicUrl=(r&&r.data&&r.data.publicUrl)||'';
    } catch(e){ publicUrl=''; }
    if (!publicUrl) return Promise.resolve('');
    return fetch(publicUrl)
      .then(function(res){
        if (!res.ok) throw new Error('HTTP '+res.status);
        return res.blob();
      })
      .then(function(blob){
        try { var url=URL.createObjectURL(blob); blobCache[v]=url; return url; }
        catch(e){ return publicUrl; }
      })
      .catch(function(){
        /* fetch başarısız olduysa (CORS, ağ vb.) public URL'i yedek olarak kullan */
        blobCache[v]=publicUrl;
        return publicUrl;
      });
  }
  function assetPublicUrl(path){
    if (!path||typeof path!=='string') return '';
    var v=path.trim(); if (!v) return '';
    if (/^https?:\/\//i.test(v)||/^data:image\//i.test(v)) return v;
    if (!state.supabaseReady||!window.__sarkSupabase) return '';
    try { var r=window.__sarkSupabase.storage.from(ASSETS_BUCKET).getPublicUrl(v.replace(/^\/+/,'')); return (r&&r.data&&r.data.publicUrl)||''; }
    catch(e){ return ''; }
  }
  function whatsappConfigured(){
    var n=String(CONFIG.whatsappNumber||'').replace(/\D/g,'');
    return n.length>=10 && n.indexOf('X')===-1;
  }
  function getProdName(p){
    if (p._isSample && window.__sarkI18n) return window.__sarkI18n.getSampleName(p);
    var l=curLang();
    return p['name_'+l] || p.name || p.name_tr || t('product.unnamed');
  }
  function getProdDesc(p){
    if (p._isSample && window.__sarkI18n) return window.__sarkI18n.getSampleDesc(p);
    var l=curLang();
    return p['desc_'+l] || p.description || p.desc_tr || '';
  }
  function getCatName(c){
    var l=curLang(); return c['name_'+l] || c.name_tr || '';
  }
  function normalize(str){
    var s=String(str==null?'':str), lang=curLang();
    try { s=s.toLocaleLowerCase(lang); } catch(e){ s=s.toLowerCase(); }
    return s.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ı/g,'i').replace(/ş/g,'s').replace(/ğ/g,'g').replace(/ü/g,'u').replace(/ö/g,'o').replace(/ç/g,'c').trim();
  }
  function debounce(fn, wait){
    var t=null;
    return function(){ var args=arguments,ctx=this; if(t) clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); },wait); };
  }
  function toast(msg, kind){
    if (!els.toastStack) return;
    var el=document.createElement('div'); el.className='toast'+(kind?' is-'+kind:'');
    el.setAttribute('role','status'); el.textContent=msg; els.toastStack.appendChild(el);
    setTimeout(function(){ el.style.transition='opacity .3s, transform .3s'; el.style.opacity='0'; el.style.transform='translateY(6px)'; setTimeout(function(){ el.remove(); },320); },4200);
  }

  /* ---- Supabase ---- */
  function initSupabase(){
    var url=String(CONFIG.supabaseUrl||'').trim(), key=String(CONFIG.supabaseKey||'').trim();
    if (!url||!key||url.indexOf('YOUR-PROJECT')>-1){ state.error='Supabase bağlantı bilgileri config.js içinde eksik.'; return false; }
    if (!window.supabase||typeof window.supabase.createClient!=='function'){ state.error='Supabase kitaplığı yüklenemedi.'; return false; }
    try {
      window.__sarkSupabase = window.supabase.createClient(url, key, {
        auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:'sark-dokusu-auth' }
      });
      state.supabaseReady = true; return true;
    } catch(e){ state.error='Supabase istemcisi başlatılamadı.'; return false; }
  }
  /* Şema uyumsuzluğuna dayanıklı sorgu: tam kolon setiyle dener, kolon/tablo
     yoksa (PostgREST 42703 / PGRST205) temel kolonlara düşer. Böylece tek bir
     eksik kolon tüm vitrini boş bırakmaz. */
  var PRODUCT_COLS_FULL='id,name,description,price,category,category_id,image_url,stock,active,created_at,name_tr,name_en,name_ar,name_de,name_fr,desc_tr,desc_en,desc_ar,desc_de,desc_fr';
  var PRODUCT_COLS_BASE='id,name,description,price,category,image_url,stock,active,created_at';
  function isSchemaError(err){
    if (!err) return false;
    var code=String(err.code||'');
    return code==='42703'||code==='PGRST205'||code==='42P01'||/does not exist|schema cache/i.test(String(err.message||''));
  }
  function fetchProducts(){
    var sb=window.__sarkSupabase;
    return sb.from('products').select(PRODUCT_COLS_FULL)
      .eq('active',true).order('created_at',{ascending:false})
      .then(function(res){
        if (!res.error) return Array.isArray(res.data)?res.data:[];
        if (!isSchemaError(res.error)) throw res.error;
        return sb.from('products').select(PRODUCT_COLS_BASE)
          .eq('active',true).order('created_at',{ascending:false})
          .then(function(r2){ if (r2.error) throw r2.error; return Array.isArray(r2.data)?r2.data:[]; });
      });
  }
  function fetchCategories(){
    return window.__sarkSupabase.from('categories')
      .select('id,name_tr,name_en,name_ar,name_de,name_fr,parent_id,sort_order,active')
      .eq('active',true).order('sort_order',{ascending:true})
      .then(function(res){
        if (res.error){
          /* categories tablosu yoksa kategorileri ürünlerden türet */
          if (isSchemaError(res.error)) return [];
          throw res.error;
        }
        return Array.isArray(res.data)?res.data:[];
      });
  }
  function fetchSettings(){
    return window.__sarkSupabase.from('site_settings').select('*').eq('id',1).single()
      .then(function(res){
        if (res.error){
          /* site_settings tablosu yoksa varsayılanlarla devam et */
          if (isSchemaError(res.error)) return {};
          throw res.error;
        }
        return res.data||{};
      });
  }

  /* ---- Ayarları uygula ---- */
  function jget(obj, lang, fb){
    if (!obj) return fb||'';
    if (typeof obj==='string') return obj;
    return obj[lang] || obj.tr || fb || '';
  }
  function applySettings(s){
    state.settings = s || {};
    var name = state.settings.store_name || CONFIG.storeName || 'Şark Dokusu';
    document.querySelectorAll('[data-store-name]').forEach(function(n){ n.textContent = name; });
    if (state.settings.store_name) document.title = document.title.replace(/Şark Dokusu/g, name);
    var logo = state.settings.logo_url ? assetPublicUrl(state.settings.logo_url) : '';
    if (logo) document.querySelectorAll('.brand-mark img').forEach(function(img){ img.src = logo; });
    renderBanner();
    renderTrustItems();
  }
  function renderBanner(){
    var existing = byId('site-banner');
    if (existing) existing.remove();
    var s = state.settings || {};
    if (!s.banner_active) return;
    var l = curLang(), text = jget(s.banner_text, l, '');
    if (!text) return;
    var banner = document.createElement('div'); banner.id='site-banner'; banner.className='site-banner';
    var inner = document.createElement('div'); inner.className='wrap banner-inner';
    var span = document.createElement('span'); span.className='banner-text'; span.textContent = text;
    inner.appendChild(span);
    if (s.banner_link){
      var a=document.createElement('a'); a.className='banner-link'; a.href=s.banner_link;
      a.target='_blank'; a.rel='noopener noreferrer'; a.textContent='→'; inner.appendChild(a);
    }
    banner.appendChild(inner);
    if (s.banner_url){ var u=assetPublicUrl(s.banner_url); if (u) banner.style.backgroundImage='url("'+u.replace(/"/g,'%22')+'")'; }
    var hero = document.querySelector('.hero');
    if (hero && hero.parentNode) hero.parentNode.insertBefore(banner, hero.nextSibling);
    else { var main=document.querySelector('main'); if (main) main.insertBefore(banner, main.firstChild); }
  }
  function renderTrustItems(){
    var container = document.querySelector('.trust-grid');
    if (!container) return;
    var s = state.settings || {}, items = s.about_items;
    try { if (typeof items==='string') items=JSON.parse(items); } catch(e){ items=null; }
    if (!Array.isArray(items) || items.length===0) return;
    container.textContent='';
    var l = curLang();
    items.forEach(function(item){
      var title = item['title_'+l] || item.title_tr || '';
      var desc  = item['desc_'+l]  || item.desc_tr  || '';
      if (!title && !desc) return;
      var div = document.createElement('div'); div.className='trust-item';
      var h = document.createElement('h3'); h.textContent = title;
      var p = document.createElement('p');  p.textContent = desc;
      div.appendChild(h); div.appendChild(p);
      container.appendChild(div);
    });
  }

  /* ---- Ürün kartı ---- */
  function catNameById(id){
    for (var i=0;i<state.categories.length;i++){ if (state.categories[i].id===id) return getCatName(state.categories[i]); }
    return '';
  }
  function iconSvg(name){
    var ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.6');
    svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
    var D={
      leaf:['M11 20A7 7 0 0 1 4 13c0-5 4-9 9-9h7v3a9 9 0 0 1-9 9h-1','M4 21c1-4 3-6 6-8'],
      alert:['M12 9v4','M12 17h.01','M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z'],
      search:['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z','m21 21-4.3-4.3']
    };
    (D[name]||D.leaf).forEach(function(d){ var p=document.createElementNS(ns,'path'); p.setAttribute('d',d); svg.appendChild(p); });
    return svg;
  }
  function skeletonMarkup(n){
    var frag=document.createDocumentFragment();
    for (var i=0;i<n;i++){
      var li=document.createElement('li'); li.className='skeleton-card'; li.setAttribute('aria-hidden','true');
      var m=document.createElement('div'); m.className='sk-media sk-block';
      var l1=document.createElement('div'); l1.className='sk-line w-70';
      var l2=document.createElement('div'); l2.className='sk-line w-90';
      var l3=document.createElement('div'); l3.className='sk-line w-45';
      li.appendChild(m); li.appendChild(l1); li.appendChild(l2); li.appendChild(l3);
      frag.appendChild(li);
    }
    return frag;
  }
  function stateBox(opts){
    var li=document.createElement('li'); li.className='state-box'+(opts.kind==='error'?' is-error':'');
    var icon=document.createElement('div'); icon.className='state-icon'; icon.setAttribute('aria-hidden','true');
    icon.appendChild(iconSvg(opts.kind==='error'?'alert':'leaf'));
    var h3=document.createElement('h3'); h3.textContent=opts.title;
    var p=document.createElement('p'); p.textContent=opts.text;
    li.appendChild(icon); li.appendChild(h3); li.appendChild(p);
    if (opts.actionLabel && typeof opts.onAction==='function'){
      var btn=document.createElement('button'); btn.type='button'; btn.className='btn btn-outline';
      btn.textContent=opts.actionLabel; btn.addEventListener('click', opts.onAction); li.appendChild(btn);
    }
    return li;
  }

  function buildProductCard(product){
    var li=document.createElement('li'); li.className='product-card';
    var name=getProdName(product), desc=getProdDesc(product);
    var media=document.createElement('div'); media.className='card-media';
    var imgPath=product.image_url||'';
    var fallback=document.createElement('div'); fallback.className='media-fallback'; fallback.setAttribute('aria-hidden','true'); fallback.appendChild(iconSvg('leaf'));
    if (imgPath){
      /* Görseli blob olarak yükle — depo URL'i kaynak görünümünde gizlenir */
      var placeholder=document.createElement('div'); placeholder.className='card-img-placeholder'; media.appendChild(placeholder);
      fetchImageBlob(imgPath).then(function(blobUrl){
        placeholder.remove();
        if (!blobUrl){ media.appendChild(fallback); return; }
        var imgEl=new Image(); imgEl.loading='lazy'; imgEl.decoding='async';
        imgEl.alt=name||'Ürün fotoğrafı'; imgEl.src=blobUrl; imgEl.draggable=false;
        imgEl.addEventListener('error', function(){ imgEl.remove(); media.appendChild(fallback); });
        media.insertBefore(imgEl, media.firstChild);
      });
    } else media.appendChild(fallback);
    var stock=Number(product.stock);
    var hasStock= product.stock!==null && product.stock!==undefined && product.stock!=='' && isFinite(stock);
    var isOut = hasStock && stock<=0;
    var catName = product.category_id ? catNameById(product.category_id) : (product.category||'');
    if (catName||isOut){
      var badge=document.createElement('span'); badge.className='card-badge'+(isOut?' is-out':'');
      badge.textContent=isOut?t('badge.soldout'):catName; media.appendChild(badge);
    }
    /* Kart tıklaması: detay paneli aç (lightbox değil) */
    media.style.cursor='zoom-in';
    media.addEventListener('click',function(){ openProductDetail(product); });
    li.appendChild(media);
    var body=document.createElement('div'); body.className='card-body';
    var title=document.createElement('h3'); title.className='card-title'; title.textContent=name||t('product.unnamed'); body.appendChild(title);
    if (desc){ var d=document.createElement('p'); d.className='card-desc'; d.textContent=String(desc); body.appendChild(d); }
    var foot=document.createElement('div'); foot.className='card-foot';
    var priceRow=document.createElement('div'); priceRow.className='price-row';
    var price=document.createElement('span'); price.className='price'; price.textContent=formatPrice(product.price); priceRow.appendChild(price);
    if (hasStock){
      var sn=document.createElement('span'); sn.className='stock-note';
      if (stock<=0){ sn.classList.add('is-out'); sn.textContent=t('stock.out'); }
      else if (stock<=LOW_STOCK){ sn.classList.add('is-low'); sn.textContent=t('stock.low',{n:stock}); }
      else sn.textContent=t('stock.in');
      priceRow.appendChild(sn);
    }
    foot.appendChild(priceRow);
    var wa=document.createElement('a'); wa.className='btn btn-wa';
    var link=buildWhatsAppLink(product);
    if (!link){
      wa.setAttribute('role','button'); wa.setAttribute('aria-disabled','true'); wa.href='#';
      wa.textContent=t('product.order_btn');
      wa.addEventListener('click',function(e){ e.preventDefault(); toast(t('toast.whatsapp_missing'),'error'); });
    } else if (isOut){
      wa.href=link; wa.target='_blank'; wa.rel='noopener noreferrer'; wa.textContent=t('product.stock_query');
    } else {
      wa.href=link; wa.target='_blank'; wa.rel='noopener noreferrer'; wa.textContent=t('product.order_btn');
      wa.setAttribute('aria-label',t('product.order_aria',{name:name}));
    }
    foot.appendChild(wa); body.appendChild(foot); li.appendChild(body);
    return li;
  }

  function buildWhatsAppLink(product){
    if (!whatsappConfigured()) return null;
    var number=String(CONFIG.whatsappNumber).replace(/\D/g,'');
    var store=(state.settings&&state.settings.store_name)||CONFIG.storeName||'Şark Dokusu';
    var name=getProdName(product);
    var lines=[t('wa.greeting',{store:store}),'',t('wa.product',{name:name}),t('wa.price',{price:formatPrice(product.price)}),t('wa.id',{id:String(product.id||'')})];
    return 'https://wa.me/'+number+'?text='+encodeURIComponent(lines.join('\n'));
  }

  /* ---- Katman yığını ----
     Detay paneli açıkken üstüne lightbox açılabiliyor. Her katman kendi
     ESC dinleyicisini eklerse tek tuş ikisini birden kapatır. Bu yüzden
     tek bir document dinleyicisi yalnızca en üstteki katmanı kapatır. */
  var layerStack=[];
  function pushLayer(closeFn){
    layerStack.push(closeFn);
    document.body.style.overflow='hidden';
    if (layerStack.length===1) document.addEventListener('keydown', escTopLayer);
  }
  function popLayer(closeFn){
    var i=layerStack.indexOf(closeFn);
    if (i>-1) layerStack.splice(i,1);
    if (!layerStack.length){
      document.removeEventListener('keydown', escTopLayer);
      document.body.style.overflow='';
    }
  }
  function escTopLayer(e){
    if (e.key!=='Escape'||!layerStack.length) return;
    e.preventDefault();
    layerStack[layerStack.length-1]();
  }

  /* ---- Lightbox ---- */
  function openLightbox(src, caption){
    if (!src) return;
    var box=document.createElement('div'); box.className='lightbox';
    box.setAttribute('role','dialog'); box.setAttribute('aria-modal','true');
    box.setAttribute('aria-label', caption||'Ürün fotoğrafı');
    var img=new Image(); img.alt=caption||''; img.className='lightbox-img'; img.draggable=false;
    /* Blob URL kullan — gerçek depo yolunu sayfa kaynağında gizler */
    img.src=src;
    var close=document.createElement('button'); close.type='button'; close.className='lightbox-close';
    close.setAttribute('aria-label','Kapat'); close.textContent='×';
    var cap=document.createElement('div'); cap.className='lightbox-cap';
    if (caption) cap.textContent=caption;
    box.appendChild(close); box.appendChild(img); box.appendChild(cap);
    document.body.appendChild(box);
    requestAnimationFrame(function(){ box.classList.add('is-open'); });
    function closeBox(){
      box.classList.remove('is-open');
      popLayer(closeBox);
      setTimeout(function(){ if (box.parentNode) box.remove(); },220);
    }
    pushLayer(closeBox);
    close.addEventListener('click', closeBox);
    box.addEventListener('click', function(e){ if (e.target===box) closeBox(); });
  }

  /* ---- Ürün detay paneli ---- */
  function openProductDetail(product){
    var name=getProdName(product), desc=getProdDesc(product);
    var imgPath=product.image_url||'';
    var panel=document.createElement('div'); panel.className='prod-detail-overlay';
    panel.setAttribute('role','dialog'); panel.setAttribute('aria-modal','true');
    panel.setAttribute('aria-label',name||'Ürün detayı');
    var inner=document.createElement('div'); inner.className='prod-detail-inner';
    /* Kapat butonu */
    var closeBtn=document.createElement('button'); closeBtn.type='button';
    closeBtn.className='prod-detail-close'; closeBtn.setAttribute('aria-label','Kapat');
    closeBtn.textContent='×'; inner.appendChild(closeBtn);
    /* Görsel alanı */
    var mediaWrap=document.createElement('div'); mediaWrap.className='prod-detail-media';
    if (imgPath){
      var spinner=document.createElement('div'); spinner.className='pd-spinner'; mediaWrap.appendChild(spinner);
      fetchImageBlob(imgPath).then(function(blobUrl){
        spinner.remove();
        if (!blobUrl){ var fb=document.createElement('div'); fb.className='media-fallback'; fb.setAttribute('aria-hidden','true'); fb.appendChild(iconSvg('leaf')); mediaWrap.appendChild(fb); return; }
        var img=new Image(); img.alt=name||'Ürün fotoğrafı'; img.className='prod-detail-img'; img.draggable=false;
        img.src=blobUrl;
        img.addEventListener('contextmenu',function(e){ e.preventDefault(); toast(t('toast.image_protected'),'info'); });
        img.addEventListener('dragstart',function(e){ e.preventDefault(); });
        /* Büyütmek için lightbox aç */
        img.style.cursor='zoom-in';
        img.addEventListener('click',function(){ openLightbox(blobUrl, name); });
        mediaWrap.appendChild(img);
      });
    } else {
      var fb=document.createElement('div'); fb.className='media-fallback pd-fallback'; fb.setAttribute('aria-hidden','true'); fb.appendChild(iconSvg('leaf')); mediaWrap.appendChild(fb);
    }
    /* Bilgi alanı */
    var info=document.createElement('div'); info.className='prod-detail-info';
    var catName=product.category_id?catNameById(product.category_id):(product.category||'');
    if (catName){ var catTag=document.createElement('span'); catTag.className='pd-cat'; catTag.textContent=catName; info.appendChild(catTag); }
    var title=document.createElement('h2'); title.className='pd-title'; title.textContent=name||t('product.unnamed'); info.appendChild(title);
    var priceEl=document.createElement('div'); priceEl.className='pd-price'; priceEl.textContent=formatPrice(product.price); info.appendChild(priceEl);
    var stock=Number(product.stock);
    var hasStock=product.stock!==null&&product.stock!==undefined&&product.stock!==''&&isFinite(stock);
    if (hasStock){
      var sn=document.createElement('div'); sn.className='pd-stock';
      if (stock<=0){ sn.classList.add('is-out'); sn.textContent=t('stock.out'); }
      else if (stock<=LOW_STOCK){ sn.classList.add('is-low'); sn.textContent=t('stock.low',{n:stock}); }
      else sn.textContent=t('stock.in');
      info.appendChild(sn);
    }
    if (desc){ var descEl=document.createElement('p'); descEl.className='pd-desc'; descEl.textContent=String(desc); info.appendChild(descEl); }
    /* WhatsApp butonu */
    var isOut=hasStock&&stock<=0;
    var wa=document.createElement('a'); wa.className='btn btn-wa pd-wa';
    var link=buildWhatsAppLink(product);
    if (!link){
      wa.setAttribute('role','button'); wa.setAttribute('aria-disabled','true'); wa.href='#';
      wa.textContent=t('product.order_btn');
      wa.addEventListener('click',function(e){ e.preventDefault(); toast(t('toast.whatsapp_missing'),'error'); });
    } else if (isOut){
      wa.href=link; wa.target='_blank'; wa.rel='noopener noreferrer'; wa.textContent=t('product.stock_query');
    } else {
      wa.href=link; wa.target='_blank'; wa.rel='noopener noreferrer'; wa.textContent=t('product.order_btn');
      wa.setAttribute('aria-label',t('product.order_aria',{name:name}));
    }
    info.appendChild(wa);
    inner.appendChild(mediaWrap); inner.appendChild(info);
    panel.appendChild(inner);
    document.body.appendChild(panel);
    requestAnimationFrame(function(){ panel.classList.add('is-open'); });
    function closePanel(){
      panel.classList.remove('is-open');
      popLayer(closePanel);
      setTimeout(function(){ if (panel.parentNode) panel.remove(); },240);
    }
    pushLayer(closePanel);
    closeBtn.addEventListener('click', closePanel);
    panel.addEventListener('click', function(e){ if (e.target===panel) closePanel(); });
  }

  /* ---- Filtreleme ---- */
  function filteredProducts(){
    var q=normalize(state.search);
    return state.products.filter(function(p){
      if (state.category!=='__all__'){
        if (p.category_id){ if (p.category_id!==state.category) return false; }
        else { if ((p.category||'').trim()!==state.category) return false; }
      }
      if (!q) return true;
      var hay=normalize([getProdName(p),getProdDesc(p),catNameById(p.category_id),p.category||''].join(' '));
      return hay.indexOf(q)>-1;
    });
  }
  function renderChips(){
    if (!els.chips) return;
    els.chips.textContent='';
    if (state.categories.length===0){ els.chips.hidden=true; return; }
    els.chips.hidden=false;
    var all=document.createElement('button'); all.type='button'; all.className='chip';
    all.textContent=t('chip.all'); all.setAttribute('aria-pressed', String(state.category==='__all__'));
    all.addEventListener('click',function(){ state.category='__all__'; renderChips(); renderGrid(); });
    els.chips.appendChild(all);
    var roots=state.categories.filter(function(c){ return !c.parent_id; });
    roots.forEach(function(c){
      var b=document.createElement('button'); b.type='button'; b.className='chip';
      b.textContent=getCatName(c); b.setAttribute('aria-pressed', String(state.category===c.id));
      b.addEventListener('click',function(){ state.category=c.id; renderChips(); renderGrid(); });
      els.chips.appendChild(b);
      state.categories.filter(function(ch){ return ch.parent_id===c.id; }).forEach(function(ch){
        var cb=document.createElement('button'); cb.type='button'; cb.className='chip chip-sub';
        cb.textContent='— '+getCatName(ch); cb.setAttribute('aria-pressed', String(state.category===ch.id));
        cb.addEventListener('click',function(){ state.category=ch.id; renderChips(); renderGrid(); });
        els.chips.appendChild(cb);
      });
    });
  }
  function renderGrid(){
    if (!els.grid) return;
    els.grid.setAttribute('aria-busy', String(!!state.loading));
    if (state.loading){
      els.grid.textContent=''; els.grid.appendChild(skeletonMarkup(6));
      if (els.count) els.count.textContent=t('loading'); return;
    }
    if (state.error){
      els.grid.textContent='';
      els.grid.appendChild(stateBox({ kind:'error', title:t('state.error_title'), text:state.error,
        actionLabel:t('state.error_action'), onAction:function(){ load(); } }));
      if (els.count) els.count.textContent=''; return;
    }
    var list=filteredProducts();
    els.grid.textContent='';
    if (list.length===0){
      var isSearch = state.search.length>0 || state.category!=='__all__';
      els.grid.appendChild(stateBox({ kind:'info',
        title: isSearch?t('state.noresults_title'):t('state.empty_title'),
        text:  isSearch?t('state.noresults_text'):t('state.empty_text'),
        actionLabel: isSearch?t('state.noresults_action'):undefined,
        onAction: function(){ state.search=''; state.category='__all__'; if(els.search) els.search.value=''; updateClearButton(); renderChips(); renderGrid(); }
      }));
      if (els.count) els.count.textContent=t('count.products',{n:0}); return;
    }
    var frag=document.createDocumentFragment();
    list.forEach(function(p){ frag.appendChild(buildProductCard(p)); });
    els.grid.appendChild(frag);
    if (els.count) els.count.textContent=t('count.products',{n:list.length});
  }
  function updateClearButton(){ if (!els.clear) return; els.clear.classList.toggle('is-visible', state.search.length>0); }

  /* ---- Yükleme ---- */
  function load(){
    state.loading=true; state.error=null; renderGrid();
    if (!state.supabaseReady){
      state.loading=false; state.error=t('error.fetch',{detail:'Supabase bağlantısı kurulamadı.'}); renderGrid(); return;
    }
    Promise.all([fetchSettings(), fetchCategories(), fetchProducts()])
      .then(function(results){
        applySettings(results[0]);
        state.categories = results[1];
        state.products = results[2].filter(function(p){ return p && p.active!==false; });
        state.loading=false;
        renderChips(); renderGrid();
      })
      .catch(function(err){
        state.products=[]; state.categories=[]; state.loading=false;
        var detail = err&&(err.message||err.msg)?(err.message||err.msg):'bilinmeyen hata';
        state.error=t('error.fetch',{detail:detail}); renderGrid();
        if (window.console&&console.error) console.error('[Şark Dokusu] yükleme hatası:', err);
      });
  }

  /* ---- Görsel koruması (caydırıcı) ---- */
  function attachImageProtection(){
    document.addEventListener('contextmenu', function(e){
      var tg=e.target;
      if (tg && tg.tagName==='IMG' && (tg.closest('.card-media')||tg.closest('.lightbox')||tg.closest('.prod-detail-media'))){
        e.preventDefault(); toast(t('toast.image_protected'),'info');
      }
    });
    document.addEventListener('dragstart', function(e){
      var tg=e.target;
      if (tg && tg.tagName==='IMG' && (tg.closest('.card-media')||tg.closest('.lightbox')||tg.closest('.prod-detail-media'))){ e.preventDefault(); }
    });
    /* Klavye kısayolu ile kaydetmeye (Ctrl/Cmd+S, Ctrl/Cmd+U) karşı basit uyarı */
    document.addEventListener('keydown', function(e){
      if ((e.ctrlKey||e.metaKey) && (e.key==='s'||e.key==='S'||e.key==='u'||e.key==='U')){
        var active=document.activeElement;
        if (active && (active.tagName==='INPUT'||active.tagName==='TEXTAREA')) return;
        /* Sadece detay paneli veya lightbox açıkken engelle */
        if (document.querySelector('.prod-detail-overlay.is-open')||document.querySelector('.lightbox.is-open')){
          e.preventDefault();
        }
      }
    });
  }

  /* ---- Olaylar ---- */
  function bindEvents(){
    if (els.search){
      var onSearch=debounce(function(e){ state.search=e.target.value||''; updateClearButton(); renderGrid(); }, SEARCH_DEBOUNCE);
      els.search.addEventListener('input', onSearch);
    }
    if (els.clear){
      els.clear.addEventListener('click', function(){ state.search=''; if(els.search){ els.search.value=''; els.search.focus(); } updateClearButton(); renderGrid(); });
    }
  }
  function applyConfigStatic(){
    var name=CONFIG.storeName||'Şark Dokusu';
    document.querySelectorAll('[data-store-name]').forEach(function(n){ n.textContent=name; });
    if (CONFIG.storeName) document.title=document.title.replace(/Şark Dokusu/g, name);
    var yearEl=byId('year'); if (yearEl) yearEl.textContent=String(new Date().getFullYear());
  }

  /* ---- Başlat ---- */
  function init(){
    els.grid=byId('product-grid'); els.chips=byId('category-chips');
    els.search=byId('search-input'); els.clear=byId('search-clear');
    els.count=byId('result-count'); els.toastStack=byId('toast-stack');
    applyConfigStatic();
    bindEvents();
    attachImageProtection();
    if (window.__sarkI18n){
      window.__sarkI18n.subscribe(function(){ renderChips(); renderGrid(); renderBanner(); renderTrustItems(); });
    }
    if (!initSupabase()){
      state.loading=false; state.error=t('error.fetch',{detail:'Supabase yapılandırması eksik veya geçersiz.'}); renderGrid(); return;
    }
    load();
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
