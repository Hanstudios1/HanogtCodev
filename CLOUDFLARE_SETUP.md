# Cloudflare Kurulum Rehberi - Hanogt Codev

## Seçenek 1: Cloudflare Pages ile Deploy (Önerilen)

### Adım 1: Cloudflare Hesabı Oluştur
1. [cloudflare.com](https://cloudflare.com) adresine git
2. "Sign Up" butonuna tıkla
3. E-posta ve şifre ile hesap oluştur

### Adım 2: Cloudflare Pages Projesi Oluştur
1. Dashboard'da **Pages** sekmesine git
2. **Create a project** butonuna tıkla
3. **Connect to Git** seçeneğini seç
4. GitHub hesabını bağla ve `nodal-perigee` reposunu seç

### Adım 3: Build Ayarları
```
Framework preset: Next.js
Build command: npm run build
Build output directory: .next
Root directory: /
```

### Adım 4: Environment Variables Ekle
Pages projesinde **Settings > Environment variables** bölümüne git:

```env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=https://your-domain.pages.dev

# Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### Adım 5: Deploy Et
- **Save and Deploy** butonuna tıkla
- Build tamamlanınca `your-project.pages.dev` adresinden erişebilirsin

---

## Seçenek 2: Mevcut Site için Cloudflare CDN/Proxy

Eğer siten zaten Vercel, Netlify veya başka bir yerde hostlanıyorsa:

### Adım 1: Domain Ekle
1. Cloudflare Dashboard > **Add a Site**
2. Domain adını gir (örn: `hanogtcodev.com`)
3. **Free** planı seç

### Adım 2: DNS Ayarları
Cloudflare sana nameserver'lar verecek:
```
ns1.cloudflare.com
ns2.cloudflare.com
```

Domain kayıt sağlayıcında (GoDaddy, Namecheap vb.) bu nameserver'ları güncelle.

### Adım 3: DNS Records
```
Type: CNAME
Name: @
Target: cname.vercel-dns.com (veya hosting sağlayıcının adresi)
Proxy: Proxied (turuncu bulut)

Type: CNAME
Name: www
Target: cname.vercel-dns.com
Proxy: Proxied
```

### Adım 4: SSL/TLS Ayarları
**SSL/TLS > Overview** bölümünde:
- **Full (strict)** modunu seç

### Adım 5: Önerilen Güvenlik Ayarları
**Security > Settings**:
- Security Level: **Medium**
- Challenge Passage: **30 minutes**
- Browser Integrity Check: **On**

**Speed > Optimization**:
- Auto Minify: ✅ JavaScript, CSS, HTML
- Brotli: ✅ On
- Early Hints: ✅ On
- Rocket Loader: ❌ Off (Next.js ile uyumlu değil)

---

## Cloudflare Workers ile Edge Functions (İleri Seviye)

### `wrangler.toml` oluştur:
```toml
name = "hanogt-codev"
main = ".worker-next/index.mjs"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[site]
bucket = ".vercel/output/static"
```

### Deploy komutu:
```bash
npm install -g wrangler
wrangler login
npm run build
wrangler deploy
```

---

## Faydalı Cloudflare Özellikleri

| Özellik | Açıklama | Ücretsiz mi? |
|---------|----------|--------------|
| CDN | Global içerik dağıtımı | ✅ |
| DDoS Koruması | Saldırı koruması | ✅ |
| SSL/TLS | HTTPS sertifikası | ✅ |
| Caching | Sayfa önbellekleme | ✅ |
| Web Analytics | Ziyaretçi istatistikleri | ✅ |
| Page Rules | URL kuralları (3 adet) | ✅ |
| Firewall Rules | Güvenlik kuralları (5 adet) | ✅ |

---

## Sorun Giderme

### "Too many redirects" hatası
- SSL/TLS modunu **Full** veya **Full (strict)** yap
- Hosting sağlayıcında da HTTPS zorunlu olmalı

### CSS/JS yüklenmiyor
- Rocket Loader'ı kapat
- Auto Minify'ı kapat ve test et

### API çağrıları başarısız
- Security Level'ı düşür
- Firewall Rules'da API yollarını whitelist'e ekle:
  ```
  (http.request.uri.path contains "/api/")
  Action: Allow
  ```

---

## Önerilen Page Rules (Ücretsiz 3 adet)

1. **API Caching Bypass**
   - URL: `*yourdomain.com/api/*`
   - Cache Level: Bypass

2. **Static Assets Cache**
   - URL: `*yourdomain.com/_next/static/*`
   - Cache Level: Cache Everything
   - Edge Cache TTL: 1 month

3. **Force HTTPS**
   - URL: `http://*yourdomain.com/*`
   - Always Use HTTPS: On
