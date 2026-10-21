/* ==========================================================================
   ŞARK DOKUSU — Yapılandırma
   Bu dosyada YALNIZCA aşağıdaki dört değer bulunur.
   Secret / service_role anahtarı burada ASLA yer almaz.
   ========================================================================== */

window.SARK_CONFIG = {
  // Supabase Project URL
  supabaseUrl: 'https://fwfhlxjvfvmzgwdnfmbc.supabase.co',

  // Supabase Publishable (anon) Key — tarayıcıda kullanılmak üzere tasarlanmıştır
  supabaseKey: 'sb_publishable_ufGOMcwk93nzGdw3Vt8QLQ_YpmBNAmB',

  // Mağaza adı (başlık, alt bilgi ve WhatsApp mesajlarında kullanılır)
  storeName: 'Şark Dokusu',

  // WhatsApp numarası — uluslararası format, + ve boşluk OLMADAN.
  // Örnek: 905321234567
  // DİKKAT: Aşağıdaki değer bir YER TUTUCUDUR. X içerdiği sürece
  // sipariş düğmeleri devre dışı kalır ve bağlantı çalışmaz.
  whatsappNumber: '905323303482'
};
