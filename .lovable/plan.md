## Hedef

Uygulama sadece **haftalık %10-20 yükselecek hisseleri önceden yakalamak** için çalışsın. Sen hiçbir ayar yapma — sistem her gece kendini değerlendirsin ve parametrelerini otomatik güncellesin.

## 1. Menü sadeleştirme

**Kalacak 4 sayfa:**
- **Ana sayfa** → "Bu Hafta Al" listesi + portföy takibi
- **Hisse detay** (`/hisse/$symbol`)
- **Tahmin takibi** (`/tahmin-takibi`)
- **Model sağlığı** (`/model-health`)

**Kaldırılacak sayfalar:**
Fırsatlar, Watchlist, Signals, AI Patterns, Feature Importance, OOS, Backtest, Backtest Lab, ML Lab, Ensemble Lab, Market Intelligence, Coverage, Stocks, Events, Methodology (15 sayfa)

Route dosyaları silinecek, `app-shell.tsx` menüsü 4 linke inecek.

## 2. Ana sayfa — "Bu Hafta Al" + Portföy

**Üst bölüm: Bu Hafta Al (5-10 hisse)**
- Sadece haftalık **%10+ potansiyeli** olan, güven skoru **≥60** olan hisseler
- Her kart: sembol, giriş fiyatı, hedef (%), güven, "Aldım" butonu
- "Aldım" → localStorage'a kaydeder (backend gerekmez)

**Alt bölüm: Portföyüm**
- Aldığın hisselerin canlı fiyatı, kar/zarar %, hedefe kalan mesafe
- "Sattım" butonu → geçmişe taşır
- Küçük özet: toplam kar/zarar, isabet oranı

## 3. Haftalık %10-20 hedefine odaklanma

Şu an sistem çoklu horizon karışık öneriyor. Değişecek:
- Öneri filtresi: sadece `horizon=5` (5 iş günü ≈ 1 hafta) ve `target_key ≥ 10%` kalıpları
- Sıralama: haftalık beklenen getiri × güven skoru
- Minimum eşik: güven ≥ 60, likidite ≥ orta

## 4. Otomatik günlük öz-ayarlama

Zaten `daily-audit` cron çalışıyor. Genişletilecek:

Her gece 02:00'de:
1. Dün önerilen hisseleri değerlendir (tuttu/tutmadı)
2. Son 30 günün isabetini hesapla
3. **Otomatik parametre ayarı:**
   - İsabet <%40 → güven eşiğini +5 yükselt (daha seçici ol)
   - İsabet >%60 → güven eşiğini -3 düşür (daha çok fırsat)
   - Kalıp bazlı: son 20 tahminde <%30 tutan kalıpları geçici olarak devre dışı bırak
4. Ayarları `ai_params` tablosuna yaz — kod okur, deploy gerekmez
5. Model sağlığı sayfasında son 30 günün otomatik ayar geçmişi görünür

## Teknik detaylar

**Silinecek route'lar:** `firsatlar.tsx`, `watchlist.tsx`, `signals.tsx`, `ai-patterns.tsx`, `feature-importance.tsx`, `oos.tsx`, `backtest.tsx`, `backtest-lab.tsx`, `ml-lab.tsx`, `ensemble-lab.tsx`, `market-intelligence.tsx`, `coverage.tsx`, `stocks.tsx`, `events.tsx`, `methodology.tsx`

**Yeni dosyalar:**
- `src/lib/portfolio.ts` — localStorage tabanlı alım/satım kaydı
- `src/components/buy-list.tsx` — bu hafta al kartları
- `src/components/portfolio-panel.tsx` — portföy takibi
- `src/lib/ml/auto-tuner.ts` — günlük parametre ayar mantığı

**Değişecek:**
- `src/routes/index.tsx` — tamamen yeniden yazılacak (buy list + portfolio)
- `src/components/app-shell.tsx` — 4 link
- `src/lib/opportunities.ts` — haftalık %10+ filtresi + `ai_params`'tan eşik okuma
- `src/routes/api/public/hooks/daily-audit.ts` — auto-tuner çağrısı eklenecek

**Migration:** `ai_params` tablosuna `min_confidence`, `min_weekly_target`, `disabled_patterns` alanları (varsa kullanılır, yoksa eklenir).

## Kredi tahmini

~8-10 kredi: 15 dosya silme (toplu), 4 yeni dosya, 4 dosya güncelleme, 1 migration.

## Onay

Onaylarsan hemen başlarım. Kaldırılan sayfalarda değerli bir şey görüyorsan söyle, saklayayım.