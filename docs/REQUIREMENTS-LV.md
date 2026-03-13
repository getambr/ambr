# Prasību Dokuments

## Ievads

Amber Protocol pamata platforma ir backend infrastruktūra, API, viedie līgumi un tīmekļa portāli, kas nodrošina "Juridisko ietvaru AI aģentiem, kas darbojas reālajā pasaulē." Mārketinga vietne (jau izveidota un izvietota) komunicē vīziju; šī specifikācija definē pašu produktu. Pamata platforma ļauj uzņēmumiem izveidot Rikārdiāna līgumus (vienlaicīgi cilvēklasāmus, mašīnlasāmus un kriptogrāfiski parakstītus), kalt tos kā Līgumu NFT (cNFT) uz Base L2, un pārvaldīt pilnu aģentu deleģēšanas un komercijas līgumu dzīves ciklu. Platforma izmanto bezprofila, maks-kā-identitāte arhitektūru, kur AI aģenti tiek identificēti pēc to kriptogrāfiskajām maka adresēm caur ERC-8004, un līgumi tiek piegādāti kā NFT, nodrošinot nemainīgu līguma pierādījumu. Ieviešana seko fāžu pieejai: 1. fāze (MVP) nodrošina Līgumu Dzinēju, Deleģēšanas API, LLM līgumu ģenerēšanu un Lasītāja Portālu; 2. fāze pievieno cNFT kalšanu uz Base L2; 3. fāze integrē ERC-8004 reputācijas pārbaudes. Tehnoloģiju steks ir Next.js App Router (paplašinot esošo vietni), FastAPI vai NestJS backend, PostgreSQL caur Supabase, IPFS līgumu teksta glabāšanai, Solidity viedie līgumi uz Base L2, un Ethers.js blokķēdes mijiedarbībai. Mērķa infrastruktūras izmaksas — zem $50/mēnesī.

## Glosārijs

- **Platform** (Platforma): Amber Protocol pamata platforma — visi backend servisi, API, viedie līgumi un tīmekļa portāli
- **Contract_Engine** (Līgumu Dzinējs): Galvenais serviss, kas atbild par Rikārdiāna līgumu izveidi, hešošanu, glabāšanu, versiju pārvaldību un dzīves cikla vadību
- **Ricardian_Contract** (Rikārdiāna Līgums): Digitāls līgums, kas vienlaicīgi ir cilvēklasāms (jurists var to pārskatīt), mašīnlasāms (aģents var iegūt nosacījumus kā JSON) un kriptogrāfiski parakstīts (SHA-256 heša saite savieno abus formātus ar nemainīgu ierakstu blokķēdē)
- **Delegation_Contract** (Deleģēšanas Līgums): Rikārdiāna līgums, kas pilnvaro AI aģentu rīkoties uzņēmuma vai personas vārdā noteiktos ietvaros — tēriņu limiti, darbību apjoms, kategoriju ierobežojumi, darījumu partneru prasības un atbildības nosacījumi. Funkcionē kā "Pilnvara AI aģentiem"
- **Commerce_Contract** (Komercijas Līgums): Rikārdiāna līgums, kas tiek izveidots, kad aģents veic pirkumu, paraksta pakalpojumu līgumu vai vienojas par piegādātāja nosacījumiem uzņēmuma vārdā
- **Principal_Declaration** (Pilnvardevēja Deklarācija): Obligāts lauks katrā Rikārdiāna līgumā, kas norāda cilvēku vai uzņēmumu aiz AI aģenta kā līgumslēdzēju pusi. Nepieciešams, jo AI aģentiem pašlaik nav juridiskas personas statusa
- **cNFT** (Līguma NFT): NFT, kas tiek kalts uz Base L2 katram izpildītam līgumam. Satur metadatus, kas norāda uz līguma cilvēklasāmo tekstu un mašīnlasāmiem nosacījumiem IPFS. Kalpo kā nemainīgs, nododams līguma pierādījums
- **Amendment_Chain** (Grozījumu Ķēde): Saistīta cNFT secība, kurā grozījumi un papildinājumi atsaucas uz sākotnējo līgumu caur `parent_contract_hash`, veidojot izsekojamu vēsturi
- **Template_System** (Veidņu Sistēma): Juridiski pārbaudītu, parametrizētu Rikārdiāna līgumu veidņu bibliotēka tipiskām deleģēšanas un komercijas situācijām
- **Reader_Portal** (Lasītāja Portāls): Publisks tīmekļa portāls, kurā ikviens ar NFT ID vai līguma hešu var apskatīt, verificēt (blokķēdes heša salīdzināšana), auditēt, drukāt/eksportēt PDF un sekot līgumu Grozījumu Ķēdei
- **Agent_API** (Aģentu API): RESTful API, kas ļauj AI aģentiem programmatiski izveidot, parakstīt, vaicāt, verificēt pilnvarojumu un pārvaldīt līgumus
- **Dashboard** (Vadības Panelis): Cilvēkiem paredzēts tīmekļa portāls līgumu pārraudzībai, aģentu pārvaldībai, veidņu pārvaldībai un atbilstības ziņojumiem
- **LLM_Generator** (LLM Ģenerators): Serviss, kas pārveido dabiskās valodas aprakstus divformātu Rikārdiāna līgumos (cilvēklasāms teksts + mašīnlasāms JSON)
- **Dynamic_API_Key_Mapping** (Dinamiskā API Atslēgu Kartēšana): Sistēma, kas savieno Web3 makus ar Web2 API piekļuvi: maka paraksts → cNFT kalšana → API atslēgas ģenerēšana → iekšējā kartēšana API_KEY → cNFT_ID → Wallet_Address
- **ERC_8004**: Ethereum standarts (aktīvs kopš 2026. gada janvāra), kas definē Identitātes reģistru, Reputācijas reģistru un Validācijas reģistru AI aģentiem. Izmantots maka-kā-identitātes verifikācijai un reputācijas novērtēšanai
- **x402_V2**: Coinbase/Cloudflare maksājumu protokols (V2, 2025. gada decembris) ar modulāru spraudņu arhitektūru, maka sesijām (CAIP-122) un vairāku ķēžu atbalstu. Amber iegulst līgumu hešus x402 maksājumu metadatos kā paplašinājumu
- **ADP** (Aģentu Strīdu Protokols): IETF Agentic Dispute Protocol — topošs standarts, kas definē ziņojumu formātus, pierādījumu iesniegšanas standartus, kriptogrāfiskā pierādījuma prasības, pierādījumu ķēdes izsekošanu un divformātu lēmumus (JSON + PDF) aģentu strīdu risināšanai
- **MCP_Server** (MCP Serveris): Model Context Protocol serveris, kas atklāj Amber līgumu iespējas kā MCP rīkus, lai AI aģenti varētu atklāt veidnes un parakstīt līgumus caur MCP rīku izsaukumiem
- **A2A_Agent_Card** (A2A Aģenta Karte): Google A2A protokola atklāšanas karte, kas apraksta Amber iespējas, lai citi aģenti varētu atrast un mijiedarboties ar platformu
- **IPFS** (Starpplanētu Failu Sistēma): InterPlanetary File System — decentralizēta glabātuve cilvēklasāmā līguma teksta un cNFT metadatu JSON nemainīgai saglabāšanai
- **Base_L2**: Coinbase Layer 2 blokķēde (Ethereum rollup), kas izmantota cNFT kalšanai ar gāzes izmaksām zem $0.01
- **Supabase**: PostgreSQL-kā-serviss, kas nodrošina relāciju datubāzi, autentifikāciju un API slāni. Sākotnējai izvietošanai izmantots bezmaksas līmenis
- **Dispute_Service** (Strīdu Serviss): ADP-saderīgs serviss, kas apstrādā strīdu ierosināšanu, pierādījumu iesniegšanu, šķīrējtiesas darbplūsmu un lēmumu izsekošanu
- **Contract_Hash** (Līguma Hešs): SHA-256 kriptogrāfiskais hešs no cilvēklasāmā līguma teksta, kas kalpo kā mašīnlasāms identifikators, savienojot juridisko tekstu ar ierakstu blokķēdē
- **Concerto**: Accord Project atvērtā koda datu modeļa valoda viedajiem juridiskajiem līgumiem, kas tiek izvērtēta kā pamats Amber veidņu parametru shēmai
- **Nevermined**: x402 facilitators, kas apstrādā autorizāciju, mērīšanu un norēķinus AI aģentiem, ar Python un TypeScript SDK


## Prasības

### 1. prasība: Līgumu Dzinējs — Izveide un Hešošana

**Lietotāja Stāsts:** Kā aģentu izstrādātājs, es vēlos programmatiski izveidot Rikārdiāna līgumus no veidnēm vai pielāgotiem nosacījumiem, lai mans AI aģents varētu noslēgt juridiski saistošus, divformātu līgumus.

#### Pieņemšanas Kritēriji

1. KAD tiek iesniegts derīgs līguma izveides pieprasījums ar veidnes ID un parametriem, Līgumu Dzinējam JĀĢENERĒ divformātu Rikārdiāna Līgums, kas satur gan cilvēklasāmu juridisko tekstu, gan mašīnlasāmu JSON ar atbilstošiem nosacījumiem
2. KAD Rikārdiāna Līgums ir ģenerēts, Līgumu Dzinējam JĀAPRĒĶINA SHA-256 Līguma Hešs no cilvēklasāmā teksta un JĀSAGLABĀ hešs kopā ar līguma saturu
3. Līgumu Dzinējam JĀSAGLABĀ cilvēklasāmais līguma teksts IPFS un JĀSAGLABĀ IPFS satura identifikators (CID) Supabase datubāzē kopā ar Līguma Hešu un mašīnlasāmo JSON
4. KAD Rikārdiāna Līgums tiek izveidots, Līgumu Dzinējam JĀPIEŠĶIR unikāls līguma ID formātā `amber-GGGG-NNNN` un JĀIESTATA sākotnējais statuss uz `draft` (melnraksts)
5. Līgumu Dzinējam JĀNODROŠINA, ka katrs Rikārdiāna Līgums satur Pilnvardevēja Deklarācijas lauku, kas norāda cilvēku vai uzņēmumu aiz aģenta kā līgumslēdzēju pusi
6. KAD līguma izveides pieprasījums izlaiž Pilnvardevēja Deklarāciju, Līgumu Dzinējam JĀNORAIDA pieprasījums ar aprakstošu kļūdu, norādot, ka pilnvardevējs ir jādeklarē
7. Līgumu Dzinējam JĀATBALSTA divi līgumu veidi: Deleģēšanas Līgums (aģenta pilnvarošana ar noteiktiem ierobežojumiem) un Komercijas Līgums (aģenta izpildīts pirkums vai pakalpojumu līgums)
8. VISIEM derīgiem Rikārdiāna Līgumiem, ģenerējot līgumu un pēc tam aprēķinot saglabātā cilvēklasāmā teksta hešu, JĀIEGŪST hešs, kas ir identisks sākotnēji saglabātajam Līguma Hešam (aprites integritātes īpašība)

### 2. prasība: Līgumu Dzinējs — Dzīves Cikla Pārvaldība

**Lietotāja Stāsts:** Kā uzņēmuma auditors, es vēlos izsekot pilnu katra līguma dzīves ciklu no melnraksta līdz izbeigšanai, lai varētu uzturēt pārraudzību pār visiem aģentu izpildītajiem līgumiem.

#### Pieņemšanas Kritēriji

1. Līgumu Dzinējam JĀIZSEKO katrs līgums caur šādu statusu dzīves ciklu: `draft` (melnraksts) → `pending_signature` (gaida parakstu) → `active` (aktīvs) → `fulfilled` (izpildīts) vai `disputed` (apstrīdēts) vai `terminated` (izbeigts)
2. KAD līgums pāriet no viena statusa uz citu, Līgumu Dzinējam JĀREĢISTRĒ pāreja ar laika zīmogu, aktoru (maka adrese vai lietotāja ID) un iemeslu nemainīgā audita žurnālā
3. KAD aktīvs līgums tiek grozīts, Līgumu Dzinējam JĀIZVEIDO jauns Rikārdiāna Līgums, kas atsaucas uz oriģinālu caur `parent_contract_hash`, veidojot Grozījumu Ķēdi
4. Līgumu Dzinējam JĀNOVĒRŠ statusu pārejas, kas pārkāpj dzīves cikla kārtību (izpildīts līgums nevar atgriezties uz aktīvu, melnraksts nevar pārlēkt uz izpildītu)
5. KAD tiek vaicāts līguma statuss, Līgumu Dzinējam JĀATGRIEŽ pašreizējais statuss, pilna Grozījumu Ķēde (visi vecāku un bērnu līgumi) un pilns audita žurnāls
6. Līgumu Dzinējam JĀATBALSTA līgumu meklēšana un filtrēšana pēc līguma veida, statusa, aģenta maka adreses, pilnvardevēja vārda, datumu diapazona un atslēgvārdiem līguma tekstā

