# Amber Protocol — Izstrādes Plāns un Atskaites Punkti

**Pielikums Nr. 1 pie Līguma AP-JDA-2026-001**
**Versija:** 1.1
**Datums:** 2026-02-27
**Periods:** 2026-03-01 — 2026-03-31 (1 mēnesis)
**Kopējais budžets:** 1 000 EUR

---

## 1. Budžeta Sadalījums

| Pozīcija | Summa (EUR) | Piezīmes |
|----------|-------------|----------|
| AI izstrādes platforma (Kiro Pro+) | 200 | Mēneša abonements — koda ģenerēšana, pārskatīšana, testēšana |
| LLM API servisi (OpenAI / Anthropic) | 150 | Līgumu ģenerēšanas dzinējs, testēšanas dati |
| IPFS piespraušanas serviss (Pinata Pro) | 80 | Decentralizēta līgumu teksta glabātuve |
| Domēns, DNS, SSL sertifikāts | 50 | amberprotocol.io domēna reģistrācija un pārvaldība |
| Drošības audita rīki (Snyk / SonarCloud) | 120 | Pirmkoda ievainojamību skenēšana, atkarību audits |
| Testēšanas infrastruktūra | 50 | Base Sepolia testnet, staging izvietošana |
| Dizaina un dokumentācijas rīki | 80 | Figma, API dokumentācijas ģenerēšana |
| Juridiskā konsultācija (veidņu pārbaude) | 120 | Rikārdiāna Līgumu veidņu juridiskā atbilstība |
| Rezerve / neparedzēti izdevumi | 150 | Papildu servisi, ārkārtas situācijas |
| **Kopā** | **1 000** | |

---

## 2. Maksājumu Grafiks

| Maksājums | Summa (EUR) | Nosacījums | Termiņš |
|-----------|-------------|-----------|---------|
| Avansa maksājums | 500 | Līguma parakstīšanas brīdī | Līdz 2026-03-03 |
| Starpposma maksājums | 500 | Pēc 3. atskaites punkta pieņemšanas (Veidņu Sistēma + LLM) | Līdz 2026-03-14 |

---

## 3. Izstrādes Pieeja

Amber Protocol MVP tiek izstrādāts ar AI-paātrinātu pieeju, izmantojot pamata programēšanas zināšanas kā arī MI kā galveno izstrādes resursu. Šī pieeja ļauj vienam izstrādātājam sasniegt rezultātus, kas tradicionāli prasītu 3-4 izstrādātāju komandu.

**Tehnoloģiju steks:**
- Frontend + API: Next.js App Router (paplašinot esošo mārketinga vietni)
- Datubāze: Supabase (PostgreSQL) — bezmaksas līmenis
- Glabātuve: IPFS caur Pinata
- Blokķēde: Base L2 testnet (bezmaksas gāze)
- Izvietošana: Vercel (bezmaksas līmenis)
- LLM: OpenAI / Anthropic API

---

## 4. Atskaites Punkti — 1. Fāze (MVP)

### Kopsavilkums

| Nr. | Atskaites punkts | Termiņš | Nodevums |
|-----|-----------------|---------|----------|
| 1 | Pamata infrastruktūra | 3. marts | Datubāze, RLS, trigeri |
| 2 | Līgumu Dzinējs | 8. marts | Izveide, hešošana, dzīves cikls, IPFS |
| 3 | Veidņu Sistēma + LLM | 13. marts | 6 veidnes, LLM ģenerēšana |
| 4 | Paraksts + Auth | 17. marts | SIWE, ECDSA, sesijas |
| 5 | Aģentu API | 21. marts | 7 galapunkti, dokumentācija |
| 6 | Portāli | 26. marts | Lasītāja Portāls, Vadības Panelis |
| 7 | Testēšana + Izvietošana | 31. marts | Pilna plūsma, drošība, izvietošana |


---

### Atskaites Punkts 1: Pamata Infrastruktūra (1.–3. diena)

**Nodevumi:**
- Supabase projekta izveide ar datubāzes shēmu (tabulas: contracts, templates, signatures, audit_log, disputes, api_keys, amendment_chain)
- Rindu līmeņa drošības (RLS) politiku konfigurēšana
- Datubāzes indeksu un statusu pārejas trigeru izveide
- Vides mainīgo konfigurēšana (Supabase, Pinata, OpenAI)
- Projekta struktūras paplašināšana esošajā Next.js vietnē

**Pieņemšanas kritēriji:**
- Datubāze ir izveidota ar visām tabulām un atsauces integritāti
- RLS politikas ir aktīvas un testētas
- Statusu pārejas trigeris darbojas (neļauj nederīgas pārejas)

