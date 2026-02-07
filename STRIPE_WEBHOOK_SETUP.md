# Stripe Webhook -asennus

## 📋 Miksi webhook tarvitaan?

Stripe webhook varmistaa, että saat tiedon **jokaisesta onnistuneesta maksusta** – vaikka asiakas sulkisi selaimen ennen success-sivua. Webhook mahdollistaa myös **automaattisen tilausvahvistusviestin** lähettämisen asiakkaan sähköpostiin kuvalla.

---

## 🔧 Asennusohjeet

### 1. Luo webhook Stripe Dashboardissa

1. Kirjaudu Stripe Dashboardiin: https://dashboard.stripe.com/
2. Mene: **Developers** → **Webhooks**
3. Klikkaa **+ Add endpoint**

### 2. Webhook-asetukset

**Endpoint URL:**
```
https://muotokuvasi.fi/api/stripe-webhook
```
(Korvaa `muotokuvasi.fi` omalla domainillasi, jos eri)

**Events to send:**
- Valitse: **Select events**
- Etsi ja valitse: `checkout.session.completed`
- Klikkaa **Add events**

### 3. Kopioi Webhook Signing Secret

1. Kun webhook on luotu, klikkaa sitä listasta
2. Kopioi **Signing secret** (alkaa `whsec_...`)
3. Tallenna se turvalliseen paikkaan

### 4. Lisää signing secret Verceliin

1. Mene Vercel Dashboardiin: https://vercel.com/
2. Valitse projektisi (`muotokuvat`)
3. Mene: **Settings** → **Environment Variables**
4. Lisää uusi muuttuja:
   - **Key:** `STRIPE_WEBHOOK_SECRET`
   - **Value:** `whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx` (kopioimasi secret)
   - **Environments:** Valitse `Production`, `Preview`, ja `Development`
5. Klikkaa **Save**

### 5. Redeploy Vercelissä

1. Mene: **Deployments**-välilehdelle
2. Klikkaa uusimman deploymentin oikealla olevaa **...** -valikkoa
3. Valitse **Redeploy** (tai tee uusi git push)

---

## ✅ Testaus

### Testaa webhook lokaalisti (valinnainen)

Jos haluat testata ennen tuotantoa:

1. Asenna Stripe CLI: https://stripe.com/docs/stripe-cli
2. Kirjaudu: `stripe login`
3. Forwardaa webhookit lokaaliin:
   ```bash
   stripe listen --forward-to http://localhost:4321/api/stripe-webhook
   ```
4. Kopioi tulostettava **webhook signing secret** (alkaa `whsec_`)
5. Lisää se `.env`-tiedostoon:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
   ```
6. Käynnistä dev-serveri: `npm run dev`
7. Tee testiostos: `stripe trigger checkout.session.completed`

### Testaa tuotannossa

1. Tee oikea testiostos sivustollasi (käytä Stripen testikorttia: `4242 4242 4242 4242`)
2. Tarkista Stripe Dashboardista (**Webhooks** → klikkaa endpointtia → **Logs**):
   - Pitäisi näkyä `checkout.session.completed` tapahtuma
   - Status: `200 OK`
3. Tarkista asiakkaan sähköposti: pitäisi saapua tilausvahvistusviesti + kuva liitteenä

---

## 🔒 Tietoturva

- ✅ Webhook **validoi Stripe-signatuurin** joka pyynnössä → vain Stripe voi kutsua sitä
- ✅ Ilman oikeaa `STRIPE_WEBHOOK_SECRET`:ia webhook hylkää pyynnön (401 Unauthorized)
- ✅ Älä koskaan jaa `STRIPE_WEBHOOK_SECRET`:ia julkisesti (versionhallinta, chat, jne.)

---

## 📧 Tilausvahvistusviesti

Webhook lähettää automaattisesti tilausvahvistusviestin, joka sisältää:

- ✅ Kiitoksen tilauksesta
- ✅ Kuvan (inline + liitteenä)
- ✅ Latausnapin
- ✅ Tilausnumeron ja summan
- ✅ Muistutuksen: kuva saatavilla 24h

**Huom:** Jos `RESEND_API_KEY` puuttuu, webhook toimii silti, mutta ei lähetä viestiä.

---

## 🐛 Ongelmatilanteet

### Webhook ei vastaa (timeout)

- Tarkista että `STRIPE_WEBHOOK_SECRET` on oikein Vercelissä
- Tarkista Vercel-lokit: **Deployments** → klikkaa deployment → **Functions**-välilehti → etsi `/api/stripe-webhook`

### Viesti ei lähde

- Tarkista että `RESEND_API_KEY` on asetettu Vercelissä
- Tarkista Resend Dashboard: https://resend.com/emails (näkyykö viesti siellä?)
- Tarkista Vercel-lokit: pitäisi näkyä `✅ Tilausvahvistusviesti lähetetty`

### Stripe näyttää virheen "Webhook signature verification failed"

- `STRIPE_WEBHOOK_SECRET` on väärä tai puuttuu
- Olet käyttänyt väärän ympäristön secretia (test vs. live mode)

---

## 📚 Lisätietoja

- Stripe Webhooks -dokumentaatio: https://stripe.com/docs/webhooks
- Stripe CLI: https://stripe.com/docs/stripe-cli
- Resend -dokumentaatio: https://resend.com/docs