### 3. prasība: Līgumu Dzinējs — Digitālais Paraksts

**Lietotāja Stāsts:** Kā AI aģents, es vēlos digitāli parakstīt Rikārdiāna Līgumu, izmantojot sava maka privāto atslēgu, lai kriptogrāfiski apņemtos ievērot līguma nosacījumus.

#### Pieņemšanas Kritēriji

1. KAD aģents iesniedz parakstīšanas pieprasījumu ar līguma ID un kriptogrāfisku parakstu (ECDSA pār Līguma Hešu), Līgumu Dzinējam JĀVERIFICĒ paraksts pret aģenta maka adresi
2. JA paraksta verifikācija neizdodas, TAD Līgumu Dzinējam JĀNORAIDA parakstīšanas pieprasījums ar aprakstošu kļūdu
3. KAD visas nepieciešamās puses ir parakstījušas līgumu, Līgumu Dzinējam JĀPĀRSLĒDZ līguma statuss no `pending_signature` uz `active`
4. Līgumu Dzinējam JĀSAGLABĀ katrs paraksts ar parakstītāja maka adresi, laika zīmogu un parakstīto Līguma Hešu
5. KAD Deleģēšanas Līgumam nepieciešams tikai pilnvardevēja paraksts, Līgumu Dzinējam JĀPĀRSLĒDZ uz `active` pēc pilnvardevēja parakstīšanas
6. KAD Komercijas Līgumam nepieciešami abu pušu paraksti (aģents-kā-pārstāvis un darījumu partneris), Līgumu Dzinējam JĀPĀRSLĒDZ uz `active` tikai pēc abu parakstu reģistrēšanas


## Prasības

### 1. prasība: Līgumu Dzinējs — Izveide un Hešošana

**Lietotāja Stāsts:** Kā aģentu izstrādātājs, es vēlos programmatiski izveidot Rikārdiāna līgumus no veidnēm vai pielāgotiem nosacījumiem, lai mans AI aģents varētu noslēgt juridiski saistošus, divformātu līgumus.

#### Pieņemšanas Kritēriji

1. KAD tiek iesniegts derīgs līguma izveides pieprasījums ar veidnes ID un parametriem, Līgumu Dzinējam JĀĢENERĒ divformātu Rikārdiāna Līgums, kas satur gan cilvēklasāmu juridisko tekstu, gan mašīnlasāmu JSON ar atbilstošiem nosacījumiem
2. KAD Rikārdiāna Līgums ir ģenerēts, Līgumu Dzinējam JĀAPRĒĶINA SHA-256 Līguma Hešs no cilvēklasāmā teksta un JĀSAGLABĀ hešs kopā ar līguma saturu
3. Līgumu Dzinējam JĀSAGLABĀ cilvēklasāmais līguma teksts IPFS un JĀSAGLABĀ IPFS satura identifikators (CID) Supabase datubāzē kopā ar Līguma Hešu un mašīnlasāmo JSON
4. KAD Rikārdiāna Līgums tiek izveidots, Līgumu Dzinējam JĀPIEŠĶIR unikāls līguma ID formātā `amber-GGGG-NNNN` un JĀIESTATA sākotnējais statuss uz `draft` (melnraksts)
5. Līgumu Dzinējam JĀNODROŠINA, ka katrs Rikārdiāna Līgums satur Pilnvardevēja Deklarācijas lauku, kas norāda cilvēku vai uzņēmumu aiz aģenta kā līgumslēdzēju pusi
6. KAD līguma izveides pieprasījums izlaiž Pilnvardevēja Deklarāciju, Līgumu Dzinējam JĀNORAIDA pieprasījums ar aprakstošu kļūdu, norādot, ka pilnvardevējs ir jādeklarē
7. Līgumu Dzinējam JĀATBALSTA divi līgumu veidi: Deleģēšanas Līgums (aģenta pilnvarošana ar noteiktiem ierobežojumiem) un Komercijas Līgums (aģenta izpildīts pirkums vai pakalpojumu līgums)
8. VISIEM derīgiem Rikārdiāna Līgumiem, ģenerējot līgumu un pēc tam aprēķinot saglabātā cilvēklasāmā teksta hešu, JĀIEGŪST hešs, kas ir identisks sākotnēji saglabātajam Līguma Hešam (aprites integritātes īpašība)

### 2. prasība: Līgumu Dzinējs — Dzīves Cikla Pārvaldība

**Lietotāja Stāsts:** Kā uzņēmuma auditors, es vēlos izsekot pilnu katra līguma dzīves ciklu no melnraksta līdz izbeigšanai, lai varētu uzturēt pārraudzību pār visiem aģentu izpildītajiem līgumiem.

#### Pieņemšanas Kritēriji

1. Līgumu Dzinējam JĀIZSEKO katrs līgums caur šādu statusu dzīves ciklu: `draft` (melnraksts) → `pending_signature` (gaida parakstu) → `active` (aktīvs) → `fulfilled` (izpildīts) vai `disputed` (apstrīdēts) vai `terminated` (izbeigts)
2. KAD līgums pāriet no viena statusa uz citu, Līgumu Dzinējam JĀREĢISTRĒ pāreja ar laika zīmogu, aktoru (maka adrese vai lietotāja ID) un iemeslu nemainīgā audita žurnālā
3. KAD līgums `active` statusā tiek grozīts, Līgumu Dzinējam JĀIZVEIDO jauns Rikārdiāna Līgums, kas atsaucas uz oriģinālu caur `parent_contract_hash`, veidojot Grozījumu Ķēdi
4. Līgumu Dzinējam JĀNOVĒRŠ statusu pārejas, kas pārkāpj dzīves cikla kārtību (`fulfilled` līgums nevar atgriezties uz `active`, `draft` nevar pārlēkt uz `fulfilled`)
5. KAD tiek vaicāts līguma statuss, Līgumu Dzinējam JĀATGRIEŽ pašreizējais statuss, pilna Grozījumu Ķēde (visi vecāku un bērnu līgumi) un pilns audita žurnāls
6. Līgumu Dzinējam JĀATBALSTA līgumu meklēšana un filtrēšana pēc līguma veida, statusa, aģenta maka adreses, pilnvardevēja vārda, datumu diapazona un atslēgvārdiem līguma tekstā

### 3. prasība: Līgumu Dzinējs — Digitālais Paraksts

**Lietotāja Stāsts:** Kā AI aģents, es vēlos digitāli parakstīt Rikārdiāna Līgumu, izmantojot sava maka privāto atslēgu, lai kriptogrāfiski apņemtos ievērot līguma nosacījumus.

#### Pieņemšanas Kritēriji

1. KAD aģents iesniedz parakstīšanas pieprasījumu ar līguma ID un kriptogrāfisku parakstu (ECDSA pār Līguma Hešu), Līgumu Dzinējam JĀVERIFICĒ paraksts pret aģenta maka adresi
2. JA paraksta verifikācija neizdodas, TAD Līgumu Dzinējam JĀNORAIDA parakstīšanas pieprasījums ar aprakstošu kļūdu
3. KAD visas nepieciešamās puses ir parakstījušas līgumu, Līgumu Dzinējam JĀPĀRSLĒDZ līguma statuss no `pending_signature` uz `active`
4. Līgumu Dzinējam JĀSAGLABĀ katrs paraksts ar parakstītāja maka adresi, laika zīmogu un parakstīto Līguma Hešu
5. KAD Deleģēšanas Līgumam nepieciešams tikai pilnvardevēja paraksts, Līgumu Dzinējam JĀPĀRSLĒDZ uz `active` pēc pilnvardevēja parakstīšanas
6. KAD Komercijas Līgumam nepieciešami abu pušu paraksti (aģents-kā-pārstāvis un darījumu partneris), Līgumu Dzinējam JĀPĀRSLĒDZ uz `active` tikai pēc abu parakstu reģistrēšanas


### 4. prasība: Veidņu Sistēma

**Lietotāja Stāsts:** Kā aģentu izstrādātājs, es vēlos pārlūkot un izmantot iepriekš pārbaudītas līgumu veidnes ar pielāgojamiem parametriem, lai varētu izveidot juridiski pamatotus līgumus bez juridiskā teksta rakstīšanas no nulles.

#### Pieņemšanas Kritēriji

1. Veidņu Sistēmai JĀNODROŠINA parametrizētu Rikārdiāna Līgumu veidņu bibliotēka, kas kategorizēta pēc veida: Deleģēšanas Līgumu veidnes (aģenta pilnvarošana, tēriņu limiti, darbību apjomi) un Komercijas Līgumu veidnes (API piekļuve, skaitļošanas pakalpojumi, datu apstrāde, iepirkumi, SaaS līgumi)
2. KAD veidne tiek iegūta, Veidņu Sistēmai JĀATGRIEŽ veidnes nosaukums, apraksts, kategorija, parametru shēma (JSON Schema formātā), cilvēklasāms veidnes teksts ar parametru vietturiem un versijas numurs
3. KAD līgums tiek izveidots no veidnes ar derīgiem parametriem, Veidņu Sistēmai JĀAIZVIETO visi parametru vietturi gan cilvēklasāmajā tekstā, gan mašīnlasāmajā JSON, izveidojot pilnīgu Rikārdiāna Līgumu
4. JA līguma izveides pieprasījums nodrošina parametrus, kas neatbilst veidnes JSON Shēmai, TAD Veidņu Sistēmai JĀNORAIDA pieprasījums ar aprakstošu validācijas kļūdu, uzskaitot visus neatbilstošos laukus
5. Veidņu Sistēmai JĀNODROŠINA, ka katra veidne ietver Pilnvardevēja Deklarācijas parametru, Piemērojamo Tiesību klauzulu un strīdu risināšanas klauzulu, kas atsaucas uz ADP
6. Veidņu Sistēmai JĀATBALSTA veidņu versiju pārvaldība, lai līgumi atsauktos uz konkrēto veidnes versiju, kas izmantota izveides brīdī
7. KAD veidne tiek atjaunināta uz jaunu versiju, Veidņu Sistēmai JĀSAGLABĀ visas iepriekšējās versijas un esošajiem līgumiem JĀTURPINA atsaukties uz savu sākotnējo veidnes versiju

### 5. prasība: LLM Līgumu Ģenerēšana

**Lietotāja Stāsts:** Kā uzņēmums, kas izvieto AI aģentus, es vēlos aprakstīt deleģēšanas vai komercijas scenāriju dabiskajā valodā un saņemt pareizi formatētu divformātu Rikārdiāna Līgumu, lai varētu izveidot līgumus bez veidņu parametru izpratnes.

#### Pieņemšanas Kritēriji

1. KAD tiek iesniegts dabiskās valodas apraksts par deleģēšanas vai komercijas scenāriju, LLM Ģeneratoram JĀIZVEIDO divformātu Rikārdiāna Līgums, kas satur cilvēklasāmu juridisko tekstu un mašīnlasāmu JSON ar konsekventiem nosacījumiem abos formātos
2. LLM Ģeneratoram JĀIZVELK un JĀAIZPILDA Pilnvardevēja Deklarācija, aģenta maka adrese, pilnvarotās darbības, tēriņu limiti, atbildības nosacījumi un strīdu risināšanas klauzula no dabiskās valodas ievades
3. JA dabiskās valodas ievade ir neskaidra vai tai trūkst obligāto lauku (pilnvardevējs, aģents, apjoms), TAD LLM Ģeneratoram JĀATGRIEŽ strukturēts pieprasījums pēc trūkstošās informācijas, nevis JĀĢENERĒ nepilnīgs līgums
4. KAD LLM Ģenerators ir ģenerējis Rikārdiāna Līgumu, Līgumu Dzinējam TAS JĀVALIDĒ pret tām pašām shēmas noteikumiem kā veidņu ģenerētiem līgumiem pirms pieņemšanas
5. LLM Ģeneratoram JĀIZVĒLAS vispiemērotākā veidne kā pamats un JĀAIZPILDA tā ar iegūtajiem parametriem, nevis JĀĢENERĒ līguma teksts pilnībā no nulles
6. VISIEM LLM Ģeneratora ģenerētajiem līgumiem mašīnlasāmā JSON nosacījumiem JĀBŪT semantiski ekvivalentiem cilvēklasāmajam juridiskajam tekstam (bez pretrunām starp formātiem)

### 6. prasība: cNFT Kalšana

**Lietotāja Stāsts:** Kā uzņēmums, kas izvieto AI aģentus, es vēlos, lai katrs izpildītais līgums tiktu kalts kā NFT uz Base L2, lai man būtu nemainīgs, blokķēdē balstīts pierādījums par to, par ko tika panākta vienošanās.