---

### Atskaites Punkts 2: Līgumu Dzinējs (4.–8. diena)

**Nodevumi:**
- Līgumu izveides serviss (Contract Engine) ar SHA-256 hešošanu
- Līgumu dzīves cikla pārvaldība (draft → pending_signature → active → fulfilled/disputed/terminated)
- IPFS integrācija — līguma teksta augšupielāde un CID saglabāšana
- Līguma ID ģenerēšana formātā `amber-YYYY-NNNN`
- Pilnvardevēja Deklarācijas validācija (obligāts lauks)
- Audita žurnāla automātiska aizpildīšana pie katras statusu pārejas
- Grozījumu Ķēdes atbalsts (parent_contract_hash)

**Pieņemšanas kritēriji:**
- Var izveidot Deleģēšanas un Komercijas līgumus no veidnēm
- SHA-256 heša aprites integritāte (hash(stored_text) == original_hash)
- Līguma teksts ir pieejams IPFS
- Nederīgas statusu pārejas tiek noraidītas

---

### Atskaites Punkts 3: Veidņu Sistēma un LLM Ģenerators (9.–13. diena)

> **Starpposma maksājums (500 EUR) — pēc šī atskaites punkta pieņemšanas**

**Nodevumi:**
- Parametrizētu veidņu bibliotēka (vismaz 3 Deleģēšanas + 3 Komercijas veidnes)
- JSON Schema validācija veidņu parametriem
- Veidņu versiju pārvaldība
- Obligāto klauzulu nodrošināšana (Pilnvardevēja Deklarācija, Piemērojamās Tiesības, ADP strīdu risināšana)
- LLM Ģenerators — dabiskās valodas apraksta pārveidošana divformātu līgumā
- Trūkstošo lauku pieprasīšana (nevis nepilnīga līguma ģenerēšana)

**Pieņemšanas kritēriji:**
- Veidnes ir pārlūkojamas un izmantojamas līgumu izveidei
- Nederīgi parametri tiek noraidīti ar aprakstošām kļūdām
- LLM ģenerēšana izveido derīgu divformātu līgumu no teksta apraksta
- Ģenerētie līgumi iziet to pašu validāciju kā veidņu līgumi

---

### Atskaites Punkts 4: Digitālais Paraksts un SIWE Auth (14.–17. diena)

**Nodevumi:**
- SIWE (Sign-In with Ethereum) autentifikācija
- ECDSA paraksta verifikācija pret maka adresi
- Parakstīšanas plūsma (Deleģēšanas: 1 paraksts; Komercijas: 2 paraksti)
- Sesiju pārvaldība (24h derīgums)
- WalletConnect un MetaMask atbalsts
- Lomu piekļuves kontrole (owner, auditor, admin)

**Pieņemšanas kritēriji:**
- Lietotājs var autentificēties ar kripto maku
- Līguma parakstīšana pārslēdz statusu uz `active`
- Nederīgi paraksti tiek noraidīti
- Sesijas beidzas pēc 24h

---

### Atskaites Punkts 5: Aģentu API (18.–21. diena)

**Nodevumi:**
- RESTful API galapunkti: POST/GET /api/v1/contracts, POST sign, GET status, POST amend, GET templates
- API atslēgas un maka paraksta autentifikācija
- Ātruma ierobežošana (100 req/min)
- Lappušošana (limit/offset, noklusēti 20)
- Konsekventu kļūdu kodu atbildes (400, 401, 403, 404, 409, 500)
- OpenAPI/Swagger dokumentācija

**Pieņemšanas kritēriji:**
- Visi 7 galapunkti darbojas un ir dokumentēti
- Ātruma ierobežošana bloķē pārmērīgus pieprasījumus
- API atslēgas autentifikācija darbojas

---

### Atskaites Punkts 6: Lasītāja Portāls un Vadības Panelis (22.–26. diena)

**Nodevumi:**
- Lasītāja Portāls (/reader/[hashOrId]) — publisks līgumu skatītājs
  - Meklēšana pēc Līguma Heša vai cNFT ID
  - SHA-256 verifikācijas žetons (verificēts/manipulēts)
  - Dalīts skats: cilvēklasāms teksts + JSON
  - Pilnvardevēja Deklarācijas izcelšana
  - PDF eksports
  - Grozījumu Ķēdes vizualizācija
- Vadības Panelis (/dashboard/) — autentificēts
  - Kopsavilkuma skats (līgumu skaits pēc statusa, aktīvie aģenti)
  - Līgumu saraksts ar filtrēšanu un meklēšanu
  - Līguma detaļu skats
  - Aģentu pārvaldība (pilnvaru atsaukšana, tēriņu limiti)

