/* ŞARK DOKUSU — i18n: tr/en/ar/de/fr · Arapça => rtl · tercih localStorage */
(function () {
  'use strict';
  var STORAGE_KEY = 'sark-dokusu-lang', DEFAULT_LANG = 'tr';
  var LANGS = [
    { code: 'tr', label: 'Türkçe', short: 'TR', dir: 'ltr' },
    { code: 'en', label: 'English', short: 'EN', dir: 'ltr' },
    { code: 'ar', label: 'العربية', short: 'AR', dir: 'rtl' },
    { code: 'de', label: 'Deutsch', short: 'DE', dir: 'ltr' },
    { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr' }
  ];
  var subscribers = [], current = DEFAULT_LANG;
  var DICT = {
    tr: {
      'page.title': 'Şark Dokusu — Doğal Dokunuşlu El Emeği Ürünler',
      'nav.aria': 'Ana menü', 'nav.collection': 'Koleksiyon', 'nav.about': 'Hakkımızda', 'nav.order': 'Sipariş Ver',
      'hero.eyebrow': 'Doğadan gelen dokunuş',
      'hero.title': 'Her parçada <em>sabrın</em> ve doğanın izi',
      'hero.lead': 'Şark Dokusu; özenle seçilmiş doğal malzemelerle, el emeğiyle hazırlanan sade bir koleksiyon sunar. Beğendiğiniz ürünü seçin, WhatsApp üzerinden birkaç saniyede siparişinizi iletin.',
      'hero.cta_explore': 'Koleksiyonu keşfet', 'hero.cta_story': 'Hikâyemiz',
      'catalog.title': 'Koleksiyon', 'catalog.subtitle': 'Özenle seçilmiş ürünlerimizi keşfedin.',
      'search.placeholder': 'Ürün adı veya kategori ara…', 'search.clear_aria': 'Aramayı temizle',
      'search.label': 'Ürün ara', 'skip.content': 'İçeriğe geç', 'trust.heading': 'Hakkımızda',
      'trust.natural_title': 'Doğal malzeme',
      'trust.natural_desc': 'Ürünlerimiz doğal içerik ve geleneksel yöntemlerle, küçük partiler hâlinde hazırlanır.',
      'trust.easy_title': 'Kolay sipariş',
      'trust.easy_desc': 'Üyelik gerekmez. Beğendiğiniz ürünü WhatsApp\'tan tek dokunuşla bize iletin.',
      'trust.packaging_title': 'Özenli paketleme',
      'trust.packaging_desc': 'Her sipariş, yola çıkmadan önce tek tek kontrol edilerek özenle paketlenir.',
      'footer.about': 'Doğal malzemelerle, sabırla ve özenle hazırlanan ürünler. Siparişlerinizi WhatsApp üzerinden iletebilirsiniz.',
      'footer.explore': 'Keşfet', 'footer.contact': 'İletişim', 'footer.orders': 'Sipariş: WhatsApp',
      'footer.admin': 'Yönetici girişi', 'footer.rights': 'Tüm hakları saklıdır.',
      'footer.tagline': 'Doğal dokunuşlar, elden ele.', 'brand.aria': 'Şark Dokusu ana sayfa',
      'chip.all': 'Tümü', 'chips.aria': 'Kategori filtresi', 'badge.soldout': 'Tükendi',
      'stock.out': 'Stokta yok', 'stock.low': 'Son {n} adet', 'stock.in': 'Stokta',
      'product.order_btn': "WhatsApp'tan sipariş ver",
      'product.order_aria': "WhatsApp'tan sipariş ver: {name}",
      'product.stock_query': 'Stok sor / WhatsApp',
      'product.unnamed': 'İsimsiz ürün', 'product.photo_alt': 'Ürün fotoğrafı',
      'toast.whatsapp_missing': 'WhatsApp numarası henüz config.js içinde tanımlanmadı. Numara girilince bu düğme çalışacak.',
      'state.error_title': 'Ürünler yüklenemedi', 'state.error_action': 'Tekrar dene',
      'state.empty_title': 'Koleksiyon hazırlanıyor',
      'state.empty_text': 'Şu anda vitrinde sergilenen bir ürün bulunmuyor. Yeni ürünler eklendiğinde burada görünecek.',
      'state.noresults_title': 'Sonuç bulunamadı',
      'state.noresults_text': 'Aramanıza uyan bir ürün yok. Farklı bir kelime deneyin veya tüm kategorilere dönün.',
      'state.noresults_action': 'Filtreleri temizle',
      'count.products': '{n} ürün', 'loading': 'Yükleniyor…',
      'error.fetch': 'Veritabanına erişilemedi. Tablo ve izinlerin (RLS politikaları) Supabase tarafında hazır olduğundan emin olun. ({detail})',
      'wa.greeting': 'Merhaba, {store} üzerinden sipariş vermek istiyorum.',
      'wa.product': 'Ürün: {name}', 'wa.price': 'Fiyat: {price}', 'wa.id': 'Ürün ID: {id}'
    },
    en: {
      'page.title': 'Şark Dokusu — Natural Handmade Products',
      'nav.aria': 'Main navigation', 'nav.collection': 'Collection', 'nav.about': 'About', 'nav.order': 'Order Now',
      'hero.eyebrow': 'A touch from nature',
      'hero.title': 'Every piece carries the mark of <em>patience</em> and nature',
      'hero.lead': 'Şark Dokusu offers a curated collection of natural materials crafted by hand. Pick what you love and place your order in seconds via WhatsApp.',
      'hero.cta_explore': 'Explore the collection', 'hero.cta_story': 'Our story',
      'catalog.title': 'Collection', 'catalog.subtitle': 'Discover our carefully selected products.',
      'search.placeholder': 'Search by name or category…', 'search.clear_aria': 'Clear search',
      'search.label': 'Search products', 'skip.content': 'Skip to content', 'trust.heading': 'About',
      'trust.natural_title': 'Natural materials',
      'trust.natural_desc': 'Our products are prepared in small batches using natural ingredients and traditional methods.',
      'trust.easy_title': 'Easy ordering',
      'trust.easy_desc': 'No account needed. Just tap to send your favourite product to us on WhatsApp.',
      'trust.packaging_title': 'Careful packaging',
      'trust.packaging_desc': 'Each order is individually checked and thoughtfully packed before it leaves.',
      'footer.about': 'Products made with natural materials, patience and care. Send your orders via WhatsApp.',
      'footer.explore': 'Explore', 'footer.contact': 'Contact', 'footer.orders': 'Orders: WhatsApp',
      'footer.admin': 'Admin login', 'footer.rights': 'All rights reserved.',
      'footer.tagline': 'Natural touches, hand to hand.', 'brand.aria': 'Şark Dokusu home',
      'chip.all': 'All', 'chips.aria': 'Category filter', 'badge.soldout': 'Sold out',
      'stock.out': 'Out of stock', 'stock.low': 'Only {n} left', 'stock.in': 'In stock',
      'product.order_btn': 'Order via WhatsApp',
      'product.order_aria': 'Order via WhatsApp: {name}',
      'product.stock_query': 'Ask about stock / WhatsApp',
      'product.unnamed': 'Unnamed product', 'product.photo_alt': 'Product photo',
      'toast.whatsapp_missing': 'WhatsApp number not yet set in config.js. This button will work once a number is entered.',
      'state.error_title': 'Could not load products', 'state.error_action': 'Try again',
      'state.empty_title': 'Collection coming soon',
      'state.empty_text': 'No products are on display right now. New items will appear here when added.',
      'state.noresults_title': 'No results found',
      'state.noresults_text': 'No products match your search. Try a different word or return to all categories.',
      'state.noresults_action': 'Clear filters',
      'count.products': '{n} products', 'loading': 'Loading…',
      'error.fetch': 'Could not reach the database. Make sure the table and RLS policies are set up in Supabase. ({detail})',
      'wa.greeting': 'Hello, I would like to place an order from {store}.',
      'wa.product': 'Product: {name}', 'wa.price': 'Price: {price}', 'wa.id': 'Product ID: {id}'
    },
    ar: {
      'page.title': 'شرق دوقوسو — منتجات طبيعية يدوية الصنع',
      'nav.aria': 'القائمة الرئيسية', 'nav.collection': 'المجموعة', 'nav.about': 'من نحن', 'nav.order': 'اطلب الآن',
      'hero.eyebrow': 'لمسة من الطبيعة',
      'hero.title': 'كل قطعة تحمل بصمة <em>الصبر</em> والطبيعة',
      'hero.lead': 'تقدّم شرق دوقوسو مجموعة مختارة من المواد الطبيعية المصنوعة يدويًا. اختر ما يعجبك وأرسل طلبك خلال ثوانٍ عبر واتساب.',
      'hero.cta_explore': 'استكشف المجموعة', 'hero.cta_story': 'قصتنا',
      'catalog.title': 'المجموعة', 'catalog.subtitle': 'اكتشف منتجاتنا المختارة بعناية.',
      'search.placeholder': 'ابحث بالاسم أو الفئة…', 'search.clear_aria': 'مسح البحث',
      'search.label': 'بحث عن منتج', 'skip.content': 'انتقل إلى المحتوى', 'trust.heading': 'من نحن',
      'trust.natural_title': 'مواد طبيعية',
      'trust.natural_desc': 'تُحضَّر منتجاتنا بمواد طبيعية وأساليب تقليدية في دفعات صغيرة.',
      'trust.easy_title': 'طلب سهل',
      'trust.easy_desc': 'لا تحتاج لحساب. أرسل المنتج المفضل لديك مباشرة عبر واتساب.',
      'trust.packaging_title': 'تغليف عناية',
      'trust.packaging_desc': 'يُفحص كل طلب بشكل فردي ويُعبَّأ بعناية قبل الشحن.',
      'footer.about': 'منتجات من مواد طبيعية بصبر وعناية. أرسل طلباتك عبر واتساب.',
      'footer.explore': 'استكشف', 'footer.contact': 'تواصل', 'footer.orders': 'الطلبات: واتساب',
      'footer.admin': 'دخول المسؤول', 'footer.rights': 'جميع الحقوق محفوظة.',
      'footer.tagline': 'لمسات طبيعية، من يد ليد.', 'brand.aria': 'الصفحة الرئيسية شرق دوقوسو',
      'chip.all': 'الكل', 'chips.aria': 'تصفية الفئات', 'badge.soldout': 'نفذ المخزون',
      'stock.out': 'غير متوفر', 'stock.low': '{n} قطع متبقية فقط', 'stock.in': 'متوفر',
      'product.order_btn': 'اطلب عبر واتساب',
      'product.order_aria': 'اطلب عبر واتساب: {name}',
      'product.stock_query': 'استفسر عن المخزون / واتساب',
      'product.unnamed': 'منتج بدون اسم', 'product.photo_alt': 'صورة المنتج',
      'toast.whatsapp_missing': 'رقم واتساب غير محدد في config.js. سيعمل هذا الزر بعد إدخال الرقم.',
      'state.error_title': 'تعذّر تحميل المنتجات', 'state.error_action': 'أعد المحاولة',
      'state.empty_title': 'المجموعة قادمة قريبًا',
      'state.empty_text': 'لا توجد منتجات معروضة حاليًا. ستظهر المنتجات الجديدة هنا عند إضافتها.',
      'state.noresults_title': 'لا توجد نتائج',
      'state.noresults_text': 'لا توجد منتجات تطابق بحثك. جرب كلمة أخرى أو عد إلى جميع الفئات.',
      'state.noresults_action': 'مسح الفلاتر',
      'count.products': '{n} منتجات', 'loading': 'جارٍ التحميل…',
      'error.fetch': 'تعذّر الوصول إلى قاعدة البيانات. تأكد من إعداد الجدول وسياسات RLS في Supabase. ({detail})',
      'wa.greeting': 'مرحبًا، أريد تقديم طلب من {store}.',
      'wa.product': 'المنتج: {name}', 'wa.price': 'السعر: {price}', 'wa.id': 'معرف المنتج: {id}'
    },
    de: {
      'page.title': 'Şark Dokusu — Natürliche Handgemachte Produkte',
      'nav.aria': 'Hauptnavigation', 'nav.collection': 'Kollektion', 'nav.about': 'Über uns', 'nav.order': 'Jetzt bestellen',
      'hero.eyebrow': 'Eine Berührung der Natur',
      'hero.title': 'Jedes Stück trägt die Spur von <em>Geduld</em> und Natur',
      'hero.lead': 'Şark Dokusu bietet eine kuratierte Kollektion aus natürlichen Materialien, handgefertigt mit Sorgfalt. Wähle dein Lieblingsprodukt und bestelle in Sekunden per WhatsApp.',
      'hero.cta_explore': 'Kollektion entdecken', 'hero.cta_story': 'Unsere Geschichte',
      'catalog.title': 'Kollektion', 'catalog.subtitle': 'Entdecke unsere sorgfältig ausgewählten Produkte.',
      'search.placeholder': 'Nach Name oder Kategorie suchen…', 'search.clear_aria': 'Suche löschen',
      'search.label': 'Produkte suchen', 'skip.content': 'Zum Inhalt springen', 'trust.heading': 'Über uns',
      'trust.natural_title': 'Natürliche Materialien',
      'trust.natural_desc': 'Unsere Produkte werden in kleinen Chargen mit natürlichen Zutaten und traditionellen Methoden hergestellt.',
      'trust.easy_title': 'Einfach bestellen',
      'trust.easy_desc': 'Kein Konto nötig. Sende dein Lieblingsprodukt direkt über WhatsApp an uns.',
      'trust.packaging_title': 'Sorgfältige Verpackung',
      'trust.packaging_desc': 'Jede Bestellung wird einzeln geprüft und liebevoll verpackt, bevor sie das Haus verlässt.',
      'footer.about': 'Produkte aus natürlichen Materialien, mit Geduld und Sorgfalt hergestellt. Bestellungen per WhatsApp.',
      'footer.explore': 'Entdecken', 'footer.contact': 'Kontakt', 'footer.orders': 'Bestellungen: WhatsApp',
      'footer.admin': 'Admin-Login', 'footer.rights': 'Alle Rechte vorbehalten.',
      'footer.tagline': 'Natürliche Berührungen, von Hand zu Hand.', 'brand.aria': 'Şark Dokusu Startseite',
      'chip.all': 'Alle', 'chips.aria': 'Kategoriefilter', 'badge.soldout': 'Ausverkauft',
      'stock.out': 'Nicht vorrätig', 'stock.low': 'Nur noch {n} verfügbar', 'stock.in': 'Vorrätig',
      'product.order_btn': 'Per WhatsApp bestellen',
      'product.order_aria': 'Per WhatsApp bestellen: {name}',
      'product.stock_query': 'Verfügbarkeit anfragen / WhatsApp',
      'product.unnamed': 'Unbenanntes Produkt', 'product.photo_alt': 'Produktfoto',
      'toast.whatsapp_missing': 'WhatsApp-Nummer noch nicht in config.js gesetzt. Dieser Button funktioniert, sobald eine Nummer eingegeben wurde.',
      'state.error_title': 'Produkte konnten nicht geladen werden', 'state.error_action': 'Erneut versuchen',
      'state.empty_title': 'Kollektion in Vorbereitung',
      'state.empty_text': 'Derzeit sind keine Produkte im Schaufenster. Neue Artikel erscheinen hier, sobald sie hinzugefügt werden.',
      'state.noresults_title': 'Keine Ergebnisse',
      'state.noresults_text': 'Keine Produkte entsprechen deiner Suche. Versuche ein anderes Wort oder kehre zu allen Kategorien zurück.',
      'state.noresults_action': 'Filter zurücksetzen',
      'count.products': '{n} Produkte', 'loading': 'Wird geladen…',
      'error.fetch': 'Datenbank nicht erreichbar. Stelle sicher, dass Tabelle und RLS-Richtlinien in Supabase eingerichtet sind. ({detail})',
      'wa.greeting': 'Hallo, ich möchte eine Bestellung bei {store} aufgeben.',
      'wa.product': 'Produkt: {name}', 'wa.price': 'Preis: {price}', 'wa.id': 'Produkt-ID: {id}'
    },
    fr: {
      'page.title': 'Şark Dokusu — Produits Naturels Faits Main',
      'nav.aria': 'Navigation principale', 'nav.collection': 'Collection', 'nav.about': 'À propos', 'nav.order': 'Commander',
      'hero.eyebrow': 'Un souffle de la nature',
      'hero.title': 'Chaque pièce porte l\'empreinte de la <em>patience</em> et de la nature',
      'hero.lead': 'Şark Dokusu propose une collection soignée de matières naturelles façonnées à la main. Choisissez ce que vous aimez et passez commande en quelques secondes via WhatsApp.',
      'hero.cta_explore': 'Explorer la collection', 'hero.cta_story': 'Notre histoire',
      'catalog.title': 'Collection', 'catalog.subtitle': 'Découvrez nos produits soigneusement sélectionnés.',
      'search.placeholder': 'Rechercher par nom ou catégorie…', 'search.clear_aria': 'Effacer la recherche',
      'search.label': 'Rechercher un produit', 'skip.content': 'Aller au contenu', 'trust.heading': 'À propos',
      'trust.natural_title': 'Matières naturelles',
      'trust.natural_desc': 'Nos produits sont préparés en petites séries avec des ingrédients naturels et des méthodes traditionnelles.',
      'trust.easy_title': 'Commande facile',
      'trust.easy_desc': 'Pas de compte nécessaire. Envoyez simplement votre produit préféré via WhatsApp.',
      'trust.packaging_title': 'Emballage soigné',
      'trust.packaging_desc': 'Chaque commande est vérifiée individuellement et emballée avec soin avant d\'être expédiée.',
      'footer.about': 'Produits fabriqués avec des matières naturelles, de la patience et du soin. Commandez via WhatsApp.',
      'footer.explore': 'Explorer', 'footer.contact': 'Contact', 'footer.orders': 'Commandes : WhatsApp',
      'footer.admin': 'Connexion admin', 'footer.rights': 'Tous droits réservés.',
      'footer.tagline': 'Touches naturelles, de main en main.', 'brand.aria': 'Accueil Şark Dokusu',
      'chip.all': 'Tous', 'chips.aria': 'Filtre catégorie', 'badge.soldout': 'Épuisé',
      'stock.out': 'Rupture de stock', 'stock.low': 'Plus que {n}', 'stock.in': 'En stock',
      'product.order_btn': 'Commander via WhatsApp',
      'product.order_aria': 'Commander via WhatsApp : {name}',
      'product.stock_query': 'Renseigner le stock / WhatsApp',
      'product.unnamed': 'Produit sans nom', 'product.photo_alt': 'Photo du produit',
      'toast.whatsapp_missing': 'Numéro WhatsApp non défini dans config.js. Ce bouton fonctionnera une fois le numéro saisi.',
      'state.error_title': 'Impossible de charger les produits', 'state.error_action': 'Réessayer',
      'state.empty_title': 'Collection en préparation',
      'state.empty_text': 'Aucun produit n\'est affiché pour l\'instant. Les nouveaux articles apparaîtront ici une fois ajoutés.',
      'state.noresults_title': 'Aucun résultat',
      'state.noresults_text': 'Aucun produit ne correspond à votre recherche. Essayez un autre mot ou revenez à toutes les catégories.',
      'state.noresults_action': 'Effacer les filtres',
      'count.products': '{n} produits', 'loading': 'Chargement…',
      'error.fetch': 'Impossible d\'accéder à la base de données. Assurez-vous que la table et les politiques RLS sont configurées dans Supabase. ({detail})',
      'wa.greeting': 'Bonjour, je souhaite passer une commande chez {store}.',
      'wa.product': 'Produit : {name}', 'wa.price': 'Prix : {price}', 'wa.id': 'ID produit : {id}'
    }
  };

  /* ---- Yardımcılar ---- */
  function t(key, vars) {
    var d = DICT[current] || DICT[DEFAULT_LANG];
    var str = (d && d[key]) || (DICT[DEFAULT_LANG][key]) || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
      });
    }
    return str;
  }

  function getLangMeta(code) {
    for (var i = 0; i < LANGS.length; i++) { if (LANGS[i].code === code) return LANGS[i]; }
    return LANGS[0];
  }

  function applyLang(code) {
    var meta = getLangMeta(code);
    current = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) { /* sessiz */ }
    document.documentElement.setAttribute('lang', code);
    document.documentElement.setAttribute('dir', meta.dir);
    document.body.classList.toggle('is-rtl', meta.dir === 'rtl');
    if (document.title) {
      var pageTitle = t('page.title');
      if (pageTitle) document.title = pageTitle;
    }
    subscribers.forEach(function (fn) { try { fn(code, meta); } catch (e) { /* sessiz */ } });
    // DOM hazırsa statik data-i18n elementlerini de güncelle
    if (document.readyState !== 'loading') {
      applyDomTranslations();
    }
  }

  /* ---- Dil seçici ---- */
  function buildLangPicker() {
    var nav = document.querySelector('.site-nav');
    if (!nav || document.getElementById('lang-picker')) return;

    var wrapper = document.createElement('div');
    wrapper.className = 'lang-picker';
    wrapper.setAttribute('role', 'navigation');
    wrapper.setAttribute('aria-label', 'Language selector');

    var btn = document.createElement('button');
    btn.className = 'lang-btn';
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.id = 'lang-picker';

    var label = document.createElement('span');
    label.className = 'lang-label';
    label.textContent = getLangMeta(current).short;

    var chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');
    chevron.setAttribute('stroke-linecap', 'round');
    chevron.setAttribute('width', '12');
    chevron.setAttribute('height', '12');
    chevron.setAttribute('aria-hidden', 'true');
    var chevPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    chevPath.setAttribute('d', 'M6 9l6 6 6-6');
    chevron.appendChild(chevPath);

    btn.appendChild(label);
    btn.appendChild(chevron);

    var dropdown = document.createElement('ul');
    dropdown.className = 'lang-dropdown';
    dropdown.setAttribute('role', 'listbox');
    dropdown.setAttribute('aria-label', 'Language selector');
    dropdown.hidden = true;

    LANGS.forEach(function (lang) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.setAttribute('data-lang', lang.code);
      li.setAttribute('aria-selected', String(lang.code === current));
      li.className = 'lang-option' + (lang.code === current ? ' is-active' : '');
      li.textContent = lang.label;
      li.addEventListener('click', function () {
        applyLang(lang.code);
        label.textContent = lang.short;
        dropdown.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        dropdown.querySelectorAll('.lang-option').forEach(function (el) {
          var c = el.getAttribute('data-lang');
          el.classList.toggle('is-active', c === lang.code);
          el.setAttribute('aria-selected', String(c === lang.code));
        });
      });
      dropdown.appendChild(li);
    });

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = !dropdown.hidden;
      dropdown.hidden = open;
      btn.setAttribute('aria-expanded', String(!open));
    });
    document.addEventListener('click', function () {
      dropdown.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    });

    wrapper.appendChild(btn);
    wrapper.appendChild(dropdown);
    nav.insertBefore(wrapper, nav.firstChild);
  }

  /* ---- Genel DOM güncelleme (data-i18n) ---- */
  function applyDomTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var key = el.getAttribute('data-i18n');
      var prop = el.getAttribute('data-i18n-prop') || 'textContent';
      var val = t(key);
      if (prop === 'innerHTML') {
        el.innerHTML = val;
      } else if (prop === 'placeholder') {
        el.placeholder = val;
      } else if (prop === 'aria-label') {
        el.setAttribute('aria-label', val);
      } else {
        el.textContent = val;
      }
    });
  }

  /* ---- Örnek ürünler (Supabase'e bağlanamadığında fallback) ---- */
  var SAMPLE_PRODUCTS = [
    {
      id: 'sample-001',
      name_tr: 'Anadolu Motifli Dokuma Şal',
      name_en: 'Anatolian Motif Woven Shawl',
      name_ar: 'شال منسوج بنقوش أناضولية',
      name_de: 'Anatolisches Motiv Webschal',
      name_fr: 'Châle tissé à motifs anatoliens',
      desc_tr: 'El dokuma, %100 doğal yün. Anadolu\'nun geleneksel desenleriyle hazırlanmış, sıcak ve şık bir şal.',
      desc_en: 'Hand-woven, 100% natural wool. A warm and stylish shawl crafted with traditional Anatolian patterns.',
      desc_ar: 'منسوج يدويًا من الصوف الطبيعي 100%. شال دافئ وأنيق بالأنماط التقليدية الأناضولية.',
      desc_de: 'Handgewebt, 100% Naturwolle. Ein warmer und stilvoller Schal mit traditionellen anatolischen Mustern.',
      desc_fr: 'Tissé à la main, laine 100% naturelle. Un châle chaud et élégant aux motifs anatoliens traditionnels.',
      price: 49.99, category: 'Şal', image_url: '', active: true, stock: 8,
      created_at: '2024-01-01T00:00:00Z', _isSample: true
    },
    {
      id: 'sample-002',
      name_tr: 'Geleneksel Desenli Fular',
      name_en: 'Traditional Pattern Scarf',
      name_ar: 'وشاح بنقوش تقليدية',
      name_de: 'Traditionelles Muster-Tuch',
      name_fr: 'Foulard à motifs traditionnels',
      desc_tr: 'El boyanmış, %100 ipek. Geleneksel Türk sanatının izlerini taşıyan zarif bir fular.',
      desc_en: 'Hand-dyed, 100% silk. An elegant scarf bearing traces of traditional Turkish artistry.',
      desc_ar: 'مصبوغ يدويًا، حرير 100%. وشاح أنيق يحمل ملامح الفن التركي التقليدي.',
      desc_de: 'Handbemalt, 100% Seide. Ein elegantes Tuch mit Spuren traditioneller türkischer Kunst.',
      desc_fr: 'Teint à la main, soie 100%. Un foulard élégant portant les traces de l\'art turc traditionnel.',
      price: 29.99, category: 'Fular', image_url: '', active: true, stock: 12,
      created_at: '2024-01-02T00:00:00Z', _isSample: true
    }
  ];

  function getSampleName(p) {
    return p['name_' + current] || p['name_tr'] || '';
  }
  function getSampleDesc(p) {
    return p['desc_' + current] || p['desc_tr'] || '';
  }

  /* ---- Genel API ---- */
  var I18N = {
    t: t,
    get current() { return current; },
    get langs() { return LANGS.slice(); },
    setLang: applyLang,
    subscribe: function (fn) { subscribers.push(fn); },
    buildPicker: buildLangPicker,
    applyDom: applyDomTranslations,
    sampleProducts: SAMPLE_PRODUCTS,
    getSampleName: getSampleName,
    getSampleDesc: getSampleDesc
  };

  /* ---- Başlat ---- */
  (function () {
    var saved = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch (e) { /* sessiz */ }
    var valid = LANGS.some(function (l) { return l.code === saved; });
    current = valid ? saved : DEFAULT_LANG;
    applyLang(current);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        buildLangPicker();
        applyDomTranslations();
      });
    } else {
      buildLangPicker();
      applyDomTranslations();
    }
  })();

  window.__sarkI18n = I18N;
})();