#### Pieņemšanas Kritēriji

1. KAD Rikārdiāna Līgums pāriet uz `active` statusu, Platformai JĀKALST cNFT uz Base_L2 ar metadatiem, kas satur: `contract_hash` (SHA-256), `human_readable_url` (IPFS saite uz pilnu juridisko tekstu), `machine_parsable_terms` (atslēga-vērtība pāri no JSON), `contract_type` (deleģēšana vai komercija), `principal` (maka adrese) un `agent` (maka adrese)
2. Platformai JĀSAGLABĀ cNFT metadatu JSON uz IPFS un JĀIESTATA NFT `tokenURI` uz šo metadatu IPFS CID
3. KAD cNFT ir kalts, Platformai JĀREĢISTRĒ NFT tokena ID, transakcijas hešs un bloka numurs Supabase datubāzē, sasaistot ar līguma ierakstu
4. KAD tiek izveidots grozījums esošam līgumam, Platformai JĀKALST jauns cNFT ar `parent_contract_hash` lauku, kas atsaucas uz oriģinālo cNFT, veidojot blokķēdes Grozījumu Ķēdi
5. Platformai JĀIZVIETO Solidity viedais līgums uz Base_L2, kas implementē ERC-721 standartu cNFT kalšanai, ar kalšanas funkciju, kas ierobežota uz Platformas autorizēto kalšanas adresi
6. cNFT viedajam līgumam JĀSAGLABĀ Līguma Hešs blokķēdē tokena metadatos neatkarīgai verifikācijai bez paļaušanās uz IPFS pieejamību
7. KAD kalšana neizdodas blokķēdes kļūdas dēļ, Platformai JĀMĒĢINA kalšanas operācija atkārtoti līdz trīs reizēm ar eksponenciālu aizkavi un JĀREĢISTRĒ kļūme audita žurnālā, ja visi mēģinājumi ir izsmelti

### 4. prasība: Veidņu Sistēma

**Lietotāja Stāsts:** Kā aģentu izstrādātājs, es vēlos pārlūkot un izmantot iepriekš pārbaudītas līgumu veidnes ar pielāgojamiem parametriem, lai varētu izveidot juridiski pamatotus līgumus bez juridiskā teksta rakstīšanas no nulles.

#### Pieņemšanas Kritēriji

1. Veidņu Sistēmai JĀNODROŠINA parametrizētu Rikārdiāna Līgumu veidņu bibliotēka, kas kategorizēta pēc veida: Deleģēšanas Līgumu veidnes (aģenta pilnvarošana, tēriņu limiti, darbību apjomi) un Komercijas Līgumu veidnes (API piekļuve, skaitļošanas pakalpojumi, datu apstrāde, iepirkumi, SaaS līgumi)
2. KAD veidne tiek iegūta, Veidņu Sistēmai JĀATGRIEŽ veidnes nosaukums, apraksts, kategorija, parametru shēma (JSON Schema formātā), cilvēklasāms veidnes teksts ar parametru vietturiem un versijas numurs
3. KAD līgums tiek izveidots no veidnes ar derīgiem parametriem, Veidņu Sistēmai JĀAIZVIETO visi parametru vietturi gan cilvēklasāmajā tekstā, gan mašīnlasāmajā JSON, izveidojot pilnīgu Rikārdiāna Līgumu
4. JA līguma izveides pieprasījums nodrošina parametrus, kas neatbilst veidnes JSON Shēmai, TAD Veidņu Sistēmai JĀNORAIDA pieprasījums ar aprakstošu validācijas kļūdu, uzskaitot visus neatbilstošos laukus
5. Veidņu Sistēmai JĀNODROŠINA, ka katra veidne ietver Pilnvardevēja Deklarācijas parametru, Piemērojamo Tiesību klauzulu un strīdu risināšanas klauzulu, kas atsaucas uz ADP
6. Veidņu Sistēmai JĀATBALSTA veidņu versiju pārvaldība, lai līgumi atsauktos uz konkrēto veidnes versiju, kas izmantota izveides brīdī
7. KAD veidne tiek atjaunināta uz jaunu versiju, Veidņu Sistēmai JĀSAGLABĀ visas iepriekšējās versijas un esošie līgumi TURPINA atsaukties uz savu sākotnējo veidnes versiju

### 5. prasība: LLM Līgumu Ģenerēšana

**Lietotāja Stāsts:** Kā uzņēmums, kas izvieto AI aģentus, es vēlos aprakstīt deleģēšanas vai komercijas scenāriju dabiskajā valodā un saņemt pareizi formatētu divformātu Rikārdiāna Līgumu, lai varētu izveidot līgumus bez veidņu parametru izpratnes.

#### Pieņemšanas Kritēriji

1. KAD tiek iesniegts dabiskās valodas apraksts par deleģēšanas vai komercijas scenāriju, LLM Ģeneratoram JĀIZVEIDO divformātu Rikārdiāna Līgums ar cilvēklasāmu juridisko tekstu un mašīnlasāmu JSON ar konsekventiem nosacījumiem abos formātos
2. LLM Ģeneratoram JĀIZVELK un JĀAIZPILDA Pilnvardevēja Deklarācija, aģenta maka adrese, pilnvarotās darbības, tēriņu limiti, atbildības nosacījumi un strīdu risināšanas klauzula no dabiskās valodas ievades
3. JA dabiskās valodas ievade ir neskaidra vai tai trūkst obligāto lauku (pilnvardevējs, aģents, apjoms), TAD LLM Ģeneratoram JĀATGRIEŽ strukturēts pieprasījums pēc trūkstošās informācijas, nevis JĀĢENERĒ nepilnīgs līgums
4. KAD Rikārdiāna Līgums ir ģenerēts ar LLM Ģeneratoru, Līgumu Dzinējam TAS JĀVALIDĒ pret tām pašām shēmas noteikumiem kā veidņu ģenerētiem līgumiem pirms pieņemšanas
5. LLM Ģeneratoram JĀIZVĒLAS vispiemērotākā veidne kā pamats un JĀAIZPILDA tā ar iegūtajiem parametriem, nevis JĀĢENERĒ līguma teksts pilnībā no nulles
6. VISIEM LLM Ģeneratora ģenerētajiem līgumiem mašīnlasāmā JSON nosacījumiem JĀBŪT semantiski ekvivalentiem cilvēklasāmajam juridiskajam tekstam (bez pretrunām starp formātiem)


### 7. prasība: Lasītāja Portāls

**Lietotāja Stāsts:** Kā atbilstības speciālists, es vēlos publisku tīmekļa portālu, kurā varu atrast jebkuru līgumu pēc heša vai NFT ID, verificēt tā integritāti un eksportēt to juridiskajiem arhīviem, lai varētu auditēt visus aģentu izpildītos līgumus.

#### Pieņemšanas Kritēriji

1. KAD Apmeklētājs ievada Līguma Hešu vai cNFT tokena ID Lasītāja Portāla meklēšanā, Lasītāja Portālam JĀIEGŪST un JĀPARĀDA pilns cilvēklasāmais līguma teksts tīrā, profesionālā izkārtojumā
2. KAD līgums tiek parādīts, Lasītāja Portālam JĀVERIFICĒ blokķēdes Līguma Hešs pret parādītā teksta SHA-256 hešu un JĀPARĀDA verifikācijas žetons (verificēts vai manipulēts) Apmeklētājam
3. KAD līgumam ir Grozījumu Ķēde, Lasītāja Portālam JĀPARĀDA oriģinālais līgums kopā ar visiem grozījumiem un papildinājumiem hronoloģiskā secībā, katrs sasaistīts caur `parent_contract_hash`
4. KAD Apmeklētājs pieprasa PDF eksportu, Lasītāja Portālam JĀĢENERĒ drukājams PDF ar līgumu, iekļaujot Līguma Hešu, verifikācijas statusu, parakstītāju puses, laika zīmogus un Grozījumu Ķēdi
5. Lasītāja Portālam JĀPARĀDA mašīnlasāmais JSON blakus cilvēklasāmajam tekstam dalītā skata izkārtojumā
6. Lasītāja Portālam JĀPARĀDA Pilnvardevēja Deklarācija izceltā veidā, parādot, kurš cilvēks vai uzņēmums pilnvaroja aģentu
7. KAD līguma cNFT eksistē uz Base_L2, Lasītāja Portālam JĀPARĀDA NFT tokena ID, kalšanas transakcijas hešs un saite uz bloku pārlūku
8. Lasītāja Portālam JĀBŪT publiski pieejamam bez autentifikācijas apskatei un verifikācijai, bet JĀPIEPRASA autentifikācija masveida eksportam vai API līmeņa piekļuvei
9. Lasītāja Portāls JĀBŪVĒ kā maršruts esošajā Next.js App Router vietnē `projects/Amber_protocol/site/`

### 8. prasība: Aģentu API

**Lietotāja Stāsts:** Kā AI aģents, es vēlos RESTful API, lai programmatiski izveidotu, parakstītu, vaicātu un pārvaldītu līgumus, lai varētu autonomi noslēgt un pārvaldīt līgumus.

#### Pieņemšanas Kritēriji

1. Aģentu API JĀATKLĀJ šādi galapunkti: `POST /api/v1/contracts` (izveidot līgumu), `POST /api/v1/contracts/{id}/sign` (parakstīt līgumu), `GET /api/v1/contracts/{id}` (iegūt līguma detaļas), `GET /api/v1/contracts/{id}/status` (iegūt statusu), `GET /api/v1/contracts` (uzskaitīt līgumus ar filtrēšanu), `POST /api/v1/contracts/{id}/amend` (izveidot grozījumu) un `GET /api/v1/templates` (uzskaitīt pieejamās veidnes)
2. Aģentu API JĀAUTENTIFICĒ pieprasījumi, izmantojot vai nu API atslēgu (caur `X-API-KEY` galveni) vai maka parakstu (caur `X-Wallet-Signature` galveni)
3. KAD tiek saņemts autentificēts pieprasījums, Aģentu API JĀVERIFICĒ, ka pieprasošajam aģentam ir pilnvarojums veikt pieprasīto operāciju ar norādīto līgumu
4. Aģentu API JĀATGRIEŽ atbildes JSON formātā ar konsekventiem kļūdu kodiem: 400 (nederīgs pieprasījums), 401 (neautorizēts), 403 (aizliegts), 404 (līgums nav atrasts), 409 (nederīga statusa pāreja) un 500 (iekšēja kļūda)
5. Aģentu API JĀIETVER ātruma ierobežošana — 100 pieprasījumi minūtē uz vienu API atslēgu, lai novērstu ļaunprātīgu izmantošanu
6. KAD līguma izveides pieprasījums tiek saņemts caur Aģentu API, Aģentu API JĀDELEĢĒ Līgumu Dzinējam un JĀATGRIEŽ līguma ID, Līguma Hešs un pašreizējais statuss
7. Aģentu API JĀATBALSTA lappušošana sarakstu galapunktiem ar `limit` un `offset` vaicājumu parametriem, noklusēti 20 rezultāti lapā

### 9. prasība: Dinamiskā API Atslēgu Kartēšana

**Lietotāja Stāsts:** Kā AI aģents, es vēlos saņemt API atslēgu pēc līguma parakstīšanas ar savu maku, lai varētu piekļūt platformas Web2 API bez maka parakstu atkārtošanas katrā pieprasījumā.

#### Pieņemšanas Kritēriji

1. KAD aģents paraksta Rikārdiāna Līgumu ar derīgu maka parakstu, Platformai JĀĢENERĒ unikāla API atslēga un JĀATGRIEŽ tā parakstīšanas atbildē
2. Platformai JĀUZTUR iekšēja kartēšana API_KEY → cNFT_ID → Wallet_Address Supabase datubāzē
3. KAD API pieprasījums ietver `X-API-KEY` galveni, Platformai JĀATRISINA API atslēga uz saistīto maka adresi un cNFT ID pirms pieprasījuma apstrādes
4. JA API atslēgas saistītais cNFT ir atsaukts vai līgums ir izbeigts, TAD Platformai JĀNORAIDA pieprasījumi ar šo API atslēgu ar 401 statusa kodu
5. KAD aģents pieprasa jaunu API atslēgu (atslēgas rotācija), Platformai JĀANULĒ iepriekšējā atslēga un JĀIZSNIEDZ jauna, kas kartēta uz to pašu maka adresi un cNFT
6. Platformai JĀIESTATA API atslēgas derīguma termiņš uz 90 dienām pēc noklusējuma, pieprasot aģentam atkārtoti autentificēties caur maka parakstu, lai iegūtu jaunu atslēgu

