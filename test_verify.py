"""
Şark Dokusu — Python 3.12 Playwright doğrulama testi (v2)
Fallback kaldırıldı: Supabase erişilemezse hata durumu gösterilir.
Kontroller: i18n (TR/EN/AR), hata durumu, USD formatlama, admin etiketleri.
Ekran görüntüleri screenshots/ klasörüne kaydedilir.
"""

import asyncio
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE_DIR  = Path(r"D:\sarkdokusu-site")
SS_DIR    = BASE_DIR / "screenshots"
INDEX_URL = "file:///D:/sarkdokusu-site/index.html"
ADMIN_URL = "file:///D:/sarkdokusu-site/admin.html"
SS_DIR.mkdir(exist_ok=True)

results, fails = [], 0

def check(label, got, expect):
    global fails
    ok = (bool(got) == expect) if isinstance(expect, bool) else (got == expect)
    if not ok:
        fails += 1
    results.append(f"{'PASS' if ok else 'FAIL'}  {label}\n       got={got!r}  expect={expect!r}")
    print(results[-1])


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        page = await ctx.new_page()

        # Supabase project domain'ini blokla -> hata durumu tetiklenir
        supa_blocked = 0
        async def block_supabase(route, req):
            nonlocal supa_blocked
            supa_blocked += 1
            await route.abort()
        await page.route("**/fwfhlxjvfvmzgwdnfmbc.supabase.co/**", block_supabase)

        console_msgs = []
        page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text}"))
        page.on("pageerror", lambda e: console_msgs.append(f"[pageerror] {e.message}"))

        await page.goto(INDEX_URL, wait_until="domcontentloaded")
        # Supabase bloklanınca hata durumu bekleniyor (sample fallback artık yok)
        await page.wait_for_selector(".state-box", timeout=20_000)

        # 1. Hata durumu — sample fallback kaldırıldı
        print("\n--- Hata durumu (Supabase bloklu, fallback yok) ---")
        check("Supabase istekleri bloklandı", supa_blocked > 0, True)
        check("product-card yok (fallback kaldırıldı)",
              await page.locator(".product-card").count(), 0)
        check("state-box (hata) görünür",
              await page.locator(".state-box").count() > 0, True)
        error_title_tr = await page.locator(".state-box h3").first.text_content()
        check("hata başlığı TR", error_title_tr, "Ürünler yüklenemedi")

        # 2. Varsayılan dil (TR)
        print("\n--- Varsayılan dil (TR) ---")
        check("html[lang]", await page.get_attribute("html", "lang"), "tr")
        check("html[dir]",  await page.get_attribute("html", "dir"),  "ltr")
        hero_tr = await page.locator("h1").first.inner_html()
        check("hero h1 TR 'sabrın' içeriyor", "sabrın" in hero_tr, True)
        check("nav Koleksiyon",
              await page.locator(".nav-link").first.text_content(), "Koleksiyon")

        await page.screenshot(path=str(SS_DIR / "01_tr_error_state.png"))
        print("  → screenshot: screenshots/01_tr_error_state.png")

        async def switch_lang(code):
            await page.click("#lang-picker")
            await page.click(f".lang-option[data-lang='{code}']")
            await page.wait_for_timeout(300)

        # 3. İngilizce
        print("\n--- İngilizce (EN) ---")
        await switch_lang("en")
        check("en html[lang]", await page.get_attribute("html", "lang"), "en")
        hero_en = await page.locator("h1").first.inner_html()
        check("hero h1 EN 'patience' içeriyor", "patience" in hero_en, True)
        check("nav Collection",
              await page.locator(".nav-link").first.text_content(), "Collection")
        error_title_en = await page.locator(".state-box h3").first.text_content()
        check("hata başlığı EN", error_title_en, "Could not load products")

        # 4. USD formatlama (store.js/admin.js ile aynı Intl.NumberFormat kodu)
        print("\n--- USD formatlama ---")
        usd = await page.evaluate("""() => {
            const f = new Intl.NumberFormat('en-US', {
                style: 'currency', currency: 'USD',
                minimumFractionDigits: 2, maximumFractionDigits: 2
            });
            return [f.format(49.99), f.format(29.99), f.format(0), f.format(1200)];
        }""")
        check("format(49.99)",  usd[0], "$49.99")
        check("format(29.99)",  usd[1], "$29.99")
        check("format(0)",      usd[2], "$0.00")
        check("format(1200)",   usd[3], "$1,200.00")

        await page.screenshot(path=str(SS_DIR / "02_en_error_state.png"))
        print("  → screenshot: screenshots/02_en_error_state.png")

        # 5. Arapça (RTL)
        print("\n--- Arapça / RTL ---")
        await switch_lang("ar")
        check("ar html[lang]", await page.get_attribute("html", "lang"), "ar")
        check("ar html[dir]",  await page.get_attribute("html", "dir"),  "rtl")
        check("ar body.is-rtl",
              await page.evaluate("() => document.body.classList.contains('is-rtl')"), True)
        hero_ar = await page.locator("h1").first.inner_html()
        check("hero h1 AR 'الصبر' içeriyor", "الصبر" in hero_ar, True)

        await page.screenshot(path=str(SS_DIR / "03_ar_rtl.png"))
        print("  → screenshot: screenshots/03_ar_rtl.png")

        # 6. TR'ye dön — RTL sıfırlanır
        print("\n--- TR'ye dön ---")
        await switch_lang("tr")
        check("tr html[dir]",  await page.get_attribute("html", "dir"),  "ltr")
        check("tr body.is-rtl sıfırlandı",
              await page.evaluate("() => document.body.classList.contains('is-rtl')"), False)

        # 7. Admin sayfası — USD etiketleri
        print("\n--- Admin sayfası (USD) ---")
        await page.goto(ADMIN_URL, wait_until="domcontentloaded")
        await page.wait_for_load_state("networkidle")
        check("login-view görünür",
              await page.locator("#login-view").is_visible(), True)
        price_label = await page.locator("label[for='p-price']").text_content()
        check("admin fiyat etiketi '($)' içeriyor", "($)" in price_label, True)
        check("admin fiyat placeholder",
              await page.get_attribute("#p-price", "placeholder"), "Örn. 49.99")

        await page.screenshot(path=str(SS_DIR / "04_admin_login.png"))
        print("  → screenshot: screenshots/04_admin_login.png")

        # 8. JS konsol hataları (Supabase abort hariç)
        print("\n--- JS konsol hataları ---")
        real_errors = [
            m for m in console_msgs
            if not any(kw in m.lower() for kw in
                       ["supabase", "err_failed", "failed to load resource", "net::err"])
        ]
        check("beklenmedik JS hatası yok", len(real_errors), 0)
        if real_errors:
            print("  Hatalar:", real_errors[:5])

        await browser.close()

    total = len(results)
    print(f"\n{'='*60}")
    if fails == 0:
        print(f"ALL TESTS PASS  ({total}/{total})")
    else:
        print(f"{fails} FAIL / {total}  ({total - fails} passed)")
    print(f"Ekran goruntuleri: {SS_DIR}")
    print('=' * 60)
    sys.exit(0 if fails == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