**Pieņemšanas kritēriji:**
- Lasītāja Portāls ir publiski pieejams un verificē līgumus
- PDF eksports darbojas
- Vadības Panelis parāda līgumus un ļauj filtrēt
- Aģentu pilnvaru atsaukšana darbojas

---

### Atskaites Punkts 7: Integrācijas Testēšana un Izvietošana (27.–31. diena)

**Nodevumi:**
- Pilna plūsmas testēšana (izveide → parakstīšana → verificēšana → grozīšana)
- Drošības pārbaude (RLS, autentifikācija, parakstu verifikācija)
- Veiktspējas testēšana (API ātruma ierobežošana, datubāzes vaicājumi)
- Izvietošana uz Vercel (frontend + API) un Supabase (datubāze)
- A2A Aģenta Karte (/.well-known/agent.json) — pamata versija
- Dokumentācijas pabeigšana

**Pieņemšanas kritēriji:**
- Pilna līguma dzīves cikla plūsma darbojas no gala līdz galam
- Nav kritisko drošības ievainojamību
- Platforma ir izvietota un pieejama
- API dokumentācija ir publicēta

---

## 5. Nākamās Fāzes (ārpus šī līguma)

### 5.1. Fāze 2 — cNFT un Blokķēde

| Komponente | Apraksts |
|-----------|----------|
| Solidity viedais līgums | ERC-721 cNFT kalšana uz Base L2 |
| cNFT kalšanas serviss | Automātiska kalšana pie līguma aktivizēšanas |
| Dinamiskā API Atslēgu Kartēšana | Maka paraksts → cNFT → API atslēga |
| x402 V2 paplašinājums | Līgumu hešu iegulšana maksājumu metadatos |
| Grozījumu Ķēde blokķēdē | parent_contract_hash on-chain |

### 5.2. Fāze 3 — Ekosistēmas Integrācija

| Komponente | Apraksts |
|-----------|----------|
| ERC-8004 integrācija | Identitātes un reputācijas verifikācija |
| MCP Serveris | Amber kā MCP rīks AI aģentiem |
| ADP strīdu risināšana | IETF standartam atbilstoša strīdu apstrāde |
| Atbilstības ziņojumi | CSV/PDF eksports, laika līnijas vizualizācija |

---

## 6. Risku Pārvaldība

| Risks | Ietekme | Mazināšana |
|-------|---------|-----------|
| IPFS piespraušanas servisa pārtraukums | Līgumu teksts nav pieejams | Supabase kā rezerves glabātuve; teksts saglabāts abās vietās |
| OpenAI API izmaksu pieaugums | LLM ģenerēšanas izmaksas pārsniedz budžetu | Kešošana, veidņu prioritizēšana pār brīvu ģenerēšanu |
| Supabase bezmaksas līmeņa ierobežojumi | Datubāzes pieprasījumu limits | Optimizēti vaicājumi, indeksi; pāreja uz Pro plānu, ja nepieciešams |
| Juridiskā nenoteiktība par AI aģentu līgumiem | Regulatīvās izmaiņas | Pilnvardevēja Deklarācija nodrošina juridisko pamatu; ADP standarts |
| Izstrādes kavēšanās | MVP nav gatavs 1 mēnesī | Prioritizēt pamata funkcionalitāti; atlikt Vadības Paneli, ja nepieciešams |

---

## 7. Panākumu Metrikas (MVP)

| Metrika | Mērķis |
|---------|--------|
| Līgumu izveide | Var izveidot Deleģēšanas un Komercijas līgumus no veidnēm un LLM |
| Parakstīšana | ECDSA parakstu verifikācija un statusu pārejas darbojas |
| Verificēšana | Lasītāja Portāls verificē līgumu integritāti (SHA-256) |
| API | Visi 7 galapunkti darbojas ar autentifikāciju un ātruma ierobežošanu |
| Veidnes | Vismaz 6 veidnes (3 deleģēšanas + 3 komercijas) |
| Izvietošana | Platforma ir dzīva uz Vercel + Supabase |

---

## 8. Komandas Struktūra

| Loma | Resurss |
|------|---------|
| Galvenais izstrādātājs / arhitekts | Projekta vadītājs (ar Kiro Pro+ AI palīdzību) |
| AI izstrādes platforma | Kiro Pro+ — koda ģenerēšana, testēšana, dokumentēšana |
| Juridiskā konsultācija | Ārējais konsultants (veidņu validācija) |

---

*Dokuments sagatavots: 2026-02-27*
*Pielikums Nr. 1 pie Līguma AP-JDA-2026-001*