### 6. prasība: cNFT Kalšana

**Lietotāja Stāsts:** Kā uzņēmums, kas izvieto AI aģentus, es vēlos, lai katrs izpildītais līgums tiktu kalts kā NFT uz Base L2, lai man būtu nemainīgs, blokķēdē balstīts pierādījums par to, par ko tika vienots.

#### Pieņemšanas Kritēriji

1. KAD Rikārdiāna Līgums pāriet uz `active` statusu, Platformai JĀKALA cNFT uz Base_L2 ar metadatiem, kas satur: `contract_hash` (SHA-256), `human_readable_url` (IPFS saite uz pilnu juridisko tekstu), `machine_parsable_terms` (atslēga-vērtība pāri no JSON), `contract_type` (deleģēšana vai komercija), `principal` (maka adrese) un `agent` (maka adrese)
2. Platformai JĀSAGLABĀ cNFT metadatu JSON uz IPFS un JĀIESTATA NFT `tokenURI` uz šo metadatu IPFS CID
3. KAD cNFT tiek kalts, Platformai JĀREĢISTRĒ NFT tokena ID, transakcijas hešs un bloka numurs Supabase datubāzē, sasaistot ar līguma ierakstu
4. KAD tiek izveidots grozījums esošam līgumam, Platformai JĀKALA jauns cNFT ar `parent_contract_hash` lauku, kas atsaucas uz oriģinālo cNFT, veidojot blokķēdes Grozījumu Ķēdi
5. Platformai JĀIZVIETO Solidity viedais līgums uz Base_L2, kas implementē ERC-721 standartu cNFT kalšanai, ar kalšanas funkciju, kas ierobežota uz Platformas autorizēto kalšanas adresi
6. cNFT viedajam līgumam JĀSAGLABĀ Līguma Hešs blokķēdē tokena metadatos neatkarīgai verifikācijai bez paļaušanās uz IPFS pieejamību
7. KAD kalšana neizdodas blokķēdes kļūdas dēļ, Platformai JĀMĒĢINA kalšanas operācija atkārtoti līdz trīs reizēm ar eksponenciālu aizkavi un JĀREĢISTRĒ kļūme audita žurnālā, ja visi mēģinājumi ir izsmelti

### 7. prasība: Lasītāja Portāls

**Lietotāja Stāsts:** Kā atbilstības speciālists, es vēlos publisku tīmekļa portālu, kurā varu atrast jebkuru līgumu pēc heša vai NFT ID, verificēt tā integritāti un eksportēt to juridiskajiem arhīviem, lai varētu auditēt visus aģentu izpildītos līgumus.

#### Pieņemšanas Kritēriji

1. KAD Apmeklētājs ievada Līguma Hešu vai cNFT tokena ID Lasītāja Portāla meklēšanā, Lasītāja Portālam JĀIEGŪST un JĀPARĀDA pilns cilvēklasāmais līguma teksts tīrā, profesionālā izkārtojumā
2. KAD līgums tiek parādīts, Lasītāja Portālam JĀVERIFICĒ blokķēdes Līguma Hešs pret parādītā teksta SHA-256 hešu un JĀPARĀDA verifikācijas žetons (verificēts vai manipulēts) Apmeklētājam
3. KAD līgumam ir Grozījumu Ķēde, Lasītāja Portālam JĀPARĀDA oriģinālais līgums kopā ar visiem grozījumiem un papildinājumiem hronoloģiskā secībā, katrs sasaistīts caur `parent_contract_hash`
4. KAD Apmeklētājs pieprasa PDF eksportu, Lasītāja Portālam JĀĢENERĒ drukājams PDF ar līgumu, iekļaujot Līguma Hešu, verifikācijas statusu, parakstītāju puses, laika zīmogus un Grozījumu Ķēdi
5. Lasītāja Portālam JĀPARĀDA mašīnlasāmais JSON blakus cilvēklasāmajam tekstam dalītā skata izkārtojumā
6. Lasītāja Portālam JĀPARĀDA Pilnvardevēja Deklarācija izcelti, parādot, kurš cilvēks vai uzņēmums pilnvaroja aģentu
7. KAD līguma cNFT eksistē uz Base_L2, Lasītāja Portālam JĀPARĀDA NFT tokena ID, kalšanas transakcijas hešs un saite uz bloku pārlūku
8. Lasītāja Portālam JĀBŪT publiski pieejamam bez autentifikācijas apskatei un verifikācijai, bet JĀPIEPRASA autentifikācija masveida eksportam vai API līmeņa piekļuvei
9. Lasītāja Portāls JĀBŪVĒ kā maršruts esošajā Next.js App Router vietnē `projects/Amber_protocol/site/`


### 10. prasība: x402 V2 Paplašinājums

**Lietotāja Stāsts:** Kā pakalpojumu sniedzējs, kas izmanto x402 maksājumiem, es vēlos, lai līgumu heši tiktu iegulti x402 maksājumu metadatos, lai katrs maksājums būtu sasaistīts ar tā regulējošo juridisko līgumu.

#### Pieņemšanas Kritēriji

1. KAD Komercijas Līgums ir aktīvs un maksājums tiek iniciēts, Platformai JĀIEGULST Līguma Hešs x402 V2 maksājumu metadatos kā pielāgots lauks
2. Platformai JĀIMPLEMENTĒ x402 V2 spraudnis, kas nolasa līgumu hešus no ienākošajiem x402 maksājumu pieprasījumiem un atrisina tos uz atbilstošo Rikārdiāna Līgumu
3. KAD x402 maksājums tiek saņemts ar Līguma Hešu tā metadatos, Platformai JĀVERIFICĒ, ka maksājuma summa un nosacījumi atbilst atsauces līguma mašīnlasāmajiem nosacījumiem
4. JA maksājuma nosacījumi neatbilst līguma nosacījumiem, TAD Platformai JĀNORAIDA maksājums ar aprakstošu kļūdu, kas atsaucas uz līguma neatbilstību
5. Platformai JĀATBALSTA x402 V2 maka sesijas (CAIP-122), lai aģenti varētu veikt vairākus maksājumus viena līguma ietvaros bez atkārtotas autentifikācijas katrā transakcijā
6. Platformai JĀREĢISTRĒ visi x402 maksājumu notikumi (iniciēti, apstiprināti, neizdevušies) līguma audita žurnālā ar transakciju hešiem un laika zīmogiem

### 11. prasība: ERC-8004 Integrācija

**Lietotāja Stāsts:** Kā pakalpojumu sniedzējs, es vēlos, lai platforma verificētu aģenta blokķēdes identitāti un reputāciju pirms ļauj tam parakstīt augstvērtīgus līgumus, lai es būtu aizsargāts pret ļaunprātīgiem dalībniekiem.

#### Pieņemšanas Kritēriji

1. KAD aģents iniciē līguma parakstīšanu, Platformai JĀVAICĀ ERC-8004 Identitātes Reģistrs, lai verificētu, ka aģenta maka adrese ir reģistrēta
2. KAD līguma vērtība pārsniedz konfigurējamu slieksni, Platformai JĀVAICĀ ERC-8004 Reputācijas Reģistrs un JĀIEGŪST aģenta reputācijas rādītājs pirms parakstīšanas atļaušanas
3. JA aģenta reputācijas rādītājs ir zem konfigurējama minimālā sliekšņa, TAD Platformai JĀBLOĶĒ parakstīšana un JĀATGRIEŽ kļūda, norādot nepietiekamu reputāciju
4. KAD līgums ir veiksmīgi izpildīts, Platformai JĀIESNIEDZ pozitīvs reputācijas ieraksts ERC-8004 Reputācijas Reģistrā darījumu partnera vārdā (ja pilnvarots)
5. Platformai JĀKEŠO ERC-8004 reģistru vaicājumi uz konfigurējamu laiku (noklusēti 5 minūtes), lai samazinātu blokķēdes vaicājumu izmaksas
6. KAD ERC-8004 reģistrs nav sasniedzams, Platformai JĀATĻAUJ līguma parakstīšana līgumiem zem augstvērtīgā sliekšņa un JĀIERINDO reputācijas pārbaudes atkārtotam mēģinājumam

### 12. prasība: MCP Serveris

**Lietotāja Stāsts:** Kā AI aģents, kas izmanto Model Context Protocol, es vēlos atklāt Amber līgumu iespējas un parakstīt līgumus caur MCP rīku izsaukumiem, lai varētu integrēt Amber savā darbplūsmā bez pielāgotas API integrācijas.

#### Pieņemšanas Kritēriji

1. Platformai JĀATKLĀJ MCP Serveris, kas implementē Model Context Protocol specifikāciju ar rīkiem: pieejamo veidņu uzskaitīšana, līgumu izveide no veidnēm, līgumu parakstīšana, līguma statusa vaicāšana un pilnvarojuma verificēšana
2. KAD aģents atklāj MCP Serveri, MCP Serverim JĀATGRIEŽ rīku manifests, kas apraksta katru pieejamo rīku ar tā parametriem, atgriešanas tipiem un lietošanas aprakstiem
3. KAD aģents izsauc `create_contract` MCP rīku ar veidnes ID un parametriem, MCP Serverim JĀDELEĢĒ Līgumu Dzinējam un JĀATGRIEŽ līguma ID un Līguma Hešs
4. KAD aģents izsauc `sign_contract` MCP rīku ar līguma ID un maka parakstu, MCP Serverim JĀDELEĢĒ Līgumu Dzinējam paraksta verifikācijai un statusa pārejai
5. MCP Serverim JĀAUTENTIFICĒ aģenti caur maka parakstu, kas iekļauts MCP rīka izsaukuma kontekstā
6. MCP Serverim JĀATGRIEŽ strukturētas kļūdu atbildes, ievērojot MCP kļūdu konvencijas, kad operācijas neizdodas

### 13. prasība: A2A Aģenta Karte

**Lietotāja Stāsts:** Kā AI aģents, kas izmanto Google A2A protokolu, es vēlos atklāt Amber Protocol iespējas caur Aģenta Karti, lai varētu atrast un mijiedarboties ar platformu caur standarta aģentu atklāšanu.

#### Pieņemšanas Kritēriji

1. Platformai JĀPUBLICĒ A2A Aģenta Karte zināmā URL (`/.well-known/agent.json`), kas apraksta Amber Protocol iespējas: līgumu izveide, veidņu pārlūkošana, līgumu parakstīšana, statusa vaicāšana un pilnvarojuma verificēšana
2. A2A Aģenta Kartei JĀIETVER Platformas atbalstītie ievades/izvades formāti (JSON), autentifikācijas metodes (maka paraksts, API atslēga) un galapunktu URL
3. A2A Aģenta Kartei JĀUZSKAITA atbalstītie līgumu veidi (Deleģēšanas Līgums, Komercijas Līgums) un pieejamās veidņu kategorijas
4. KAD A2A Aģenta Karte tiek pieprasīta, Platformai JĀATGRIEŽ derīgs JSON dokuments, kas atbilst Google A2A Agent Card specifikācijai
5. A2A Aģenta Kartei JĀIETVER versijas informācija un saite uz pilnu API dokumentāciju

### 8. prasība: Aģentu API

**Lietotāja Stāsts:** Kā AI aģents, es vēlos RESTful API, lai programmatiski izveidotu, parakstītu, vaicātu un pārvaldītu līgumus, lai varētu autonomi noslēgt un pārvaldīt līgumus.

#### Pieņemšanas Kritēriji

1. Aģentu API JĀATKLĀJ šādi galapunkti: `POST /api/v1/contracts` (izveidot līgumu), `POST /api/v1/contracts/{id}/sign` (parakstīt līgumu), `GET /api/v1/contracts/{id}` (iegūt līguma detaļas), `GET /api/v1/contracts/{id}/status` (iegūt statusu), `GET /api/v1/contracts` (uzskaitīt līgumus ar filtrēšanu), `POST /api/v1/contracts/{id}/amend` (izveidot grozījumu) un `GET /api/v1/templates` (uzskaitīt pieejamās veidnes)
2. Aģentu API JĀAUTENTIFICĒ pieprasījumi, izmantojot vai nu API atslēgu (caur `X-API-KEY` galveni) vai maka parakstu (caur `X-Wallet-Signature` galveni)
3. KAD tiek saņemts autentificēts pieprasījums, Aģentu API JĀVERIFICĒ, ka pieprasošajam aģentam ir pilnvarojums veikt pieprasīto operāciju ar norādīto līgumu
4. Aģentu API JĀATGRIEŽ atbildes JSON formātā ar konsekventiem kļūdu kodiem: 400 (nederīgs pieprasījums), 401 (neautorizēts), 403 (aizliegts), 404 (līgums nav atrasts), 409 (nederīga statusa pāreja) un 500 (iekšēja kļūda)
5. Aģentu API JĀIETVER ātruma ierobežošana — 100 pieprasījumi minūtē uz vienu API atslēgu, lai novērstu ļaunprātīgu izmantošanu
6. KAD līguma izveides pieprasījums tiek saņemts caur Aģentu API, Aģentu API JĀDELEĢĒ Līgumu Dzinējam un JĀATGRIEŽ līguma ID, Līguma Hešs un pašreizējais statuss
7. Aģentu API JĀATBALSTA lappušošana sarakstu galapunktiem ar `limit` un `offset` vaicājumu parametriem, noklusējuma vērtība — 20 rezultāti lapā

