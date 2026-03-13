# Amber Protocol — Terminu Glosārijs

**Amber Protocol pamata platformas galveno terminu skaidrojumi**

---

- **Platform** (Platforma): Amber Protocol pamata platforma — visi aizmugures servisi, API, viedie līgumi (smart contracts) un tīmekļa portāli

- **Contract_Engine** (Līgumu Dzinējs): Galvenais serviss, kas atbild par Rikārda līgumu izveidi, hešošanu, glabāšanu, versiju pārvaldību un dzīves cikla vadību

- **Ricardian_Contract** (Rikārda Līgums): Digitāls līgums, kas vienlaicīgi ir cilvēklasāms (jurists var to pārskatīt), mašīnlasāms (aģents var iegūt nosacījumus kā JSON) un kriptogrāfiski parakstīts (SHA-256 heša saite savieno abus formātus ar nemainīgu ierakstu blokķēdē)

- **Delegation_Contract** (Deleģēšanas Līgums): Rikārda līgums, kas pilnvaro MI aģentu rīkoties uzņēmuma vai personas vārdā noteiktos ietvaros — tēriņu limiti, darbību apjoms, kategoriju ierobežojumi, darījumu partneru prasības un atbildības nosacījumi. Funkcionē kā "Pilnvara MI aģentiem"

- **Commerce_Contract** (Komercijas Līgums): Rikārda līgums, kas tiek izveidots, kad aģents veic pirkumu, paraksta pakalpojumu līgumu vai vienojas par piegādātāja nosacījumiem uzņēmuma vārdā

- **Principal_Declaration** (Pilnvardevēja Deklarācija): Obligāts lauks katrā Rikārda līgumā, kas norāda cilvēku vai uzņēmumu aiz MI aģenta kā līgumslēdzēju pusi — nepieciešams, jo MI aģentiem pašlaik nav juridiskas personas statusa

- **cNFT** (Līguma NFT): NFT, kas tiek kalts (minted) Base L2 blokķēdē katram izpildītam līgumam. Satur metadatus, kas norāda uz līguma cilvēklasāmo tekstu un mašīnlasāmiem nosacījumiem IPFS. Kalpo kā nemainīgs, nododams līguma pierādījums

- **Amendment_Chain** (Grozījumu Ķēde): Saistīta cNFT secība, kurā grozījumi un papildinājumi atsaucas uz sākotnējo līgumu caur `parent_contract_hash`, veidojot izsekojamu vēsturi

- **Template_System** (Veidņu Sistēma): Juridiski pārbaudītu, parametrizētu Rikārda līgumu veidņu bibliotēka tipiskām deleģēšanas un komercijas situācijām

- **Reader_Portal** (Lasītāja Portāls): Publisks tīmekļa portāls, kurā ikviens ar NFT ID vai līguma hešu var apskatīt, verificēt (blokķēdes heša salīdzināšana), auditēt, drukāt/eksportēt PDF un sekot līgumu Grozījumu Ķēdei

- **Agent_API** (Aģentu API): RESTful API, kas ļauj MI aģentiem programmatiski izveidot, parakstīt, vaicāt, verificēt pilnvarojumu un pārvaldīt līgumus

- **Dashboard** (Vadības Panelis): Cilvēkiem paredzēts tīmekļa portāls līgumu pārraudzībai, aģentu pārvaldībai, veidņu pārvaldībai un atbilstības ziņojumiem

- **LLM_Generator** (LLM Ģenerators): Serviss, kas pārveido dabiskās valodas aprakstus divformātu Rikārda līgumos (cilvēklasāms teksts + mašīnlasāms JSON)

- **Dynamic_API_Key_Mapping** (Dinamiskā API Atslēgu Kartēšana): Sistēma, kas savieno Web3 makus ar Web2 API piekļuvi: maka paraksts → cNFT kalšana → API atslēgas ģenerēšana → iekšējā kartēšana API_KEY → cNFT_ID → Wallet_Address

- **ERC_8004**: Ethereum standarts (aktīvs kopš 2026. gada janvāra), kas definē Identitātes reģistru, Reputācijas reģistru un Validācijas reģistru MI aģentiem. Izmantots maka-kā-identitātes verifikācijai un reputācijas novērtēšanai

- **x402_V2**: Coinbase/Cloudflare maksājumu protokols (V2, 2025. gada decembris) ar modulāru spraudņu arhitektūru, maka sesijām (CAIP-122) un vairāku ķēžu atbalstu. Amber iestrādā līgumu hešus x402 maksājumu metadatos kā paplašinājumu

- **ADP** (Aģentu Strīdu Protokols): IETF Agentic Dispute Protocol — topošs standarts, kas definē ziņojumu formātus, pierādījumu iesniegšanas standartus, kriptogrāfiskā pierādījuma prasības, pierādījumu ķēdes izsekošanu un divformātu lēmumus (JSON + PDF) aģentu strīdu risināšanai

- **MCP_Server** (MCP Serveris): Model Context Protocol serveris, kas atklāj Amber līgumu iespējas kā MCP rīkus, lai MI aģenti varētu atrast veidnes un parakstīt līgumus caur MCP rīku izsaukumiem

- **A2A_Agent_Card** (A2A Aģenta Karte): Google A2A protokola atklāšanas karte, kas apraksta Amber iespējas, lai citi aģenti varētu atrast un mijiedarboties ar platformu

- **IPFS** (Starpplanētu Failu Sistēma): InterPlanetary File System — decentralizēta glabātuve, kas izmantota nemainīgai cilvēklasāmā līguma teksta un cNFT metadatu JSON saglabāšanai

- **Base_L2**: Coinbase Layer 2 blokķēde (Ethereum rollup), kas izmantota cNFT kalšanai ar gāzes izmaksām zem $0.01

- **Supabase**: PostgreSQL-kā-serviss, kas nodrošina relāciju datubāzi, autentifikāciju un API slāni. Sākotnējai izvietošanai izmantots bezmaksas līmenis

- **Dispute_Service** (Strīdu Serviss): ADP-saderīgs serviss, kas apstrādā strīdu ierosināšanu, pierādījumu iesniegšanu, šķīrējtiesas darbplūsmu un lēmumu izsekošanu

- **Contract_Hash** (Līguma Hešs): SHA-256 kriptogrāfiskais hešs no cilvēklasāmā līguma teksta, kas kalpo kā mašīnlasāms identifikators, savienojot juridisko tekstu ar ierakstu blokķēdē

- **Concerto**: Accord Project atvērtā koda datu modeļa valoda viedajiem juridiskajiem līgumiem, kas tiek izvērtēta kā pamats Amber veidņu parametru shēmai

- **Nevermined**: x402 starpnieks, kas apstrādā autorizāciju, mērīšanu un norēķinus MI aģentiem, ar Python un TypeScript SDK

---

*Šis glosārijs ir daļa no Amber Protocol pamata platformas prasību specifikācijas.*
