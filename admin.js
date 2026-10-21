/* ==========================================================================
   ŞARK DOKUSU — admin.js (v2)
   Çok panelli yönetim: ürünler, kategoriler, banner, ayarlar, hakkımızda, hesap.
   --------------------------------------------------------------------------
   GÜVENLİK: Arayüz kontrolü yalnızca görünürlük içindir. Asıl yetki Supabase
   RLS politikalarındadır (yazma/yükleme sadece is_admin() kullanıcısına).
   ========================================================================== */
(function () {
  'use strict';

  var CONFIG = window.SARK_CONFIG || {};
  var IMG_BUCKET = 'product-images';
  var ASSETS_BUCKET = 'site-assets';
  var MAX_FILE_BYTES = 3 * 1024 * 1024;
  var MAX_ASSET_BYTES = 5 * 1024 * 1024;
  var ALLOWED = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
  var LANGS = ['tr','en','ar','de','fr'];
  var PANEL_TITLES = {
    products:'Ürünler', categories:'Kategoriler', banner:'Banner',
    settings:'Site Ayarları', about:'Hakkımızda', account:'Hesap'
  };

  var sb = null, session = null, busy = false;
  var products = [], categories = [], settings = null;
  var editingId = null, currentImagePath = '', pendingFile = null, prodLang = 'tr';
  var catEditingId = null, catLang = 'tr';
  var bannerLang = 'tr', bannerPendingFile = null;
  var logoPendingFile = null;
  var els = {};

  /* ===================== Yardımcılar ===================== */
  function byId(id){ return document.getElementById(id); }
  function errText(err){
    if (!err) return 'Bilinmeyen hata.';
    var m = err.message||err.error_description||err.msg||err.error;
    return m ? String(m) : 'Bilinmeyen hata.';
  }
  function formatPrice(v){
    var n = Number(v);
    if (!isFinite(n)) return '—';
    try { return new Intl.NumberFormat('tr-TR',{style:'currency',currency:'TRY',minimumFractionDigits:2,maximumFractionDigits:2}).format(n); }
    catch(e){ return n.toFixed(2)+' ₺'; }
  }
  function parsePrice(raw){
    var s = String(raw==null?'':raw).replace(/[^\d.,-]/g,'').trim();
    if (!s) return NaN;
    if (s.indexOf(',')>-1 && s.indexOf('.')>-1 && s.lastIndexOf('.')<s.lastIndexOf(',')) s = s.replace(/\./g,'').replace(',','.');
    else if (s.indexOf(',')>-1 && s.indexOf('.')===-1) s = s.replace(',','.');
    var n = Number(s); return isFinite(n)?n:NaN;
  }
  function imgPublicUrl(path){
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (!sb) return '';
    var r = sb.storage.from(IMG_BUCKET).getPublicUrl(path.replace(/^\/+/,''));
    return (r&&r.data&&r.data.publicUrl)||'';
  }
  function assetPublicUrl(path){
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    if (!sb) return '';
    var r = sb.storage.from(ASSETS_BUCKET).getPublicUrl(path.replace(/^\/+/,''));
    return (r&&r.data&&r.data.publicUrl)||'';
  }
  function randomId(){
    if (window.crypto && typeof window.crypto.randomUUID==='function') return window.crypto.randomUUID();
    return 'a'+Date.now()+Math.random().toString(36).slice(2,10);
  }
  function toast(msg, kind){
    if (!els.toastStack) return;
    var el = document.createElement('div');
    el.className = 'toast'+(kind?' is-'+kind:'');
    el.setAttribute('role','status');
    el.textContent = msg;
    els.toastStack.appendChild(el);
    setTimeout(function(){
      el.style.transition='opacity .3s, transform .3s';
      el.style.opacity='0'; el.style.transform='translateY(6px)';
      setTimeout(function(){ el.remove(); },320);
    },4200);
  }
  function showAlert(el, msg, kind){
    if (!el) return;
    if (!msg){ el.hidden=true; el.textContent=''; return; }
    el.className='alert is-'+(kind||'error');
    el.textContent=msg; el.hidden=false;
  }
  function setBusy(state, label){
    busy=state;
    if (els.saveBtn){ els.saveBtn.disabled=state; if(els.saveLabel) els.saveLabel.textContent = state ? (label||'Kaydediliyor…') : 'Ürünü kaydet'; }
  }
  function validateFile(file, max){
    if (!file) return null;
    var type = String(file.type||'').toLowerCase();
    if (!ALLOWED[type]) return 'Yalnızca JPG, PNG veya WebP formatında görsel yükleyebilirsiniz.';
    if (file.size > (max||MAX_FILE_BYTES)) {
      var mb = (file.size/1024/1024).toFixed(1);
      return 'Görsel çok büyük ('+mb+' MB). En fazla '+(((max||MAX_FILE_BYTES)/1048576).toFixed(0))+' MB olmalıdır.';
    }
    return null;
  }
  /* ===================== Supabase ===================== */
  function initSupabase(){
    var url = String(CONFIG.supabaseUrl||'').trim();
    var key = String(CONFIG.supabaseKey||'').trim();
    if (!url || !key) return 'config.js içinde Supabase URL veya anahtar eksik.';
    if (!window.supabase || typeof window.supabase.createClient!=='function')
      return 'Supabase kitaplığı yüklenemedi. İnternet bağlantınızı kontrol edin.';
    try {
      sb = window.supabase.createClient(url, key, {
        auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:true, storageKey:'sark-dokusu-auth' }
      });
      return null;
    } catch(e){ return 'Supabase istemcisi başlatılamadı: '+errText(e); }
  }
  function checkIsAdmin(){
    return sb.rpc('is_admin').then(function(res){
      if (res.error) return { ok:false, error:res.error };
      return { ok: res.data===true, error:null };
    }, function(e){ return { ok:false, error:e }; });
  }

  /* ===================== Görünüm geçişi ===================== */
  function showLogin(msg){
    if (els.adminView) els.adminView.hidden = true;
    if (els.loginView) els.loginView.hidden = false;
    showAlert(els.loginAlert, msg||'', 'error');
  }
  function showAdmin(){
    if (els.loginView) els.loginView.hidden = true;
    if (els.adminView) els.adminView.hidden = false;
    showAlert(els.loginAlert, '');
  }

  /* ===================== Panel geçişi ===================== */
  function switchPanel(name){
    document.querySelectorAll('.snav-item[data-tab]').forEach(function(b){
      b.classList.toggle('is-active', b.getAttribute('data-tab')===name);
    });
    document.querySelectorAll('.tab-panel').forEach(function(p){ p.hidden = true; });
    var panel = byId('tab-'+name);
    if (panel) panel.hidden = false;
    if (els.panelTitle) els.panelTitle.textContent = PANEL_TITLES[name] || '';
    if (name==='products') loadProducts();
    if (name==='categories') loadCategories();
    if (name==='banner' || name==='settings' || name==='about') loadSettings();
    if (name==='account' && session && session.user)
      if (els.accountEmail) els.accountEmail.textContent = session.user.email || '—';
  }

  /* ===================== Dil sekmesi yöneticisi ===================== */
  function bindLangTabs(tabsEl, onSwitch){
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.ltab').forEach(function(tab){
      tab.addEventListener('click', function(){
        var lang = tab.getAttribute('data-lang');
        tabsEl.querySelectorAll('.ltab').forEach(function(t){
          t.classList.toggle('is-active', t===tab);
          t.setAttribute('aria-selected', String(t===tab));
        });
        if (typeof onSwitch==='function') onSwitch(lang);
      });
    });
  }
  function setLangTabsActive(tabsEl, lang){
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.ltab').forEach(function(t){
      t.classList.toggle('is-active', t.getAttribute('data-lang')===lang);
      t.setAttribute('aria-selected', String(t.getAttribute('data-lang')===lang));
    });
  }
  function upper(lang){ return String(lang||'tr').toUpperCase(); }

  /* ===================== ÜRÜNLER ===================== */
  function loadProducts(){
    if (els.listState){ els.listState.hidden=false; els.listState.textContent='Ürünler yükleniyor…'; }
    return sb.from('products')
      .select('id,name,description,price,category,category_id,image_url,stock,active,sort_order,created_at,name_tr,name_en,name_ar,name_de,name_fr,desc_tr,desc_en,desc_ar,desc_de,desc_fr')
      .order('created_at',{ascending:false})
      .then(function(res){
        if (res.error) throw res.error;
        products = Array.isArray(res.data) ? res.data : [];
        renderProductList();
        populateProductCategorySelect();
      })
      .catch(function(err){
        products = []; renderProductList(); populateProductCategorySelect();
        showAlert(els.globalAlert,'Ürünler yüklenemedi: '+errText(err),'error');
        if (window.console&&console.error) console.error('[admin] ürün listesi:',err);
      });
  }
  function getProdName(p, lang){
    lang = lang || 'tr';
    return p['name_'+lang] || p.name || p.name_tr || '';
  }
  function renderProductList(){
    if (!els.list) return;
    els.list.textContent = '';
    if (els.productCount) els.productCount.textContent = products.length+' ürün';
    if (products.length===0){
      if (els.listState){
        els.listState.hidden=false;
        var s = document.createElement('strong'); s.textContent='Henüz ürün yok';
        els.listState.textContent='';
        els.listState.appendChild(s);
        els.listState.appendChild(document.createTextNode(' Soldaki formdan ilk ürününüzü ekleyin.'));
      }
      return;
    }
    if (els.listState) els.listState.hidden=true;
    var frag = document.createDocumentFragment();
    products.forEach(function(p){ frag.appendChild(buildProductRow(p)); });
    els.list.appendChild(frag);
  }
  function buildProductRow(p){
    var li = document.createElement('li');
    li.className = 'admin-item'+(p.active===false?' is-inactive':'')+(editingId===p.id?' is-editing':'');
    li.dataset.id = p.id;
    var thumb = document.createElement('div'); thumb.className='admin-thumb';
    var src = imgPublicUrl(p.image_url);
    if (src){
      var img = new Image(); img.alt=''; img.loading='lazy';
      img.style.cssText='width:100%;height:100%;object-fit:cover;';
      img.src=src;
      img.addEventListener('error', function(){ img.remove(); thumb.textContent='Fotoğraf yok'; });
      thumb.appendChild(img);
    } else thumb.textContent='Fotoğraf yok';
    var body = document.createElement('div'); body.className='admin-item-body';
    var title = document.createElement('div'); title.className='admin-item-title';
    title.textContent = getProdName(p,'tr') || 'İsimsiz ürün'; title.title = title.textContent;
    var meta = document.createElement('div'); meta.className='admin-item-meta';
    var priceSpan = document.createElement('span'); priceSpan.textContent=formatPrice(p.price); meta.appendChild(priceSpan);
    meta.appendChild(sep());
    var stockSpan = document.createElement('span'); stockSpan.textContent='Stok: '+(p.stock==null?'—':String(p.stock)); meta.appendChild(stockSpan);
    meta.appendChild(sep());
    var catName = categoryNameForProduct(p);
    if (catName){ var catSpan=document.createElement('span'); catSpan.textContent=catName; meta.appendChild(catSpan); meta.appendChild(sep()); }
    var tag = document.createElement('span'); tag.className='status-tag '+(p.active===false?'off':'on');
    tag.textContent = p.active===false?'Yayında değil':'Yayında'; meta.appendChild(tag);
    body.appendChild(title); body.appendChild(meta);
    var actions = document.createElement('div'); actions.className='admin-item-actions';
    actions.appendChild(actionBtn(p.active===false?'Yayına al':'Yayından kaldır', p.active===false?'eye':'eyeOff', function(){ toggleProductActive(p); }));
    actions.appendChild(actionBtn('Düzenle','edit', function(){ startEditProduct(p); }));
    actions.appendChild(actionBtn('Kopyala','copy', function(){ duplicateProduct(p); }));
    actions.appendChild(actionBtn('Sil','trash', function(){ deleteProduct(p); }, true));
    li.appendChild(thumb); li.appendChild(body); li.appendChild(actions);
    return li;
  }
  function actionBtn(label, iconName, onClick, danger){
    var b = document.createElement('button');
    b.type='button'; b.className='icon-btn'+(danger?' is-danger':'');
    b.title=label; b.setAttribute('aria-label',label);
    b.appendChild(iconSvg(iconName));
    b.addEventListener('click', onClick);
    return b;
  }
  function sep(){ var s=document.createElement('span'); s.className='sep'; s.textContent='·'; return s; }
  function iconSvg(name){
    var ns='http://www.w3.org/2000/svg', svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('fill','none');
    svg.setAttribute('stroke','currentColor'); svg.setAttribute('stroke-width','1.7');
    svg.setAttribute('stroke-linecap','round'); svg.setAttribute('stroke-linejoin','round');
    svg.setAttribute('aria-hidden','true');
    var D = {
      edit:['M12 20h9','M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z'],
      trash:['M3 6h18','M8 6V4h8v2','M19 6l-1 14H6L5 6','M10 11v6','M14 11v6'],
      eye:['M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z','M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
      eyeOff:['M3 3l18 18','M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.4 4.1','M6.2 7.4C3.7 9.1 2 12 2 12s3.6 7 10 7a9.9 9.9 0 0 0 4-.8'],
      copy:['M9 9h11v11H9z','M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1'],
      plus:['M12 5v14','M5 12h14'],
      save:['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z','M17 21v-8H7v8','M7 3v5h8']
    };
    (D[name]||D.edit).forEach(function(d){ var p=document.createElementNS(ns,'path'); p.setAttribute('d',d); svg.appendChild(p); });
    return svg;
  }
  function categoryNameForProduct(p){
    if (p.category_id){
      for (var i=0;i<categories.length;i++){ if (categories[i].id===p.category_id) return categories[i].name_tr||''; }
    }
    return p.category || '';
  }

  /* ---- Ürün formu: çok dilli ---- */
  function bindProductLangTabs(){
    bindLangTabs(els.productLangTabs, function(lang){
      saveProductLangFromFields(prodLang);
      prodLang = lang;
      loadProductLangToFields(lang);
    });
  }
  /* HTML her dil için ayrı alan kullanır: #p-name-tr / #p-desc-tr … */
  function saveProductLangFromFields(lang){
    LANGS.forEach(function(l){
      var n = byId('p-name-'+l), d = byId('p-desc-'+l);
      if (n) els['pName_'+l] = n.value;
      if (d) els['pDesc_'+l] = d.value;
    });
  }
  function loadProductLangToFields(lang){
    LANGS.forEach(function(l){
      var n = byId('p-name-'+l), d = byId('p-desc-'+l);
      if (n) n.value = els['pName_'+l] || '';
      if (d) d.value = els['pDesc_'+l] || '';
      var nf = byId('pf-name-'+l), df = byId('pf-desc-'+l);
      if (nf) nf.hidden = (l!==lang);
      if (df) df.hidden = (l!==lang);
    });
  }
  function clearProductForm(){
    editingId = null; pendingFile = null; currentImagePath = '';
    LANGS.forEach(function(l){ els['pName_'+l]=''; els['pDesc_'+l]=''; });
    if (els.productForm) els.productForm.reset();
    if (els.productId) els.productId.value='';
    if (els.active) els.active.checked=true;
    if (els.formTitle) els.formTitle.textContent='Yeni ürün';
    if (els.cancelEdit) els.cancelEdit.hidden=true;
    if (els.removeImage) els.removeImage.hidden=true;
    setLangTabsActive(els.productLangTabs, 'tr');
    prodLang='tr'; loadProductLangToFields('tr');
    updateProductPreview('');
    setBusy(false);
    renderProductList();
  }
  function startEditProduct(p){
    editingId = p.id; pendingFile = null; currentImagePath = p.image_url || '';
    if (els.productId) els.productId.value = p.id;
    LANGS.forEach(function(l){
      els['pName_'+l] = p['name_'+l] || (l==='tr' ? (p.name||'') : '');
      els['pDesc_'+l] = p['desc_'+l] || (l==='tr' ? (p.description||'') : '');
    });
    if (els.price) els.price.value = p.price==null?'':String(p.price);
    if (els.stock) els.stock.value = p.stock==null?'':String(p.stock);
    if (els.categoryId) els.categoryId.value = p.category_id || '';
    if (els.active) els.active.checked = p.active!==false;
    if (els.image) els.image.value='';
    if (els.formTitle) els.formTitle.textContent='Ürünü düzenle';
    if (els.cancelEdit) els.cancelEdit.hidden=false;
    setLangTabsActive(els.productLangTabs,'tr'); prodLang='tr'; loadProductLangToFields('tr');
    updateProductPreview(currentImagePath);
    renderProductList();
    if (els.formTitle && els.formTitle.scrollIntoView) els.formTitle.scrollIntoView({behavior:'smooth',block:'center'});
    var first = byId('p-name-tr');
    if (first) first.focus({preventScroll:true});
  }
  function onProductFileChange(){
    var file = els.image && els.image.files ? els.image.files[0] : null;
    if (!file){ pendingFile=null; return; }
    var problem = validateFile(file, MAX_FILE_BYTES);
    if (problem){ showAlert(els.globalAlert, problem,'error'); els.image.value=''; pendingFile=null; updateProductPreview(currentImagePath); return; }
    showAlert(els.globalAlert,'');
    pendingFile = file;
    updateProductPreview(URL.createObjectURL(file));
  }
  function updateProductPreview(pathOrUrl){
    if (!els.preview) return;
    var src = pathOrUrl ? (/^blob:/i.test(pathOrUrl)||/^https?:/i.test(pathOrUrl)?pathOrUrl:imgPublicUrl(pathOrUrl)) : '';
    els.preview.style.backgroundImage = src ? 'url("'+src.replace(/"/g,'%22')+'")' : '';
    els.preview.textContent = src ? '' : 'Fotoğraf yok';
    if (els.removeImage) els.removeImage.hidden = !src;
  }
  function uploadImage(file){
    var ext = ALLOWED[String(file.type).toLowerCase()];
    var path = 'products/'+randomId()+'.'+ext;
    return sb.storage.from(IMG_BUCKET).upload(path, file, {cacheControl:'3600',upsert:false,contentType:file.type})
      .then(function(res){ if (res.error) throw res.error; return path; });
  }
  function collectProductForm(){
    saveProductLangFromFields(prodLang);
    var nameTr = (els['pName_tr']||'').trim();
    if (!nameTr) return { error:'Ürün adı (Türkçe) zorunludur.' };
    if (nameTr.length>120) return { error:'Ürün adı en fazla 120 karakter olabilir.' };
    var price = parsePrice(els.price?els.price.value:'');
    if (!isFinite(price)||price<0) return { error:'Geçerli bir fiyat girin (örn. 49.99).' };
    var stockRaw = els.stock?String(els.stock.value).trim():'';
    var stock = stockRaw===''?null:Number(stockRaw);
    if (stock!==null && (!isFinite(stock)||stock<0||Math.floor(stock)!==stock)) return { error:'Stok sıfır veya pozitif tam sayı olmalıdır.' };
    var payload = {
      name: nameTr, price: Math.round(price*100)/ 100, stock: stock,
      category_id: (els.categoryId?els.categoryId.value:'') || null,
      description: (els['pDesc_tr']||'').trim() || null,
      active: !!(els.active && els.active.checked)
    };
    payload.name_tr = nameTr;
    payload.name_en = (els['pName_en']||'').trim() || null;
    payload.name_ar = (els['pName_ar']||'').trim() || null;
    payload.name_de = (els['pName_de']||'').trim() || null;
    payload.name_fr = (els['pName_fr']||'').trim() || null;
    payload.desc_tr = (els['pDesc_tr']||'').trim() || null;
    payload.desc_en = (els['pDesc_en']||'').trim() || null;
    payload.desc_ar = (els['pDesc_ar']||'').trim() || null;
    payload.desc_de = (els['pDesc_de']||'').trim() || null;
    payload.desc_fr = (els['pDesc_fr']||'').trim() || null;
    var catId = payload.category_id;
    if (catId){ for (var i=0;i<categories.length;i++){ if (categories[i].id===catId){ payload.category = categories[i].name_tr || null; break; } } }
    else payload.category = null;
    return { value: payload };
  }
  function saveProduct(e){
    if (e) e.preventDefault();
    if (busy) return;
    showAlert(els.globalAlert,'');
    var collected = collectProductForm();
    if (collected.error){ showAlert(els.globalAlert,collected.error,'error'); toast(collected.error,'error'); return; }
    var payload = collected.value;
    setBusy(true, pendingFile?'Fotoğraf yükleniyor…':'Kaydediliyor…');
    var uploadStep = pendingFile ? uploadImage(pendingFile) : Promise.resolve(null);
    uploadStep.then(function(newPath){
      if (newPath) payload.image_url = newPath;
      else if (currentImagePath) payload.image_url = currentImagePath;
      else payload.image_url = null;
      if (editingId) return sb.from('products').update(payload).eq('id',editingId).select('id').single();
      return sb.from('products').insert(payload).select('id').single();
    }).then(function(res){
      if (!res) return;
      if (res.error) throw res.error;
      if (editingId && payload.image_url!==currentImagePath && currentImagePath) removeStoredImage(currentImagePath);
      var wasEdit = !!editingId;
      toast(wasEdit?'Ürün güncellendi.':'Ürün eklendi.','success');
      showAlert(els.globalAlert, wasEdit?'Ürün başarıyla güncellendi.':'Yeni ürün başarıyla eklendi.','success');
      clearProductForm();
      return loadProducts();
    }).catch(function(err){
      var msg = errText(err);
      if (/row-level security|permission denied|not authorized|new row violates/i.test(msg))
        msg = 'Bu işlem için yetkiniz yok. Hesabınızın yönetici olarak tanımlı olduğundan ve RLS politikalarının kurulu olduğundan emin olun. ('+msg+')';
      showAlert(els.globalAlert,'Kaydedilemedi: '+msg,'error');
      toast('Kaydedilemedi.','error');
      if (window.console&&console.error) console.error('[admin] kaydet:',err);
    }).then(function(){ setBusy(false); });
  }
  function removeStoredImage(path){
    if (!path || /^https?:\/\//i.test(path)) return Promise.resolve();
    return sb.storage.from(IMG_BUCKET).remove([path.replace(/^\/+/,'')])
      .then(function(){}, function(){});
  }
  function toggleProductActive(p){
    var next = p.active===false;
    sb.from('products').update({active:next}).eq('id',p.id).then(function(res){
      if (res.error) throw res.error;
      p.active = next;
      toast(next?'Ürün yayına alındı.':'Ürün yayından kaldırıldı.','success');
      renderProductList();
    }).catch(function(err){ showAlert(els.globalAlert,'Durum değiştirilemedi: '+errText(err),'error'); });
  }
  function deleteProduct(p){
    if (!window.confirm('"'+(getProdName(p,'tr')||'Ürün')+'" kalıcı olarak silinecek.\n\nBu işlem geri alınamaz. Devam edilsin mi?')) return;
    showAlert(els.globalAlert,'');
    sb.from('products').delete().eq('id',p.id).then(function(res){
      if (res.error) throw res.error;
      removeStoredImage(p.image_url);
      if (editingId===p.id) clearProductForm();
      toast('Ürün silindi.','success');
      return loadProducts();
    }).catch(function(err){ showAlert(els.globalAlert,'Ürün silinemedi: '+errText(err),'error'); });
  }
  function duplicateProduct(p){
    var copy = {};
    ['name_tr','name_en','name_ar','name_de','name_fr','desc_tr','desc_en','desc_ar','desc_de','desc_fr','price','category','category_id','stock'].forEach(function(k){
      if (p[k]!==undefined) copy[k]=p[k];
    });
    copy.name_tr = (p.name_tr||p.name||'Kopya') + ' (kopya)';
    copy.name = copy.name_tr;
    copy.active = false;
    copy.image_url = p.image_url || null;
    sb.from('products').insert(copy).select('id').single().then(function(res){
      if (res.error) throw res.error;
      toast('Ürün kopyalandı (pasif). Düzenleyip yayına alın.','success');
      return loadProducts();
    }).catch(function(err){ showAlert(els.globalAlert,'Kopyalanamadı: '+errText(err),'error'); });
  }

  function populateProductCategorySelect(){
    if (!els.categoryId) return;
    var prev = els.categoryId.value;
    els.categoryId.textContent='';
    var def = document.createElement('option'); def.value=''; def.textContent='— Kategori seçin —'; els.categoryId.appendChild(def);
    var roots = categories.filter(function(c){ return !c.parent_id; });
    roots.sort(bySort).forEach(function(c){
      var opt = document.createElement('option'); opt.value=c.id; opt.textContent=c.name_tr||'(İsimsiz)';
      els.categoryId.appendChild(opt);
      categories.filter(function(ch){ return ch.parent_id===c.id; }).sort(bySort).forEach(function(ch){
        var o2 = document.createElement('option'); o2.value=ch.id; o2.textContent='— '+(ch.name_tr||'(İsimsiz)');
        els.categoryId.appendChild(o2);
      });
    });
    els.categoryId.value = prev;
  }
  function bySort(a,b){ return (a.sort_order||0)-(b.sort_order||0); }

  /* ===================== KATEGORİLER ===================== */
  function loadCategories(){
    if (els.catListState){ els.catListState.hidden=false; els.catListState.textContent='Kategoriler yükleniyor…'; }
    return sb.from('categories').select('id,name_tr,name_en,name_ar,name_de,name_fr,parent_id,sort_order,active,created_at')
      .order('sort_order',{ascending:true}).then(function(res){
        if (res.error) throw res.error;
        categories = Array.isArray(res.data) ? res.data : [];
        renderCategoryList();
        populateCategoryParentSelect();
        populateProductCategorySelect();
      }).catch(function(err){
        categories=[]; renderCategoryList(); populateCategoryParentSelect();
        showAlert(els.globalAlert,'Kategoriler yüklenemedi: '+errText(err),'error');
      });
  }
  function renderCategoryList(){
    if (!els.catListEl) return;
    els.catListEl.textContent='';
    if (els.categoryCount) els.categoryCount.textContent = categories.length+' kategori';
    if (categories.length===0){
      if (els.catListState){ els.catListState.hidden=false; var s=document.createElement('strong'); s.textContent='Henüz kategori yok'; els.catListState.textContent=''; els.catListState.appendChild(s); els.catListState.appendChild(document.createTextNode(' Soldaki formdan ekleyin.')); }
      return;
    }
    if (els.catListState) els.catListState.hidden=true;
    var roots = categories.filter(function(c){ return !c.parent_id; }).sort(bySort);
    var frag = document.createDocumentFragment();
    roots.forEach(function(c){
      frag.appendChild(buildCatRow(c,0));
      categories.filter(function(ch){ return ch.parent_id===c.id; }).sort(bySort).forEach(function(ch){ frag.appendChild(buildCatRow(ch,1)); });
    });
    els.catListEl.appendChild(frag);
  }
  function buildCatRow(c, depth){
    var li=document.createElement('li');
    li.className='admin-item'+(c.active===false?' is-inactive':'')+(catEditingId===c.id?' is-editing':'');
    li.dataset.id=c.id;
    var body=document.createElement('div'); body.className='admin-item-body'; body.style.paddingLeft=(depth*18)+'px';
    var title=document.createElement('div'); title.className='admin-item-title';
    title.textContent = (c.name_tr||'(İsimsiz)') + (depth>0?' ↳':'');
    var meta=document.createElement('div'); meta.className='admin-item-meta';
    var tag=document.createElement('span'); tag.className='status-tag '+(c.active===false?'off':'on');
    tag.textContent = c.active===false?'Pasif':'Aktif'; meta.appendChild(tag);
    body.appendChild(title); body.appendChild(meta);
    var actions=document.createElement('div'); actions.className='admin-item-actions';
    actions.appendChild(actionBtn('Düzenle','edit', function(){ startEditCategory(c); }));
    actions.appendChild(actionBtn('Sil','trash', function(){ deleteCategory(c); }, true));
    li.appendChild(body); li.appendChild(actions);
    return li;
  }
  function populateCategoryParentSelect(){
    if (!els.catParent) return;
    var prev = els.catParent.value;
    els.catParent.textContent='';
    var def=document.createElement('option'); def.value=''; def.textContent='— Üst kategori yok (ana kategori) —'; els.catParent.appendChild(def);
    categories.filter(function(c){ return !c.parent_id; }).sort(bySort).forEach(function(c){
      var o=document.createElement('option'); o.value=c.id; o.textContent=c.name_tr||'(İsimsiz)'; els.catParent.appendChild(o);
    });
    els.catParent.value = prev;
  }
  function bindCategoryLangTabs(){
    bindLangTabs(els.catLangTabs, function(lang){
      saveCatLangFromFields(catLang); catLang=lang; loadCatLangToFields(lang);
    });
  }
  /* HTML her dil için ayrı alan kullanır: #cat-name-tr … */
  function saveCatLangFromFields(lang){
    LANGS.forEach(function(l){
      var el = byId('cat-name-'+l);
      if (el) els['catName_'+l] = el.value;
    });
  }
  function loadCatLangToFields(lang){
    LANGS.forEach(function(l){
      var el = byId('cat-name-'+l);
      if (el) el.value = els['catName_'+l] || '';
      var block = byId('cf-name-'+l);
      if (block) block.hidden = (l!==lang);
    });
  }
  function clearCategoryForm(){
    catEditingId=null; catLang='tr';
    LANGS.forEach(function(l){ els['catName_'+l]=''; });
    if (els.categoryForm) els.categoryForm.reset();
    if (els.catId) els.catId.value='';
    if (els.catActive) els.catActive.checked=true;
    if (els.catSort) els.catSort.value='0';
    if (els.catFormTitle) els.catFormTitle.textContent='Yeni kategori';
    if (els.catCancelEdit) els.catCancelEdit.hidden=true;
    setLangTabsActive(els.catLangTabs,'tr'); loadCatLangToFields('tr');
    renderCategoryList();
  }
  function startEditCategory(c){
    catEditingId=c.id;
    LANGS.forEach(function(l){ els['catName_'+l] = c['name_'+l] || (l==='tr'?(c.name_tr||''):''); });
    if (els.catId) els.catId.value=c.id;
    if (els.catParent) els.catParent.value=c.parent_id||'';
    if (els.catSort) els.catSort.value=String(c.sort_order||0);
    if (els.catActive) els.catActive.checked=c.active!==false;
    if (els.catFormTitle) els.catFormTitle.textContent='Kategoriyi düzenle';
    if (els.catCancelEdit) els.catCancelEdit.hidden=false;
    setLangTabsActive(els.catLangTabs,'tr'); catLang='tr'; loadCatLangToFields('tr');
    renderCategoryList();
    if (els.catFormTitle && els.catFormTitle.scrollIntoView) els.catFormTitle.scrollIntoView({behavior:'smooth',block:'center'});
    var firstCat = byId('cat-name-tr');
    if (firstCat) firstCat.focus({preventScroll:true});
  }
  function saveCategory(e){
    if (e) e.preventDefault();
    saveCatLangFromFields(catLang);
    var nameTr=(els['catName_tr']||'').trim();
    if (!nameTr){ showAlert(els.globalAlert,'Kategori adı (Türkçe) zorunludur.','error'); return; }
    var payload = {
      name_tr: nameTr,
      name_en: (els['catName_en']||'').trim()||null,
      name_ar: (els['catName_ar']||'').trim()||null,
      name_de: (els['catName_de']||'').trim()||null,
      name_fr: (els['catName_fr']||'').trim()||null,
      parent_id: (els.catParent?els.catParent.value:'')||null,
      sort_order: Number(els.catSort?els.catSort.value:0)||0,
      active: !!(els.catActive && els.catActive.checked)
    };
    var btn = els.catSaveBtn; if (btn){ btn.disabled=true; if(els.catSaveLabel) els.catSaveLabel.textContent='Kaydediliyor…'; }
    var step = catEditingId
      ? sb.from('categories').update(payload).eq('id',catEditingId).select('id').single()
      : sb.from('categories').insert(payload).select('id').single();
    step.then(function(res){
      if (res.error) throw res.error;
      toast(catEditingId?'Kategori güncellendi.':'Kategori eklendi.','success');
      clearCategoryForm();
      return loadCategories();
    }).catch(function(err){
      showAlert(els.globalAlert,'Kategori kaydedilemedi: '+errText(err),'error');
    }).then(function(){ if(btn){ btn.disabled=false; if(els.catSaveLabel) els.catSaveLabel.textContent='Kategoriyi kaydet'; } });
  }
  function deleteCategory(c){
    var children = categories.filter(function(ch){ return ch.parent_id===c.id; });
    var msg = '"'+(c.name_tr||'Kategori')+'" silinecek.';
    if (children.length) msg += '\n\nBu kategoriye bağlı alt kategoriler var; onların üst kategorisi boşaltılacaktır.';
    msg += '\n\nDevam edilsin mi?';
    if (!window.confirm(msg)) return;
    sb.from('categories').delete().eq('id',c.id).then(function(res){
      if (res.error) throw res.error;
      toast('Kategori silindi.','success');
      if (catEditingId===c.id) clearCategoryForm();
      return loadCategories();
    }).catch(function(err){ showAlert(els.globalAlert,'Kategori silinemedi: '+errText(err),'error'); });
  }

  /* ===================== AYARLAR / BANNER / HAKKIMIZDA ===================== */
  function loadSettings(){
    return sb.from('site_settings').select('*').eq('id',1).single().then(function(res){
      if (res.error) throw res.error;
      settings = res.data || {};
      renderSettingsForm();
      renderBannerForm();
      renderAboutForm();
      applySettingsToSidebar();
    }).catch(function(err){
      showAlert(els.globalAlert,'Site ayarları yüklenemedi: '+errText(err),'error');
    });
  }
  function jget(obj, lang, fallback){
    if (!obj) return fallback||'';
    if (typeof obj==='string') return obj;
    return obj[lang] || obj.tr || fallback || '';
  }
  function applySettingsToSidebar(){
    if (settings.store_name){
      document.querySelectorAll('[data-store-name]').forEach(function(n){ n.textContent = settings.store_name; });
    }
    if (settings.logo_url){
      var u = assetPublicUrl(settings.logo_url);
      if (els.sidebarLogo) els.sidebarLogo.src = u;
    }
  }
  function renderSettingsForm(){
    if (!els.sStoreName) return;
    els.sStoreName.value = settings.store_name || '';
    els.sWhatsapp.value = settings.whatsapp || '';
    els.sPhone.value = settings.phone || '';
    els.sEmail.value = settings.email || '';
    els.sAddress.value = settings.address || '';
    els.sInstagram.value = settings.instagram || '';
    els.sFacebook.value = settings.facebook || '';
    els.sYoutube.value = settings.youtube || '';
    logoPendingFile = null;
    updateLogoPreview(settings.logo_url || '');
    if (els.sLogoRemove) els.sLogoRemove.hidden = !settings.logo_url;
  }
  function updateLogoPreview(pathOrUrl){
    if (!els.logoPreview) return;
    var src = pathOrUrl ? (/^blob:/i.test(pathOrUrl)||/^https?:/i.test(pathOrUrl)?pathOrUrl:assetPublicUrl(pathOrUrl)) : '';
    els.logoPreview.style.backgroundImage = src ? 'url("'+src.replace(/"/g,'%22')+'")' : '';
    els.logoPreview.textContent = src ? '' : 'Logo yok';
  }
  function onLogoFileChange(){
    var file = els.sLogo && els.sLogo.files ? els.sLogo.files[0] : null;
    if (!file){ logoPendingFile=null; return; }
    var problem = validateFile(file, MAX_ASSET_BYTES);
    if (problem){ showAlert(els.globalAlert,problem,'error'); els.sLogo.value=''; logoPendingFile=null; updateLogoPreview(settings&&settings.logo_url||''); return; }
    showAlert(els.globalAlert,'');
    logoPendingFile = file;
    updateLogoPreview(URL.createObjectURL(file));
  }
  function uploadAsset(file, prefix){
    var ext = ALLOWED[String(file.type).toLowerCase()];
    var path = prefix+'/'+randomId()+'.'+ext;
    return sb.storage.from(ASSETS_BUCKET).upload(path, file, {cacheControl:'3600',upsert:false,contentType:file.type})
      .then(function(res){ if (res.error) throw res.error; return path; });
  }
  function saveSettings(e){
    if (e) e.preventDefault();
    var payload = {
      store_name: (els.sStoreName.value||'').trim() || null,
      whatsapp: (els.sWhatsapp.value||'').trim() || null,
      phone: (els.sPhone.value||'').trim() || null,
      email: (els.sEmail.value||'').trim() || null,
      address: (els.sAddress.value||'').trim() || null,
      instagram: (els.sInstagram.value||'').trim() || null,
      facebook: (els.sFacebook.value||'').trim() || null,
      youtube: (els.sYoutube.value||'').trim() || null,
      updated_at: new Date().toISOString()
    };
    var btn = els.settingsSaveBtn; if (btn) btn.disabled=true;
    var uploadStep = logoPendingFile ? uploadAsset(logoPendingFile,'logo') : Promise.resolve(null);
    uploadStep.then(function(newLogo){
      if (newLogo) payload.logo_url = newLogo;
      return sb.from('site_settings').update(payload).eq('id',1).select('id').single();
    }).then(function(res){
      if (res.error) throw res.error;
      toast('Site ayarları kaydedildi.','success');
      logoPendingFile=null;
      return loadSettings();
    }).catch(function(err){ showAlert(els.globalAlert,'Ayarlar kaydedilemedi: '+errText(err),'error'); })
      .then(function(){ if(btn) btn.disabled=false; });
  }
  function removeLogo(){
    logoPendingFile=null;
    if (els.sLogo) els.sLogo.value='';
    if (settings && settings.logo_url){
      sb.storage.from(ASSETS_BUCKET).remove([settings.logo_url.replace(/^\/+/,'')]).then(function(){},function(){});
      settings.logo_url=null;
      sb.from('site_settings').update({logo_url:null,updated_at:new Date().toISOString()}).eq('id',1).then(function(){});
    }
    updateLogoPreview('');
    if (els.sLogoRemove) els.sLogoRemove.hidden=true;
    if (els.sidebarLogo) els.sidebarLogo.src='logo.png';
    toast('Logo kaldırıldı.','success');
  }

  /* ---- Banner ---- */
  function bindBannerLangTabs(){
    bindLangTabs(els.bannerLangTabs, function(lang){
      saveBannerLangFromFields(bannerLang); bannerLang=lang; loadBannerLangToFields(lang);
    });
  }
  /* HTML her dil için ayrı alan kullanır: #s-banner-text-tr … */
  function saveBannerLangFromFields(lang){
    LANGS.forEach(function(l){
      var el = byId('s-banner-text-'+l);
      if (el) els['bannerText_'+l] = el.value;
    });
  }
  function loadBannerLangToFields(lang){
    LANGS.forEach(function(l){
      var el = byId('s-banner-text-'+l);
      if (el) el.value = els['bannerText_'+l] || '';
      var block = byId('bf-'+l);
      if (block) block.hidden = (l!==lang);
    });
  }
  function renderBannerForm(){
    if (!settings) return;
    LANGS.forEach(function(l){ els['bannerText_'+l] = jget(settings.banner_text, l, ''); });
    if (els.bannerActive) els.bannerActive.checked = !!settings.banner_active;
    if (els.bannerLink) els.bannerLink.value = settings.banner_link || '';
    bannerPendingFile=null;
    setLangTabsActive(els.bannerLangTabs,'tr'); bannerLang='tr'; loadBannerLangToFields('tr');
    updateBannerPreview(settings.banner_url || '');
    if (els.bannerRemoveImage) els.bannerRemoveImage.hidden = !settings.banner_url;
  }
  function updateBannerPreview(pathOrUrl){
    if (!els.bannerPreview) return;
    var src = pathOrUrl ? (/^blob:/i.test(pathOrUrl)||/^https?:/i.test(pathOrUrl)?pathOrUrl:assetPublicUrl(pathOrUrl)) : '';
    els.bannerPreview.style.backgroundImage = src ? 'url("'+src.replace(/"/g,'%22')+'")' : '';
    els.bannerPreview.textContent = src ? '' : 'Görsel yok';
  }
  function onBannerFileChange(){
    var file = els.bannerImage && els.bannerImage.files ? els.bannerImage.files[0] : null;
    if (!file){ bannerPendingFile=null; return; }
    var problem = validateFile(file, MAX_ASSET_BYTES);
    if (problem){ showAlert(els.globalAlert,problem,'error'); els.bannerImage.value=''; bannerPendingFile=null; updateBannerPreview(settings&&settings.banner_url||''); return; }
    showAlert(els.globalAlert,'');
    bannerPendingFile = file;
    updateBannerPreview(URL.createObjectURL(file));
  }
  function saveBanner(e){
    if (e) e.preventDefault();
    saveBannerLangFromFields(bannerLang);
    var btext = {};
    LANGS.forEach(function(l){ var v=(els['bannerText_'+l]||'').trim(); if (v) btext[l]=v; });
    var payload = {
      banner_active: !!(els.bannerActive && els.bannerActive.checked),
      banner_link: (els.bannerLink?els.bannerLink.value:'').trim() || null,
      banner_text: btext,
      updated_at: new Date().toISOString()
    };
    var btn = els.bannerSaveBtn; if (btn) btn.disabled=true;
    var uploadStep = bannerPendingFile ? uploadAsset(bannerPendingFile,'banner') : Promise.resolve(null);
    uploadStep.then(function(newBanner){
      if (newBanner) payload.banner_url = newBanner;
      return sb.from('site_settings').update(payload).eq('id',1).select('id').single();
    }).then(function(res){
      if (res.error) throw res.error;
      toast('Banner kaydedildi.','success');
      bannerPendingFile=null;
      return loadSettings();
    }).catch(function(err){ showAlert(els.globalAlert,'Banner kaydedilemedi: '+errText(err),'error'); })
      .then(function(){ if(btn) btn.disabled=false; });
  }
  function removeBannerImage(){
    bannerPendingFile=null;
    if (els.bannerImage) els.bannerImage.value='';
    if (settings && settings.banner_url){
      sb.storage.from(ASSETS_BUCKET).remove([settings.banner_url.replace(/^\/+/,'')]).then(function(){},function(){});
      settings.banner_url=null;
      sb.from('site_settings').update({banner_url:null,updated_at:new Date().toISOString()}).eq('id',1).then(function(){});
    }
    updateBannerPreview('');
    if (els.bannerRemoveImage) els.bannerRemoveImage.hidden=true;
    toast('Banner görseli kaldırıldı.','success');
  }

  /* ---- Hakkımızda ---- */
  function renderAboutForm(){
    if (!els.aboutItemsContainer) return;
    var items = [];
    try { items = settings.about_items || []; if (typeof items==='string') items = JSON.parse(items); if (!Array.isArray(items)) items=[]; }
    catch(e){ items=[]; }
    if (items.length===0) items = [{title_tr:'',desc_tr:''},{title_tr:'',desc_tr:''},{title_tr:'',desc_tr:''}];
    els.aboutItemsContainer.textContent='';
    items.forEach(function(item, idx){
      var block = document.createElement('div'); block.className='about-item-block';
      var h = document.createElement('div'); h.className='about-item-head';
      h.textContent = 'Madde '+(idx+1);
      block.appendChild(h);
      var tabs = document.createElement('div'); tabs.className='lang-tabs'; tabs.setAttribute('role','tablist');
      LANGS.forEach(function(l, i){
        var tb = document.createElement('button'); tb.type='button'; tb.className='ltab'+(i===0?' is-active':'');
        tb.setAttribute('data-lang',l); tb.textContent=upper(l);
        tabs.appendChild(tb);
      });
      block.appendChild(tabs);
      var titleField = document.createElement('div'); titleField.className='field';
      var tl = document.createElement('label'); tl.textContent='Başlık (TR)'; titleField.appendChild(tl);
      var ti = document.createElement('input'); ti.className='input'; ti.type='text'; ti.maxLength=80;
      ti.dataset.aboutIdx=idx; ti.dataset.aboutField='title'; ti.dataset.aboutLang='tr';
      ti.value = item.title_tr || '';
      titleField.appendChild(ti); block.appendChild(titleField);
      var descField = document.createElement('div'); descField.className='field';
      var dl = document.createElement('label'); dl.textContent='Açıklama (TR)'; descField.appendChild(dl);
      var di = document.createElement('textarea'); di.className='textarea'; di.rows=2; di.maxLength=300;
      di.dataset.aboutIdx=idx; di.dataset.aboutField='desc'; di.dataset.aboutLang='tr';
      di.value = item.desc_tr || '';
      descField.appendChild(di); block.appendChild(descField);
      LANGS.forEach(function(l){
        if (l==='tr') return;
        var th = document.createElement('input'); th.type='hidden';
        th.dataset.aboutIdx=idx; th.dataset.aboutField='title'; th.dataset.aboutLang=l;
        th.value = item['title_'+l] || '';
        var dh = document.createElement('input'); dh.type='hidden';
        dh.dataset.aboutIdx=idx; dh.dataset.aboutField='desc'; dh.dataset.aboutLang=l;
        dh.value = item['desc_'+l] || '';
        block.appendChild(th); block.appendChild(dh);
      });
      tabs.querySelectorAll('.ltab').forEach(function(tab){
        tab.addEventListener('click', function(){
          var lang = tab.getAttribute('data-lang');
          tabs.querySelectorAll('.ltab').forEach(function(t){ t.classList.toggle('is-active', t===tab); });
          // save current visible values to hidden
          block.querySelectorAll('[data-about-idx]').forEach(function(inp){
            if (inp.type==='hidden') return;
            var hid = block.querySelector('input[type="hidden"][data-about-field="'+inp.dataset.aboutField+'"][data-about-lang="'+inp.dataset.aboutLang+'"]');
            if (hid) hid.value = inp.value;
          });
          // update labels and visible values
          tl.textContent = 'Başlık ('+upper(lang)+')';
          dl.textContent = 'Açıklama ('+upper(lang)+')';
          var htv = block.querySelector('input[type="hidden"][data-about-field="title"][data-about-lang="'+lang+'"]');
          var hdv = block.querySelector('input[type="hidden"][data-about-field="desc"][data-about-lang="'+lang+'"]');
          if (lang==='tr'){ ti.value = item.title_tr||''; di.value = item.desc_tr||''; }
          else { ti.value = htv ? htv.value : ''; di.value = hdv ? hdv.value : ''; }
          ti.dataset.aboutLang = lang; di.dataset.aboutLang = lang;
        });
      });
      els.aboutItemsContainer.appendChild(block);
    });
  }
  function saveAbout(e){
    if (e) e.preventDefault();
    var groups = {};
    document.querySelectorAll('[data-about-idx]').forEach(function(el){
      var idx = el.dataset.aboutIdx, field = el.dataset.aboutField, lang = el.dataset.aboutLang;
      if (!groups[idx]) groups[idx] = {};
      groups[idx][field+'_'+lang] = el.value || '';
    });
    var items = Object.keys(groups).sort().map(function(k){ return groups[k]; });
    var btn = els.aboutSaveBtn; if (btn) btn.disabled=true;
    sb.from('site_settings').update({about_items: items, updated_at:new Date().toISOString()}).eq('id',1).select('id').single()
      .then(function(res){
        if (res.error) throw res.error;
        toast('Hakkımızda içeriği kaydedildi.','success');
        return loadSettings();
      }).catch(function(err){ showAlert(els.globalAlert,'İçerik kaydedilemedi: '+errText(err),'error'); })
      .then(function(){ if(btn) btn.disabled=false; });
  }
  function saveContact(e){
    if (e) e.preventDefault();
    var payload = {
      address: (byId('s-address')?byId('s-address').value:'').trim()||null,
      phone:   (byId('s-phone')?byId('s-phone').value:'').trim()||null,
      whatsapp:(byId('s-whatsapp')?byId('s-whatsapp').value:'').replace(/\s/g,'').trim()||null,
      email:   (byId('s-email')?byId('s-email').value:'').trim()||null,
      instagram:(byId('s-instagram')?byId('s-instagram').value:'').trim()||null,
      facebook: (byId('s-facebook')?byId('s-facebook').value:'').trim()||null,
      youtube:  (byId('s-youtube')?byId('s-youtube').value:'').trim()||null,
      updated_at: new Date().toISOString()
    };
    var btn = byId('contact-save-btn'); if (btn) btn.disabled=true;
    sb.from('site_settings').update(payload).eq('id',1).select('id').single()
      .then(function(res){ if (res.error) throw res.error; toast('İletişim bilgileri kaydedildi.','success'); return loadSettings(); })
      .catch(function(err){ showAlert(els.globalAlert,'İletişim bilgileri kaydedilemedi: '+errText(err),'error'); })
      .then(function(){ if(btn) btn.disabled=false; });
  }
  function addAboutItem(){
    if (!els.aboutItemsContainer) return;
    var idx = els.aboutItemsContainer.querySelectorAll('.about-item-block').length;
    var block = document.createElement('div'); block.className='about-item-block';
    var h = document.createElement('div'); h.className='about-item-head'; h.textContent='Madde '+(idx+1);
    block.appendChild(h);
    LANGS.forEach(function(l, i){
      if (l==='tr'){
        var fld = document.createElement('div'); fld.className='field';
        var lbl = document.createElement('label'); lbl.textContent='Başlık (TR)'; fld.appendChild(lbl);
        var inp = document.createElement('input'); inp.className='input'; inp.type='text'; inp.maxLength=80;
        inp.dataset.aboutIdx=String(idx); inp.dataset.aboutField='title'; inp.dataset.aboutLang='tr'; inp.value='';
        fld.appendChild(inp); block.appendChild(fld);
        var fd2 = document.createElement('div'); fd2.className='field';
        var lb2 = document.createElement('label'); lb2.textContent='Açıklama (TR)'; fd2.appendChild(lb2);
        var ta = document.createElement('textarea'); ta.className='textarea'; ta.rows=2; ta.maxLength=300;
        ta.dataset.aboutIdx=String(idx); ta.dataset.aboutField='desc'; ta.dataset.aboutLang='tr'; ta.value='';
        fd2.appendChild(ta); block.appendChild(fd2);
        return;
      }
      var th = document.createElement('input'); th.type='hidden';
      th.dataset.aboutIdx=String(idx); th.dataset.aboutField='title'; th.dataset.aboutLang=l; th.value='';
      var dh = document.createElement('input'); dh.type='hidden';
      dh.dataset.aboutIdx=String(idx); dh.dataset.aboutField='desc'; dh.dataset.aboutLang=l; dh.value='';
      block.appendChild(th); block.appendChild(dh);
    });
    var rmBtn = document.createElement('button'); rmBtn.type='button'; rmBtn.className='btn btn-outline btn-sm'; rmBtn.textContent='Bu maddeyi kaldır';
    rmBtn.addEventListener('click',function(){ block.remove(); }); block.appendChild(rmBtn);
    els.aboutItemsContainer.appendChild(block);
  }

  /* ===================== HESAP ===================== */
  function changePassword(e){
    if (e) e.preventDefault();
    showAlert(els.accountAlert,'');
    var p1 = els.newPassword?els.newPassword.value:'', p2 = els.newPasswordConfirm?els.newPasswordConfirm.value:'';
    if (!p1 || p1.length<6){ showAlert(els.accountAlert,'Şifre en az 6 karakter olmalıdır.','error'); return; }
    if (p1!==p2){ showAlert(els.accountAlert,'Şifreler eşleşmiyor.','error'); return; }
    var btn = els.accountSaveBtn; if (btn) btn.disabled=true;
    sb.auth.updateUser({password:p1}).then(function(res){
      if (res.error) throw res.error;
      showAlert(els.accountAlert,'Şifre güncellendi.','success');
      if (els.accountForm) els.accountForm.reset();
    }).catch(function(err){ showAlert(els.accountAlert,'Şifre güncellenemedi: '+errText(err),'error'); })
      .then(function(){ if(btn) btn.disabled=false; });
  }

  /* ===================== OTURUM ===================== */
  function signIn(e){
    if (e) e.preventDefault();
    var email=(els.email?els.email.value:'').trim(), password=els.password?els.password.value:'';
    showAlert(els.loginAlert,'');
    if (!email||!password){ showAlert(els.loginAlert,'E-posta ve şifre gereklidir.','error'); return; }
    if (els.loginBtn){ els.loginBtn.disabled=true; els.loginBtn.textContent='Giriş yapılıyor…'; }
    sb.auth.signInWithPassword({email:email,password:password}).then(function(res){
      if (res.error) throw res.error;
      return afterLogin(res.data.session);
    }).catch(function(err){
      var msg=errText(err);
      if (/invalid login credentials/i.test(msg)) msg='E-posta veya şifre hatalı.';
      if (/email not confirmed/i.test(msg)) msg='E-posta adresi henüz doğrulanmamış.';
      showAlert(els.loginAlert,msg,'error');
    }).then(function(){ if(els.loginBtn){ els.loginBtn.disabled=false; els.loginBtn.textContent='Giriş yap'; } });
  }
  function afterLogin(sess){
    session = sess;
    if (!session) return showLogin('Oturum açılamadı.');
    return checkIsAdmin().then(function(result){
      if (!result.ok){
        var detail = result.error?' ('+errText(result.error)+')':'';
        return sb.auth.signOut().then(function(){ showLogin('Bu hesabın yönetici yetkisi yok.'+detail); });
      }
      showAdmin();
      if (els.adminEmail) els.adminEmail.textContent = (session.user&&session.user.email)||'—';
      /* Kenar çubuğundaki mağaza adı ve logo site_settings'ten gelir; panel
         değiştirilmeden önce bir kez yüklenmeli. */
      loadSettings();
      loadCategories();
      switchPanel('products');
    });
  }
  function signOut(){
    if (!sb) return;
    sb.auth.signOut().then(function(){
      session=null; clearProductForm(); products=[]; categories=[]; settings=null;
      if (els.list) els.list.textContent='';
      if (els.productCount) els.productCount.textContent='—';
      showLogin('');
      toast('Çıkış yapıldı.','success');
    });
  }

  /* ===================== Başlat ===================== */
  function bind(){
    if (els.loginForm) els.loginForm.addEventListener('submit', signIn);
    if (els.productForm) els.productForm.addEventListener('submit', saveProduct);
    if (els.logoutBtn) els.logoutBtn.addEventListener('click', signOut);
    if (els.cancelEdit) els.cancelEdit.addEventListener('click', function(){ clearProductForm(); showAlert(els.globalAlert,''); });
    if (els.resetBtn) els.resetBtn.addEventListener('click', function(){
      setTimeout(function(){ if (editingId){ var p=products.filter(function(x){return x.id===editingId;})[0]; if (p){ startEditProduct(p); return; } } clearProductForm(); },0);
    });
    if (els.image) els.image.addEventListener('change', onProductFileChange);
    if (els.removeImage) els.removeImage.addEventListener('click', function(){
      pendingFile=null; currentImagePath='';
      if (els.image) els.image.value='';
      updateProductPreview('');
    });
    document.querySelectorAll('.snav-item[data-tab]').forEach(function(b){
      b.addEventListener('click', function(){ switchPanel(b.getAttribute('data-tab')); });
    });
    if (els.sidebarToggle) els.sidebarToggle.addEventListener('click', function(){
      if (els.sidebar) els.sidebar.classList.toggle('is-open');
    });
    document.addEventListener('click', function(e){
      if (els.sidebar && els.sidebar.classList.contains('is-open')){
        if (!els.sidebar.contains(e.target) && !(els.sidebarToggle&&els.sidebarToggle.contains(e.target)))
          els.sidebar.classList.remove('is-open');
      }
    });
    if (els.categoryForm) els.categoryForm.addEventListener('submit', saveCategory);
    if (els.catCancelEdit) els.catCancelEdit.addEventListener('click', function(){ clearCategoryForm(); showAlert(els.globalAlert,''); });
    if (els.catResetBtn) els.catResetBtn.addEventListener('click', function(){
      setTimeout(function(){ if (catEditingId){ var c=categories.filter(function(x){return x.id===catEditingId;})[0]; if (c){ startEditCategory(c); return; } } clearCategoryForm(); },0);
    });
    if (els.bannerForm) els.bannerForm.addEventListener('submit', saveBanner);
    if (els.bannerImage) els.bannerImage.addEventListener('change', onBannerFileChange);
    if (els.bannerRemoveImage) els.bannerRemoveImage.addEventListener('click', removeBannerImage);
    if (els.settingsForm) els.settingsForm.addEventListener('submit', saveSettings);
    if (els.sLogo) els.sLogo.addEventListener('change', onLogoFileChange);
    if (els.sLogoRemove) els.sLogoRemove.addEventListener('click', removeLogo);
    // İletişim formu
    var contactForm = byId('contact-form');
    if (contactForm) contactForm.addEventListener('submit', saveContact);
    // Hakkımızda kaydet butonu
    var aboutSaveBtn = byId('about-save-btn');
    if (aboutSaveBtn) aboutSaveBtn.addEventListener('click', saveAbout);
    // Madde ekle butonu
    var addAboutBtn = byId('add-about-item');
    if (addAboutBtn) addAboutBtn.addEventListener('click', addAboutItem);
    if (els.accountForm) els.accountForm.addEventListener('submit', changePassword);
    // Ayarlar alt sekmeleri
    document.querySelectorAll('.stab[data-stab]').forEach(function(btn){
      btn.addEventListener('click', function(){
        var stab = btn.getAttribute('data-stab');
        document.querySelectorAll('.stab[data-stab]').forEach(function(b){ b.classList.toggle('is-active', b===btn); });
        document.querySelectorAll('.stab-panel[id^="stab-"]').forEach(function(p){ p.hidden = true; p.classList.remove('is-active'); });
        var panel = byId('stab-'+stab);
        if (panel){ panel.hidden = false; panel.classList.add('is-active'); }
      });
    });
    bindProductLangTabs();
    bindCategoryLangTabs();
    bindBannerLangTabs();
  }
  function applyConfig(){
    document.querySelectorAll('[data-store-name]').forEach(function(n){ n.textContent = CONFIG.storeName||'Şark Dokusu'; });
  }
  function collectEls(){
    els.loginView=byId('login-view'); els.adminView=byId('admin-view');
    els.loginForm=byId('login-form'); els.email=byId('login-email'); els.password=byId('login-password');
    els.loginBtn=byId('login-submit'); els.loginAlert=byId('login-alert');
    els.globalAlert=byId('global-alert'); els.toastStack=byId('toast-stack');
    els.sidebar=byId('admin-sidebar'); els.sidebarToggle=byId('sidebar-toggle');
    els.sidebarLogo=byId('sidebar-logo'); 
    els.adminEmail=byId('admin-email'); els.logoutBtn=byId('logout-btn');
    els.panelTitle=byId('topbar-title');
    els.productForm=byId('product-form'); els.productId=byId('product-id');
    els.productLangTabs=byId('product-lang-tabs');
    LANGS.forEach(function(l){ els['pName_'+l]=''; els['pDesc_'+l]=''; });
    els.price=byId('p-price'); els.stock=byId('p-stock'); els.categoryId=byId('p-category-id');
    els.image=byId('p-image'); els.preview=byId('image-preview'); els.removeImage=byId('remove-image');
    els.active=byId('p-active'); els.saveBtn=byId('save-btn'); els.saveLabel=byId('save-label');
    els.resetBtn=byId('reset-btn'); els.cancelEdit=byId('cancel-edit'); els.formTitle=byId('form-title');
    els.list=byId('admin-list'); els.productCount=byId('product-count'); els.listState=byId('list-state');
    els.categoryForm=byId('category-form'); els.catId=byId('cat-id'); els.catLangTabs=byId('cat-lang-tabs');
    LANGS.forEach(function(l){ els['catName_'+l]=''; });
    els.catParent=byId('cat-parent'); els.catSort=byId('cat-sort'); els.catActive=byId('cat-active');
    els.catSaveBtn=byId('cat-save-btn'); els.catSaveLabel=byId('cat-save-label');
    els.catResetBtn=byId('cat-reset-btn'); els.catCancelEdit=byId('cat-cancel-edit');
    els.catFormTitle=byId('cat-form-title'); els.catListTitle=byId('cat-list-title');
    els.catListEl=byId('cat-list'); els.categoryCount=byId('cat-count'); els.catListState=byId('cat-list-state');
    els.bannerForm=byId('banner-form'); els.bannerActive=byId('s-banner-active'); els.bannerLangTabs=byId('banner-lang-tabs');
    LANGS.forEach(function(l){ els['bannerText_'+l]=''; }); /* değerler metin olarak tutulur, alanlar byId ile okunur */
    els.bannerLink=byId('s-banner-link'); els.bannerImage=byId('s-banner-img');
    els.bannerPreview=byId('banner-preview'); els.bannerRemoveImage=byId('remove-banner-img'); els.bannerSaveBtn=byId('banner-save-btn');
    els.settingsForm=byId('branding-form'); els.settingsSaveBtn=byId('branding-save-btn');
    els.sStoreName=byId('s-store-name'); els.sLogo=byId('s-logo'); els.logoPreview=byId('logo-preview'); els.sLogoRemove=byId('remove-logo');
    els.sWhatsapp=byId('s-whatsapp'); els.sPhone=byId('s-phone'); els.sEmail=byId('s-email'); els.sAddress=byId('s-address');
    els.sInstagram=byId('s-instagram'); els.sFacebook=byId('s-facebook'); els.sYoutube=byId('s-youtube');
    els.aboutForm=null; els.aboutItemsContainer=byId('about-items-editor'); els.aboutSaveBtn=byId('about-save-btn');
    els.accountEmail=byId('acct-email-display'); els.accountForm=byId('pw-form');
    els.newPassword=byId('pw-new'); els.newPasswordConfirm=byId('pw-confirm');
    els.accountSaveBtn=byId('pw-save-btn'); els.accountAlert=byId('pw-alert');
  }
  function boot(){
    collectEls();
    applyConfig();
    bind();
    updateProductPreview('');
    var initError = initSupabase();
    if (initError){ showLogin(initError); return; }
    sb.auth.getSession().then(function(res){
      var sess = res&&res.data?res.data.session:null;
      if (!sess) return showLogin('');
      return afterLogin(sess);
    });
    sb.auth.onAuthStateChange(function(event){
      if (event==='SIGNED_OUT'){ session=null; showLogin(''); }
      else if (event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){
        sb.auth.getSession().then(function(r){ if (r&&r.data) session=r.data.session; });
      }
    });
  }
  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