### 9. prasība: Dinamiskā API Atslēgu Kartēšana

**Lietotāja Stāsts:** Kā AI aģents, es vēlos saņemt API atslēgu pēc līguma parakstīšanas ar savu maku, lai varētu piekļūt platformas Web2 API bez maka parakstu atkārtošanas katrā pieprasījumā.

#### Pieņemšanas Kritēriji

1. KAD aģents paraksta Rikārdiāna Līgumu ar derīgu maka parakstu, Platformai JĀĢENERĒ unikāla API atslēga un JĀATGRIEŽ tā parakstīšanas atbildē
2. Platformai JĀUZTUR iekšēja kartēšana API_KEY → cNFT_ID → Wallet_Address Supabase datubāzē
3. KAD API pieprasījums ietver `X-API-KEY` galveni, Platformai JĀATRISINA API atslēga uz saistīto maka adresi un cNFT ID pirms pieprasījuma apstrādes
4. JA API atslēgas saistītais cNFT ir atsaukts vai līgums ir izbeigts, TAD Platformai JĀNORAIDA pieprasījumi, kas izmanto šo API atslēgu, ar 401 statusa kodu
5. KAD aģents pieprasa jaunu API atslēgu (atslēgas rotācija), Platformai JĀANULĒ iepriekšējā atslēga un JĀIZSNIEDZ jauna, kas kartēta uz to pašu maka adresi un cNFT
6. Platformai JĀIESTATA API atslēgas derīguma termiņš uz 90 dienām pēc noklusējuma, pieprasot aģentam atkārtoti autentificēties caur maka parakstu, lai iegūtu jaunu atslēgu

### 10. prasība: x402 V2 Paplašinājums

**Lietotāja Stāsts:** Kā pakalpojumu sniedzējs, kas izmanto x402 maksājumiem, es vēlos, lai līgumu heši tiktu iegulti x402 maksājumu metadatos, lai katrs maksājums būtu saistīts ar tā regulējošo juridisko līgumu.

#### Pieņemšanas Kritēriji

1. KAD Komercijas Līgums ir aktīvs un maksājums tiek iniciēts, Platformai JĀIEGULST Līguma Hešs x402 V2 maksājumu metadatos kā pielāgots lauks
2. Platformai JĀIMPLEMENTĒ x402 V2 spraudnis, kas nolasa līgumu hešus no ienākošajiem x402 maksājumu pieprasījumiem un atrisina tos uz atbilstošo Rikārdiāna Līgumu
3. KAD x402 maksājums tiek saņemts ar Līguma Hešu tā metadatos, Platformai JĀVERIFICĒ, ka maksājuma summa un nosacījumi atbilst atsauces līguma mašīnlasāmajiem nosacījumiem
4. JA maksājuma nosacījumi neatbilst līguma nosacījumiem, TAD Platformai JĀNORAIDA maksājums ar aprakstošu kļūdu, kas atsaucas uz līguma neatbilstību
5. Platformai JĀATBALSTA x402 V2 maka sesijas (CAIP-122), lai aģenti varētu veikt vairākus maksājumus viena līguma ietvaros bez atkārtotas autentifikācijas katrā transakcijā
6. Platformai JĀREĢISTRĒ visi x402 maksājumu notikumi (iniciēti, apstiprināti, neizdevušies) līguma audita žurnālā ar transakciju hešiem un laika zīmogiem

### 11. prasība: ERC-8004 Integrācija

**Lietotāja Stāsts:** Kā pakalpojumu sniedzējs, es vēlos, lai platforma verificētu aģenta blokķēdes identitāti un reputāciju pirms ļauj tam parakstīt augstvērtīgus līgumus, lai es būtu aizsargāts no ļaunprātīgiem dalībniekiem.

#### Pieņemšanas Kritēriji

1. KAD aģents iniciē līguma parakstīšanu, Platformai JĀVAICĀ ERC-8004 Identitātes Reģistrs, lai verificētu, ka aģenta maka adrese ir reģistrēta
2. KAD līguma vērtība pārsniedz konfigurējamu slieksni, Platformai JĀVAICĀ ERC-8004 Reputācijas Reģistrs un JĀIEGŪST aģenta reputācijas rādītājs pirms parakstīšanas atļaušanas
3. JA aģenta reputācijas rādītājs ir zem konfigurējama minimālā sliekšņa, TAD Platformai JĀBLOĶĒ parakstīšana un JĀATGRIEŽ kļūda, norādot nepietiekamu reputāciju
4. KAD līgums ir veiksmīgi izpildīts, Platformai JĀIESNIEDZ pozitīvs reputācijas ieraksts ERC-8004 Reputācijas Reģistrā darījumu partnera vārdā (ja pilnvarots)
5. Platformai JĀKEŠO ERC-8004 reģistru vaicājumi uz konfigurējamu laiku (noklusējums 5 minūtes), lai samazinātu blokķēdes vaicājumu izmaksas
6. KAD ERC-8004 reģistrs nav sasniedzams, Platformai JĀATĻAUJ līguma parakstīšana līgumiem zem augstvērtīgā sliekšņa un JĀIERINDO reputācijas pārbaudes atkārtotam mēģinājumam


### 14. prasība: Strīdu Risināšana

**Lietotāja Stāsts:** Kā līguma puse, es vēlos ierosināt formālu strīdu, kad līguma nosacījumi tiek pārkāpti, lai būtu strukturēts process risināšanai ar pierādījumiem un šķīrējtiesu.

#### Pieņemšanas Kritēriji

1. KAD puse iesniedz strīda ierosināšanas pieprasījumu, atsaucoties uz līguma ID un iemeslu, Strīdu Servisam JĀIZVEIDO strīda ieraksts, JĀPĀRSLĒDZ līguma statuss uz `disputed` un JĀPAZIŅO visām līguma pusēm
2. Strīdu Servisam JĀIMPLEMENTĒ ADP-saderīgi ziņojumu formāti strīdu iesniegšanai, pierādījumu iesniegšanai un šķīrējtiesas lēmumiem
3. KAD pierādījumi tiek iesniegti strīdam, Strīdu Servisam JĀSAGLABĀ pierādījumi IPFS ar satura hešu un JĀSASAISTA tie ar strīda ierakstu ar laika zīmogu un iesniedzēja identitāti
4. Strīdu Servisam JĀATBALSTA divformātu šķīrējtiesas lēmumi: mašīnlasāms JSON lēmums un cilvēklasāms PDF lēmums, ievērojot ADP specifikāciju
5. KAD šķīrējtiesas lēmums tiek pieņemts, Strīdu Servisam JĀATJAUNINA līguma statuss uz `terminated` vai `active` atkarībā no lēmuma un JĀREĢISTRĒ rezultāts līguma audita žurnālā
6. Strīdu Servisam JĀPIEMĒRO pierādījumu iesniegšanas termiņi, kas konfigurējami katrai līguma veidnei (noklusēti 14 dienas no strīda ierosināšanas)
7. JA puse neiesniedz pierādījumus termiņā, TAD Strīdu Servisam JĀĻAUJ šķīrējtiesnesim pieņemt noklusējuma lēmumu, pamatojoties uz pieejamajiem pierādījumiem

### 15. prasība: Vadības Panelis — Līgumu Pārraudzība

**Lietotāja Stāsts:** Kā uzņēmuma auditors, es vēlos tīmekļa vadības paneli, kas parāda visus manas organizācijas aģentu izpildītos līgumus ar filtrēšanu un meklēšanu, lai varētu uzturēt atbilstības pārraudzību.

#### Pieņemšanas Kritēriji

1. KAD autentificēts lietotājs piekļūst Vadības Panelim, Vadības Panelim JĀPARĀDA kopsavilkuma skats ar līgumu skaitu pēc statusa (melnraksts, gaida parakstu, aktīvs, izpildīts, apstrīdēts, izbeigts), kopējo līgumu vērtību un aktīvo aģentu skaitu
2. Vadības Panelim JĀPARĀDA lappušots saraksts ar visiem līgumiem, kas saistīti ar autentificētā lietotāja organizāciju, kārtojams pēc datuma, statusa, līguma veida, aģenta un vērtības
3. KAD lietotājs izvēlas līgumu no saraksta, Vadības Panelim JĀPARĀDA pilnas līguma detaļas: cilvēklasāms teksts, mašīnlasāms JSON, Pilnvardevēja Deklarācija, parakstītāju puses, laika zīmogi, Grozījumu Ķēde, audita žurnāls, cNFT detaļas (tokena ID, transakcijas hešs, bloku pārlūka saite) un pašreizējais statuss
4. Vadības Panelim JĀNODROŠINA meklēšanas funkcionalitāte, kas ļauj lietotājiem atrast līgumus pēc līguma ID, Līguma Heša, aģenta maka adreses, pilnvardevēja vārda vai atslēgvārdiem līguma tekstā
5. Vadības Panelim JĀNODROŠINA filtrēšana pēc līguma veida (deleģēšana, komercija), statusa, datumu diapazona, aģenta un izmantotās veidnes
6. KAD līgums ir `active` statusā, Vadības Panelim JĀPARĀDA darbību pogas grozījuma ierosināšanai vai strīda ierosināšanai
7. Vadības Panelis JĀBŪVĒ kā autentificēti maršruti esošajā Next.js App Router vietnē `projects/Amber_protocol/site/`

### 16. prasība: Vadības Panelis — Aģentu Pārvaldība

**Lietotāja Stāsts:** Kā individuāls aģenta īpašnieks, es vēlos pārvaldīt savu aģentu līgumu parakstīšanas pilnvaras no vadības paneļa, lai varētu kontrolēt, ko mani aģenti ir pilnvaroti darīt.

#### Pieņemšanas Kritēriji

1. Vadības Panelim JĀPARĀDA saraksts ar visiem aģentiem, kas saistīti ar autentificētā lietotāja maku, parādot katra aģenta maka adresi, aktīvos Deleģēšanas Līgumus, kopējos tēriņus pret pilnvarotajiem limitiem un pašreizējo pilnvarojuma statusu
2. KAD lietotājs izvēlas aģentu, Vadības Panelim JĀPARĀDA aģenta aktīvie Deleģēšanas Līgumi ar to tēriņu limitiem, pilnvarotajiem darbību apjomiem un atlikušo budžetu
3. KAD lietotājs atsauc aģenta pilnvaras, Vadības Panelim JĀIZBEIDZ aģenta aktīvais Deleģēšanas Līgums, JĀANULĒ saistītā API atslēga caur Dinamisko API Atslēgu Kartēšanu un JĀREĢISTRĒ atsaukšana audita žurnālā
4. Vadības Panelim JĀPARĀDA paziņojums, kad aģenta tēriņi tuvojas 80% no tā pilnvarotā limita jebkurā aktīvā Deleģēšanas Līgumā
5. KAD lietotājs izveido jaunu Deleģēšanas Līgumu aģentam, Vadības Panelim JĀPREZENTĒ forma, kas iepriekš aizpildīta no izvēlētās veidnes ar laukiem pilnvarotajām darbībām, tēriņu limitiem, kategoriju ierobežojumiem un atbildības nosacījumiem

### 17. prasība: Vadības Panelis — Atbilstības Ziņojumi

**Lietotāja Stāsts:** Kā atbilstības speciālists, es vēlos ģenerēt ziņojumus par visu aģentu līgumu aktivitāti noteiktā periodā, lai varētu demonstrēt regulatīvo atbilstību un iekšējās politikas ievērošanu.

#### Pieņemšanas Kritēriji

1. KAD lietotājs pieprasa atbilstības ziņojumu par datumu diapazonu, Vadības Panelim JĀĢENERĒ ziņojums, kas satur: visus periodā izveidotos, parakstītos, izpildītos, apstrīdētos un izbeigtos līgumus, kopējās līgumu vērtības, iesaistītos aģentus un visus strīdus ar to iznākumiem
2. Vadības Panelim JĀATBALSTA atbilstības ziņojumu eksportēšana CSV un PDF formātos
3. Vadības Panelim JĀPARĀDA laika līnijas vizualizācija ar līgumu aktivitāti, parādot izveides, parakstīšanas, izpildes un strīdu notikumus hronoloģiskā asī
4. KAD atbilstības ziņojums tiek ģenerēts, Vadības Panelim JĀIETVER Līguma Hešs un cNFT tokena ID katram līgumam, lai nodrošinātu neatkarīgu blokķēdes verifikāciju

### 12. prasība: MCP Serveris

**Lietotāja Stāsts:** Kā AI aģents, kas izmanto Model Context Protocol, es vēlos atklāt Amber līgumu iespējas un parakstīt līgumus caur MCP rīku izsaukumiem, lai varētu integrēt Amber savā darbplūsmā bez pielāgotas API integrācijas.

#### Pieņemšanas Kritēriji

1. Platformai JĀATKLĀJ MCP Serveris, kas implementē Model Context Protocol specifikāciju ar rīkiem: pieejamo veidņu uzskaitīšana, līgumu izveide no veidnēm, līgumu parakstīšana, līguma statusa vaicāšana un pilnvarojuma verifikācija
2. KAD aģents atklāj MCP Serveri, MCP Serverim JĀATGRIEŽ rīku manifests, kas apraksta katru pieejamo rīku ar tā parametriem, atgriešanas tipiem un lietošanas aprakstiem
3. KAD aģents izsauc `create_contract` MCP rīku ar veidnes ID un parametriem, MCP Serverim JĀDELEĢĒ Līgumu Dzinējam un JĀATGRIEŽ līguma ID un Līguma Hešs
4. KAD aģents izsauc `sign_contract` MCP rīku ar līguma ID un maka parakstu, MCP Serverim JĀDELEĢĒ Līgumu Dzinējam paraksta verifikācijai un statusa pārejai
5. MCP Serverim JĀAUTENTIFICĒ aģenti caur maka parakstu, kas iekļauts MCP rīka izsaukuma kontekstā
6. MCP Serverim JĀATGRIEŽ strukturētas kļūdu atbildes, ievērojot MCP kļūdu konvencijas, kad operācijas neizdodas

### 13. prasība: A2A Aģenta Karte

**Lietotāja Stāsts:** Kā AI aģents, kas izmanto Google A2A protokolu, es vēlos atklāt Amber Protocol iespējas caur Aģenta Karti, lai varētu atrast un mijiedarboties ar platformu caur standarta aģentu atklāšanu.

#### Pieņemšanas Kritēriji

1. Platformai JĀPUBLICĒ A2A Aģenta Karte zināmā URL (`/.well-known/agent.json`), kas apraksta Amber Protocol iespējas: līgumu izveide, veidņu pārlūkošana, līgumu parakstīšana, statusa vaicāšana un pilnvarojuma verifikācija
2. A2A Aģenta Kartei JĀIETVER Platformas atbalstītie ievades/izvades formāti (JSON), autentifikācijas metodes (maka paraksts, API atslēga) un galapunktu URL
3. A2A Aģenta Kartei JĀUZSKAITA atbalstītie līgumu veidi (Deleģēšanas Līgums, Komercijas Līgums) un pieejamās veidņu kategorijas
4. KAD A2A Aģenta Karte tiek pieprasīta, Platformai JĀATGRIEŽ derīgs JSON dokuments, kas atbilst Google A2A Agent Card specifikācijai
5. A2A Aģenta Kartei JĀIETVER versijas informācija un saite uz pilnu API dokumentāciju

### 14. prasība: Strīdu Risināšana

**Lietotāja Stāsts:** Kā līguma puse, es vēlos ierosināt formālu strīdu, kad līguma nosacījumi tiek pārkāpti, lai būtu strukturēts process risināšanai ar pierādījumiem un šķīrējtiesu.

#### Pieņemšanas Kritēriji

1. KAD puse iesniedz strīda ierosināšanas pieprasījumu, atsaucoties uz līguma ID un iemeslu, Strīdu Servisam JĀIZVEIDO strīda ieraksts, JĀPĀRSLĒDZ līguma statuss uz `disputed` un JĀPAZIŅO visām līguma pusēm
2. Strīdu Servisam JĀIMPLEMENTĒ ADP-saderīgi ziņojumu formāti strīdu iesniegšanai, pierādījumu iesniegšanai un šķīrējtiesas lēmumiem
3. KAD pierādījumi tiek iesniegti strīdam, Strīdu Servisam JĀSAGLABĀ pierādījumi uz IPFS ar satura hešu un JĀSASAISTA tie ar strīda ierakstu ar laika zīmogu un iesniedzēja identitāti
4. Strīdu Servisam JĀATBALSTA divformātu šķīrējtiesas lēmumi: mašīnlasāms JSON lēmums un cilvēklasāms PDF lēmums, ievērojot ADP specifikāciju
5. KAD šķīrējtiesas lēmums tiek pieņemts, Strīdu Servisam JĀATJAUNINA līguma statuss uz `terminated` vai `active` atkarībā no lēmuma un JĀREĢISTRĒ rezultāts līguma audita žurnālā
6. Strīdu Servisam JĀPIEMĒRO pierādījumu iesniegšanas termiņi, kas konfigurējami katrai līguma veidnei (noklusējums 14 dienas no strīda ierosināšanas)
7. JA puse neiesniedz pierādījumus termiņā, TAD Strīdu Servisam JĀĻAUJ šķīrējtiesnesim pieņemt noklusējuma lēmumu, pamatojoties uz pieejamajiem pierādījumiem

### 15. prasība: Vadības Panelis — Līgumu Pārraudzība

**Lietotāja Stāsts:** Kā uzņēmuma auditors, es vēlos tīmekļa vadības paneli, kas parāda visus manas organizācijas aģentu izpildītos līgumus ar filtrēšanu un meklēšanu, lai varētu uzturēt atbilstības pārraudzību.

#### Pieņemšanas Kritēriji

1. KAD autentificēts lietotājs piekļūst Vadības Panelim, Vadības Panelim JĀPARĀDA kopsavilkuma skats ar līgumu skaitu pēc statusa (melnraksts, gaida parakstu, aktīvs, izpildīts, apstrīdēts, izbeigts), kopējo līgumu vērtību un aktīvo aģentu skaitu
2. Vadības Panelim JĀPARĀDA lappušots saraksts ar visiem līgumiem, kas saistīti ar autentificētā lietotāja organizāciju, kārtojams pēc datuma, statusa, līguma veida, aģenta un vērtības
3. KAD lietotājs izvēlas līgumu no saraksta, Vadības Panelim JĀPARĀDA pilnas līguma detaļas: cilvēklasāms teksts, mašīnlasāms JSON, Pilnvardevēja Deklarācija, parakstītāju puses, laika zīmogi, Grozījumu Ķēde, audita žurnāls, cNFT detaļas (tokena ID, transakcijas hešs, bloku pārlūka saite) un pašreizējais statuss
4. Vadības Panelim JĀNODROŠINA meklēšanas funkcionalitāte, kas ļauj lietotājiem atrast līgumus pēc līguma ID, Līguma Heša, aģenta maka adreses, pilnvardevēja vārda vai atslēgvārdiem līguma tekstā
5. Vadības Panelim JĀNODROŠINA filtrēšana pēc līguma veida (deleģēšana, komercija), statusa, datumu diapazona, aģenta un izmantotās veidnes
6. KAD līgums ir `active` statusā, Vadības Panelim JĀPARĀDA darbību pogas grozījuma ierosināšanai vai strīda ierosināšanai
7. Vadības Panelis JĀBŪVĒ kā autentificēti maršruti esošajā Next.js App Router vietnē `projects/Amber_protocol/site/`

### 16. prasība: Vadības Panelis — Aģentu Pārvaldība

**Lietotāja Stāsts:** Kā individuāls aģenta īpašnieks, es vēlos pārvaldīt savu aģentu līgumu parakstīšanas pilnvaras no vadības paneļa, lai varētu kontrolēt, ko mani aģenti ir pilnvaroti darīt.

#### Pieņemšanas Kritēriji

1. Vadības Panelim JĀPARĀDA saraksts ar visiem aģentiem, kas saistīti ar autentificētā lietotāja maku, parādot katra aģenta maka adresi, aktīvos Deleģēšanas Līgumus, kopējos tēriņus pret pilnvarotajiem limitiem un pašreizējo pilnvarojuma statusu
2. KAD lietotājs izvēlas aģentu, Vadības Panelim JĀPARĀDA aģenta aktīvie Deleģēšanas Līgumi ar to tēriņu limitiem, pilnvarotajiem darbību apjomiem un atlikušo budžetu
3. KAD lietotājs atsauc aģenta pilnvaras, Vadības Panelim JĀIZBEIDZ aģenta aktīvais Deleģēšanas Līgums, JĀANULĒ saistītā API atslēga caur Dinamisko API Atslēgu Kartēšanu un JĀREĢISTRĒ atsaukšana audita žurnālā
4. Vadības Panelim JĀPARĀDA paziņojums, kad aģenta tēriņi tuvojas 80% no tā pilnvarotā limita jebkurā aktīvā Deleģēšanas Līgumā
5. KAD lietotājs izveido jaunu Deleģēšanas Līgumu aģentam, Vadības Panelim JĀPREZENTĒ veidlapa, kas iepriekš aizpildīta no izvēlētās veidnes ar laukiem pilnvarotajām darbībām, tēriņu limitiem, kategoriju ierobežojumiem un atbildības nosacījumiem

### 17. prasība: Vadības Panelis — Atbilstības Ziņojumi

**Lietotāja Stāsts:** Kā atbilstības speciālists, es vēlos ģenerēt ziņojumus par visu aģentu līgumu aktivitāti noteiktā periodā, lai varētu demonstrēt regulatīvo atbilstību un iekšējās politikas ievērošanu.

#### Pieņemšanas Kritēriji

1. KAD lietotājs pieprasa atbilstības ziņojumu par datumu diapazonu, Vadības Panelim JĀĢENERĒ ziņojums, kas satur: visus periodā izveidotos, parakstītos, izpildītos, apstrīdētos un izbeigtos līgumus, kopējās līgumu vērtības, iesaistītos aģentus un visus strīdus ar to iznākumiem
2. Vadības Panelim JĀATBALSTA atbilstības ziņojumu eksportēšana CSV un PDF formātos
3. Vadības Panelim JĀPARĀDA laika līnijas vizualizācija ar līgumu aktivitāti, parādot izveides, parakstīšanas, izpildes un strīdu notikumus hronoloģiskā asī
4. KAD atbilstības ziņojums tiek ģenerēts, Vadības Panelim JĀIETVER Līguma Hešs un cNFT tokena ID katram līgumam, lai nodrošinātu neatkarīgu blokķēdes verifikāciju


### 18. prasība: Autentifikācija un Autorizācija

**Lietotāja Stāsts:** Kā platformas lietotājs, es vēlos autentificēties, izmantojot savu kripto maku, lai varētu piekļūt vadības panelim un pārvaldīt līgumus bez tradicionāla konta izveides.

#### Pieņemšanas Kritēriji

1. Platformai JĀATBALSTA maka autentifikācija, izmantojot SIWE (Sign-In with Ethereum), kur lietotājs paraksta izaicinājuma ziņojumu ar savu maku, lai pierādītu īpašumtiesības
2. KAD lietotājs autentificējas caur SIWE, Platformai JĀIZVEIDO vai JĀIEGŪST sesija, kas sasaistīta ar lietotāja maka adresi, neprasot e-pastu, paroli vai profila izveidi
3. Platformai JĀATBALSTA lomu piekļuves kontrole ar šādām lomām: `owner` (pilna piekļuve saviem līgumiem un aģentiem), `auditor` (tikai lasīšanas piekļuve organizācijas līgumiem un ziņojumiem) un `admin` (pilna piekļuve, ieskaitot veidņu pārvaldību)
4. KAD neautentificēts lietotājs mēģina piekļūt Vadības Paneļa maršrutiem, Platformai JĀPĀRVIRZA uz maka savienošanas plūsmu
5. Platformai JĀIESTATA sesijas derīguma termiņš uz 24 stundām, pieprasot atkārtotu autentifikāciju caur maka parakstu pēc termiņa beigām
6. Platformai JĀATBALSTA WalletConnect un MetaMask kā maka savienošanas nodrošinātāji

### 19. prasība: IPFS Glabātuve

**Lietotāja Stāsts:** Kā platformas operators, es vēlos, lai līgumu teksts un cNFT metadati tiktu glabāti IPFS, lai līgumu saturs būtu pastāvīgi pieejams un neatkarīgi verificējams pat tad, ja platforma pārtrauc darbu.

#### Pieņemšanas Kritēriji

1. KAD Rikārdiāna Līgums tiek izveidots, Platformai JĀAUGŠUPIELĀDĒ cilvēklasāmais līguma teksts IPFS un JĀSAGLABĀ iegūtais CID Supabase datubāzē
2. KAD cNFT tiek kalts, Platformai JĀAUGŠUPIELĀDĒ NFT metadatu JSON (kas satur contract_hash, human_readable_url, machine_parsable_terms) IPFS un JĀIZMANTO CID kā tokena `tokenURI`
3. Platformai JĀPIESPRAUŽ (pin) viss augšupielādētais saturs vismaz vienā IPFS piespraušanas servisā, lai nodrošinātu pastāvību
4. KAD IPFS saturs tiek iegūts parādīšanai Lasītāja Portālā, Platformai JĀVERIFICĒ satura hešs pret saglabāto CID, lai atklātu jebkādu manipulāciju
5. JA IPFS augšupielāde neizdodas, TAD Platformai JĀMĒĢINA atkārtoti līdz trīs reizēm ar eksponenciālu aizkavi un JĀPĀRSLĒDZAS uz satura pasniegšanu no Supabase datubāzes, reģistrējot IPFS kļūmi manuālai risināšanai

### 20. prasība: Datubāzes Shēma un Datu Integritāte

**Lietotāja Stāsts:** Kā platformas operators, es vēlos labi strukturētu datubāzi ar atsauces integritāti, lai līgumu dati būtu konsekventi un vaicājami.

#### Pieņemšanas Kritēriji

1. Platformai JĀIZMANTO Supabase (PostgreSQL) ar šādām pamata tabulām: `contracts` (līgumu ieraksti ar statusu, veidu, hešiem, IPFS CID), `signatures` (parakstīšanas ieraksti, sasaistīti ar līgumiem), `templates` (veidņu definīcijas ar versiju pārvaldību), `disputes` (strīdu ieraksti, sasaistīti ar līgumiem), `api_keys` (Dinamiskās API Atslēgu Kartēšanas ieraksti), `audit_log` (nemainīgs notikumu žurnāls) un `amendment_chain` (vecāku-bērnu līgumu attiecības)
2. Platformai JĀNODROŠINA atsauces integritāte caur ārējām atslēgām starp līgumiem un parakstiem, līgumiem un strīdiem, līgumiem un grozījumu ķēdi, un API atslēgām un līgumiem
3. Platformai JĀIZMANTO datubāzes līmeņa ierobežojumi, lai nodrošinātu derīgas statusu pārejas (piemēram, līgums nevar pāriet no `fulfilled` uz `draft`)
4. Platformai JĀINDEKSĒ `contracts` tabula pēc contract_hash, status, contract_type, principal_wallet, agent_wallet un created_at efektīvai vaicāšanai
5. KAD jebkurš ar līgumu saistīts ieraksts tiek izveidots vai modificēts, Platformai JĀPIEVIENO ieraksts `audit_log` tabulā ar darbību, aktoru, laika zīmogu un stāvokli pirms/pēc
6. Platformai JĀIMPLEMENTĒ rindu līmeņa drošība Supabase, lai lietotāji varētu piekļūt tikai tiem līgumiem, kuros viņi ir puse (pilnvardevējs vai aģents) vai kuriem viņiem ir piešķirta auditora piekļuve

### 21. prasība: Viedais Līgums (Solidity)

**Lietotāja Stāsts:** Kā platformas operators, es vēlos drošu, auditējamu Solidity viedo līgumu uz Base L2 cNFT kalšanai, lai līgumu pierādījumi būtu uzticami verificējami blokķēdē.

#### Pieņemšanas Kritēriji

1. Platformai JĀIZVIETO ERC-721 saderīgs Solidity viedais līgums uz Base_L2 ar `mint` funkciju, kas pieņem saņēmēja maka adresi, Līguma Hešu (bytes32) un metadatu URI (IPFS CID)
2. Viedajam līgumam JĀSAGLABĀ Līguma Hešs blokķēdē kā daļa no tokena datiem, vaicājams caur `getContractHash(tokenId)` skatīšanas funkciju
3. Viedajam līgumam JĀIEROBEŽO `mint` funkcija uz autorizētu kalšanas adresi (Platformas backend maks) caur piekļuves kontroles modifikatoru
4. Viedajam līgumam JĀEMITĒ `ContractMinted(tokenId, contractHash, recipient, metadataURI)` notikums katrā veiksmīgā kalšanā ārpusķēdes indeksēšanai
5. Viedajam līgumam JĀIMPLEMENTĒ `verify(tokenId, contractHash)` skatīšanas funkcija, kas atgriež `true`, ja nodrošinātais hešs atbilst saglabātajam hešam dotajam tokena ID
6. Viedajam līgumam JĀBŪT izvietojamam uz Base testnet (Sepolia) izstrādei un Base mainnet produkcijai ar vienādu baitkodu

### 22. prasība: Līgumu Parsēšana un Formatēšana

**Lietotāja Stāsts:** Kā izstrādātājs, kas integrējas ar Amber, es vēlos parsēt mašīnlasāmu līguma JSON strukturētos objektos un drukāt tos atpakaļ derīgā JSON, lai varētu programmatiski strādāt ar līguma nosacījumiem.

#### Pieņemšanas Kritēriji

1. Platformai JĀNODROŠINA līgumu parseris, kas pieņem mašīnlasāmu līguma JSON un izveido validētu, tipizētu līguma objektu ar visiem obligātajiem laukiem (contract_id, version, type, principal, agent, scope, dispute_resolution, hash)
2. KAD tiek nodrošināts nederīgs JSON vai JSON, kam trūkst obligāto lauku, parserim JĀATGRIEŽ aprakstošu kļūdu, uzskaitot visas validācijas kļūmes
3. Platformai JĀNODROŠINA formatētājs, kas pieņem validētu līguma objektu un izveido formatētu, cilvēklasāmu JSON izvadi
4. VISIEM derīgiem līguma objektiem, parsējot formatēto izvadi, JĀIEGŪST līguma objekts, kas ekvivalents oriģinālam (aprites īpašība: parse(print(contract)) == contract)
5. Platformai JĀNODROŠINA līguma teksta renderētājs, kas pieņem validētu līguma objektu un izveido cilvēklasāmu juridisko tekstu, izmantojot saistīto veidni
6. VISIEM derīgiem līguma objektiem, renderējot cilvēklasāmu tekstu un pēc tam aprēķinot SHA-256 hešu, JĀIEGŪST hešs, kas atbilst līguma saglabātajam Līguma Hešam (heša konsekvences īpašība)

### 23. prasība: API Dokumentācija

**Lietotāja Stāsts:** Kā aģentu izstrādātājs, es vēlos visaptverošu, interaktīvu API dokumentāciju, lai varētu integrēt savus aģentus ar Amber Protocol bez minēšanas.

#### Pieņemšanas Kritēriji

1. Platformai JĀĢENERĒ OpenAPI 3.0 specifikācija no Aģentu API galapunktu definīcijām un JĀPASNIEDZ tā `/api/v1/docs`
2. Platformai JĀNODROŠINA interaktīvs API pārlūks (Swagger UI vai ekvivalents), kur izstrādātāji var apskatīt galapunktu aprakstus, pieprasījumu/atbilžu shēmas un piemēru datus
3. Platformai JĀIETVER autentifikācijas instrukcijas gan API atslēgas, gan maka paraksta metodēm dokumentācijā
4. KAD API galapunkts tiek pievienots vai modificēts, Platformai JĀATJAUNINA OpenAPI specifikācija automātiski, lai atspoguļotu izmaiņas
5. Platformai JĀIETVER koda piemēri Python un TypeScript valodās biežākajām operācijām: Deleģēšanas Līguma izveide, līguma parakstīšana, līguma statusa vaicāšana un veidņu uzskaitīšana

### 24. prasība: Infrastruktūra un Izvietošana

**Lietotāja Stāsts:** Kā platformas operators, es vēlos, lai platforma būtu izvietojama uz taupīgas infrastruktūras zem $50/mēnesī, lai projekts paliktu pašfinansēts un ilgtspējīgs.

#### Pieņemšanas Kritēriji

1. Platformai JĀBŪT izvietojamam, izmantojot: Supabase bezmaksas līmeni (PostgreSQL + Auth + API), Vercel bezmaksas līmeni (Next.js frontend un API maršruti), Base testnet 1. fāzes izstrādei (bezmaksas gāze) un vienu IPFS piespraušanas servisu
2. Platformai JĀIZMANTO vides mainīgie visai konfigurācijai: Supabase URL un atslēgas, IPFS piespraušanas servisa akreditācijas dati, Base RPC galapunkts, viedā līguma adrese un maka privātā atslēga kalšanai
3. Platformai JĀATBALSTA lokālā izstrāde ar vienu komandu, kas palaiž Next.js izstrādes serveri un savienojas ar Supabase lokālo instanci vai attālināto projektu
4. KAD Platforma tiek izvietota produkcijā, Platformai JĀPASNIEDZ visa trafika caur HTTPS un JĀPIEMĒRO drošas galvenes (HSTS, CSP, X-Frame-Options)
5. Platformai JĀIMPLEMENTĒ strukturēta žurnalēšana (JSON formātā) visām backend operācijām ar korelācijas ID, kas sasaista saistītās operācijas (līguma izveide → parakstīšana → kalšana → API atslēgas ģenerēšana)
6. Platformai JĀIMPLEMENTĒ veselības pārbaudes galapunkti `/api/health`, kas atgriež datubāzes savienojamības, IPFS pieejamības un blokķēdes RPC savienojamības statusu

### 25. prasība: Fāžu Ieviešanas Vārti

**Lietotāja Stāsts:** Kā platformas operators, es vēlos skaidras fāžu robežas, lai MVP tiktu piegādāts ātri un turpmākās funkcijas tiktu pievienotas pakāpeniski, nesabojājot esošo funkcionalitāti.

#### Pieņemšanas Kritēriji

1. Platformai JĀIMPLEMENTĒ 1. fāze (MVP) kā patstāvīgs izlaidums, iekļaujot: Līgumu Dzinēju (izveide, hešošana, parakstīšana, dzīves cikls), Veidņu Sistēmu (minimums 3 Deleģēšanas Līgumu veidnes un 3 Komercijas Līgumu veidnes), LLM Ģeneratoru, Aģentu API, Lasītāja Portālu (heša meklēšana bez cNFT verifikācijas), Vadības Paneli (līgumu saraksts, detaļas, meklēšana), maka autentifikāciju, Supabase datubāzi un IPFS glabātuvi
2. Platformai JĀIMPLEMENTĒ 2. fāze kā papildinošs izlaidums, iekļaujot: cNFT kalšanu uz Base_L2, Dinamisko API Atslēgu Kartēšanu, Lasītāja Portāla cNFT verifikāciju un bloku pārlūka saites, Grozījumu Ķēdi ar blokķēdes vecāku atsaucēm un x402_V2 paplašinājumu
3. Platformai JĀIMPLEMENTĒ 3. fāze kā papildinošs izlaidums, iekļaujot: ERC_8004 identitātes verifikāciju un reputācijas pārbaudes, MCP Serveri, A2A Aģenta Karti, Strīdu Servisu (ADP-saderīgu) un atbilstības ziņojumus ar blokķēdes verifikāciju
4. KAD 2. fāzes funkcijas tiek izvietotas, Platformai JĀUZTUR atpakaļsaderība ar visiem 1. fāzes API galapunktiem un datu struktūrām
5. KAD 3. fāzes funkcijas tiek izvietotas, Platformai JĀUZTUR atpakaļsaderība ar visiem 1. un 2. fāzes API galapunktiem un datu struktūrām

---

*Šis dokuments ir Amber Protocol pamata platformas prasību specifikācija. Tulkots no angļu valodas oriģināla.*

### 18. prasība: Autentifikācija un Autorizācija

**Lietotāja Stāsts:** Kā platformas lietotājs, es vēlos autentificēties, izmantojot savu kripto maku, lai varētu piekļūt vadības panelim un pārvaldīt līgumus bez tradicionāla konta izveides.

#### Pieņemšanas Kritēriji

1. Platformai JĀATBALSTA maka autentifikācija, izmantojot SIWE (Sign-In with Ethereum), kur lietotājs paraksta izaicinājuma ziņojumu ar savu maku, lai pierādītu īpašumtiesības
2. KAD lietotājs autentificējas caur SIWE, Platformai JĀIZVEIDO vai JĀIEGŪST sesija, kas saistīta ar lietotāja maka adresi, neprasot e-pastu, paroli vai profila izveidi
3. Platformai JĀATBALSTA lomu piekļuves kontrole ar šādām lomām: `owner` (pilna piekļuve saviem līgumiem un aģentiem), `auditor` (tikai lasīšanas piekļuve organizācijas līgumiem un ziņojumiem) un `admin` (pilna piekļuve, ieskaitot veidņu pārvaldību)
4. KAD neautentificēts lietotājs mēģina piekļūt Vadības Paneļa maršrutiem, Platformai JĀPĀRVIRZA uz maka savienošanas plūsmu
5. Platformai JĀIESTATA sesijas derīguma termiņš uz 24 stundām, pieprasot atkārtotu autentifikāciju caur maka parakstu pēc termiņa beigām
6. Platformai JĀATBALSTA WalletConnect un MetaMask kā maka savienošanas nodrošinātāji

### 19. prasība: IPFS Glabātuve

**Lietotāja Stāsts:** Kā platformas operators, es vēlos, lai līgumu teksti un cNFT metadati tiktu glabāti IPFS, lai līgumu saturs būtu pastāvīgi pieejams un neatkarīgi verificējams pat tad, ja platforma pārtrauc darbu.

#### Pieņemšanas Kritēriji

1. KAD Rikārdiāna Līgums tiek izveidots, Platformai JĀAUGŠUPIELĀDĒ cilvēklasāmais līguma teksts uz IPFS un JĀSAGLABĀ iegūtais CID Supabase datubāzē
2. KAD cNFT tiek kalts, Platformai JĀAUGŠUPIELĀDĒ NFT metadatu JSON (kas satur contract_hash, human_readable_url, machine_parsable_terms) uz IPFS un JĀIZMANTO CID kā tokena `tokenURI`
3. Platformai JĀPIESPRAUŽ viss augšupielādētais saturs vismaz vienā IPFS piespraušanas servisā, lai nodrošinātu pastāvību
4. KAD IPFS saturs tiek iegūts parādīšanai Lasītāja Portālā, Platformai JĀVERIFICĒ satura hešs pret saglabāto CID, lai atklātu jebkādu manipulāciju
5. JA IPFS augšupielāde neizdodas, TAD Platformai JĀMĒĢINA atkārtoti līdz trīs reizēm ar eksponenciālu aizkavi un JĀPĀRSLĒDZAS uz satura pasniegšanu no Supabase datubāzes, reģistrējot IPFS kļūmi manuālai risināšanai

### 20. prasība: Datubāzes Shēma un Datu Integritāte

**Lietotāja Stāsts:** Kā platformas operators, es vēlos labi strukturētu datubāzi ar atsauces integritāti, lai līgumu dati būtu konsekventi un vaicājami.

#### Pieņemšanas Kritēriji

1. Platformai JĀIZMANTO Supabase (PostgreSQL) ar šādām pamata tabulām: `contracts` (līgumu ieraksti ar statusu, veidu, hešiem, IPFS CID), `signatures` (parakstīšanas ieraksti, sasaistīti ar līgumiem), `templates` (veidņu definīcijas ar versiju pārvaldību), `disputes` (strīdu ieraksti, sasaistīti ar līgumiem), `api_keys` (Dinamiskās API Atslēgu Kartēšanas ieraksti), `audit_log` (nemainīgs notikumu žurnāls) un `amendment_chain` (vecāku-bērnu līgumu attiecības)
2. Platformai JĀNODROŠINA atsauces integritāte caur ārējām atslēgām starp līgumiem un parakstiem, līgumiem un strīdiem, līgumiem un grozījumu ķēdi, un API atslēgām un līgumiem
3. Platformai JĀIZMANTO datubāzes līmeņa ierobežojumi, lai nodrošinātu derīgas statusu pārejas (piemēram, līgums nevar pāriet no `fulfilled` uz `draft`)
4. Platformai JĀINDEKSĒ `contracts` tabula pēc contract_hash, status, contract_type, principal_wallet, agent_wallet un created_at efektīvai vaicāšanai
5. KAD jebkurš ar līgumu saistīts ieraksts tiek izveidots vai modificēts, Platformai JĀPIEVIENO ieraksts `audit_log` tabulā ar darbību, aktoru, laika zīmogu un stāvokli pirms/pēc
6. Platformai JĀIMPLEMENTĒ rindu līmeņa drošība Supabase, lai lietotāji varētu piekļūt tikai tiem līgumiem, kuros viņi ir puse (pilnvardevējs vai aģents) vai kuriem viņiem ir piešķirta auditora piekļuve

### 21. prasība: Viedais Līgums (Solidity)

**Lietotāja Stāsts:** Kā platformas operators, es vēlos drošu, auditējamu Solidity viedo līgumu uz Base L2 cNFT kalšanai, lai līgumu pierādījumi būtu uzticami verificējami blokķēdē.

#### Pieņemšanas Kritēriji

1. Platformai JĀIZVIETO ERC-721 saderīgs Solidity viedais līgums uz Base_L2 ar `mint` funkciju, kas pieņem saņēmēja maka adresi, Līguma Hešu (bytes32) un metadatu URI (IPFS CID)
2. Viedajam līgumam JĀSAGLABĀ Līguma Hešs blokķēdē kā daļa no tokena datiem, vaicājams caur `getContractHash(tokenId)` skata funkciju
3. Viedajam līgumam JĀIEROBEŽO `mint` funkcija uz autorizētu kalšanas adresi (Platformas backend maks) caur piekļuves kontroles modifikatoru
4. Viedajam līgumam JĀEMITĒ `ContractMinted(tokenId, contractHash, recipient, metadataURI)` notikums katrā veiksmīgā kalšanā ārpusķēdes indeksēšanai
5. Viedajam līgumam JĀIMPLEMENTĒ `verify(tokenId, contractHash)` skata funkcija, kas atgriež `true`, ja nodrošinātais hešs atbilst saglabātajam hešam dotajam tokena ID
6. Viedajam līgumam JĀBŪT izvietojamam uz Base testnet (Sepolia) izstrādei un Base mainnet produkcijai ar vienādu baitkodu

### 22. prasība: Līgumu Parsēšana un Formatēšana

**Lietotāja Stāsts:** Kā izstrādātājs, kas integrējas ar Amber, es vēlos parsēt mašīnlasāmu līguma JSON strukturētos objektos un izdrukāt tos atpakaļ derīgā JSON, lai varētu programmatiski strādāt ar līguma nosacījumiem.

#### Pieņemšanas Kritēriji

1. Platformai JĀNODROŠINA līgumu parseris, kas pieņem mašīnlasāmu līguma JSON un izveido validētu, tipizētu līguma objektu ar visiem obligātajiem laukiem (contract_id, version, type, principal, agent, scope, dispute_resolution, hash)
2. KAD tiek nodrošināts nederīgs JSON vai JSON, kam trūkst obligāto lauku, parserim JĀATGRIEŽ aprakstoša kļūda, uzskaitot visas validācijas kļūmes
3. Platformai JĀNODROŠINA formatētājs, kas pieņem validētu līguma objektu un izveido formatētu, cilvēklasāmu JSON izvadi
4. VISIEM derīgiem līguma objektiem, parsējot formatēto izvadi, JĀIEGŪST līguma objekts, kas ekvivalents oriģinālam (aprites īpašība: parse(print(contract)) == contract)
5. Platformai JĀNODROŠINA līguma teksta renderētājs, kas pieņem validētu līguma objektu un izveido cilvēklasāmu juridisko tekstu, izmantojot saistīto veidni
6. VISIEM derīgiem līguma objektiem, renderējot cilvēklasāmu tekstu un pēc tam aprēķinot SHA-256 hešu, JĀIEGŪST hešs, kas atbilst līguma saglabātajam Līguma Hešam (heša konsekvences īpašība)

### 23. prasība: API Dokumentācija

**Lietotāja Stāsts:** Kā aģentu izstrādātājs, es vēlos visaptverošu, interaktīvu API dokumentāciju, lai varētu integrēt savus aģentus ar Amber Protocol bez minēšanas.

#### Pieņemšanas Kritēriji

1. Platformai JĀĢENERĒ OpenAPI 3.0 specifikācija no Aģentu API galapunktu definīcijām un JĀPASNIEDZ tā `/api/v1/docs`
2. Platformai JĀNODROŠINA interaktīvs API pārlūks (Swagger UI vai ekvivalents), kur izstrādātāji var apskatīt galapunktu aprakstus, pieprasījumu/atbilžu shēmas un piemēru datus
3. Platformai JĀIETVER autentifikācijas instrukcijas gan API atslēgas, gan maka paraksta metodēm dokumentācijā
4. KAD API galapunkts tiek pievienots vai modificēts, Platformai AUTOMĀTISKI JĀATJAUNINA OpenAPI specifikācija, lai atspoguļotu izmaiņas
5. Platformai JĀIETVER koda piemēri Python un TypeScript valodās biežākajām operācijām: Deleģēšanas Līguma izveide, līguma parakstīšana, līguma statusa vaicāšana un veidņu uzskaitīšana

### 24. prasība: Infrastruktūra un Izvietošana

**Lietotāja Stāsts:** Kā platformas operators, es vēlos, lai platforma būtu izvietojama uz taupīgas infrastruktūras zem $50/mēnesī, lai projekts paliktu pašfinansēts un ilgtspējīgs.

#### Pieņemšanas Kritēriji

1. Platformai JĀBŪT izvietojamam, izmantojot: Supabase bezmaksas līmeni (PostgreSQL + Auth + API), Vercel bezmaksas līmeni (Next.js frontend un API maršruti), Base testnet 1. fāzes izstrādei (bezmaksas gāze) un vienu IPFS piespraušanas servisu
2. Platformai JĀIZMANTO vides mainīgie visai konfigurācijai: Supabase URL un atslēgas, IPFS piespraušanas servisa akreditācijas dati, Base RPC galapunkts, viedā līguma adrese un maka privātā atslēga kalšanai
3. Platformai JĀATBALSTA lokālā izstrāde ar vienu komandu, kas palaiž Next.js izstrādes serveri un savienojas ar Supabase lokālo instanci vai attālināto projektu
4. KAD Platforma tiek izvietota produkcijā, Platformai JĀPASNIEDZ visa trafika caur HTTPS un JĀPIEMĒRO drošības galvenes (HSTS, CSP, X-Frame-Options)
5. Platformai JĀIMPLEMENTĒ strukturēta žurnalēšana (JSON formātā) visām backend operācijām ar korelācijas ID, kas saista saistītās operācijas (līguma izveide → parakstīšana → kalšana → API atslēgas ģenerēšana)
6. Platformai JĀIMPLEMENTĒ veselības pārbaudes galapunkti `/api/health`, kas atgriež datubāzes savienojamības, IPFS pieejamības un blokķēdes RPC savienojamības statusu

### 25. prasība: Fāžu Ieviešanas Vārti

**Lietotāja Stāsts:** Kā platformas operators, es vēlos skaidras fāžu robežas, lai MVP tiktu piegādāts ātri un turpmākās funkcijas tiktu pievienotas pakāpeniski, nesabojājot esošo funkcionalitāti.

#### Pieņemšanas Kritēriji

1. Platformai JĀIMPLEMENTĒ 1. fāze (MVP) kā pašpietiekams izlaidums, kas ietver: Līgumu Dzinēju (izveide, hešošana, parakstīšana, dzīves cikls), Veidņu Sistēmu (minimums 3 Deleģēšanas Līgumu veidnes un 3 Komercijas Līgumu veidnes), LLM Ģeneratoru, Aģentu API, Lasītāja Portālu (heša meklēšana bez cNFT verifikācijas), Vadības Paneli (līgumu saraksts, detaļas, meklēšana), maka autentifikāciju, Supabase datubāzi un IPFS glabātuvi
2. Platformai JĀIMPLEMENTĒ 2. fāze kā papildinošs izlaidums, kas ietver: cNFT kalšanu uz Base_L2, Dinamisko API Atslēgu Kartēšanu, Lasītāja Portāla cNFT verifikāciju un bloku pārlūka saites, Grozījumu Ķēdi ar blokķēdes vecāku atsaucēm un x402_V2 paplašinājumu
3. Platformai JĀIMPLEMENTĒ 3. fāze kā papildinošs izlaidums, kas ietver: ERC_8004 identitātes verifikāciju un reputācijas pārbaudes, MCP Serveri, A2A Aģenta Karti, Strīdu Servisu (ADP-saderīgu) un atbilstības ziņojumus ar blokķēdes verifikāciju
4. KAD 2. fāzes funkcijas tiek izvietotas, Platformai JĀUZTUR atpakaļsaderība ar visiem 1. fāzes API galapunktiem un datu struktūrām
5. KAD 3. fāzes funkcijas tiek izvietotas, Platformai JĀUZTUR atpakaļsaderība ar visiem 1. un 2. fāzes API galapunktiem un datu struktūrām

---

*Šis dokuments ir pilns Amber Protocol pamata platformas prasību specifikācijas tulkojums latviešu valodā.*
