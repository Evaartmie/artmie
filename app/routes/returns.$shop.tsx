import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { prisma } from "../db.server";
import { useState } from "react";

// Map of URL slugs to myshopify domains
const SHOP_SLUGS: Record<string, string> = {
  "papilora-sk": "papilora.myshopify.com",
  "papilora-cz": "papilora-cz.myshopify.com",
  "papilora-hu": "papilora-hu.myshopify.com",
  "papilora-pl": "papilora-pl.myshopify.com",
  "papilora-ro": "papilora-ro.myshopify.com",
  "papilora-bg": "papilora-bg.myshopify.com",
  "papilora-hr": "papilora-hr.myshopify.com",
  "papilora-ba": "papilora-ba.myshopify.com",
  "papilora-si": "papilora-si.myshopify.com",
  "papilora-gr": "papilora-gr.myshopify.com",
  "papilora-it": "papilora-it.myshopify.com",
  "artmie-sk": "artmie.myshopify.com",
  "artmie-cz": "artmie-cz.myshopify.com",
  "artmie-hu": "artmie-hu.myshopify.com",
  "artmie-pl": "artmie-pl.myshopify.com",
  "artmie-ro": "artmie-ro.myshopify.com",
  "artmie-bg": "artmie-bg.myshopify.com",
  "artmie-de": "artmie-de.myshopify.com",
  "artmie-ba": "artmie-ba.myshopify.com",
  "artmie-rs": "artmie-rs.myshopify.com",
  "artmie-si": "artmie-si.myshopify.com",
  "artmie-gr": "artmie-gr.myshopify.com",
  "artmie-it": "artmie-it.myshopify.com",
};

const SHOP_NAMES: Record<string, string> = {
  "papilora-sk": "Papilora SK",
  "papilora-cz": "Papilora CZ",
  "papilora-hu": "Papilora HU",
  "papilora-pl": "Papilora PL",
  "papilora-ro": "Papilora RO",
  "papilora-bg": "Papilora BG",
  "papilora-hr": "Papilora HR",
  "papilora-ba": "Papilora BA",
  "papilora-si": "Papilora SI",
  "papilora-gr": "Papilora GR",
  "papilora-it": "Papilora IT",
  "artmie-sk": "Artmie SK",
  "artmie-cz": "Artmie CZ",
  "artmie-hu": "Artmie HU",
  "artmie-pl": "Artmie PL",
  "artmie-ro": "Artmie RO",
  "artmie-bg": "Artmie BG",
  "artmie-de": "Artmie DE",
  "artmie-ba": "Artmie BA",
  "artmie-rs": "Artmie RS",
  "artmie-si": "Artmie SI",
  "artmie-gr": "Artmie GR",
  "artmie-it": "Artmie IT",
};

// Language mapping per shop slug suffix
const SHOP_LANG: Record<string, string> = {
  "sk": "sk", "cz": "cs", "hu": "hu", "pl": "pl", "ro": "ro",
  "bg": "bg", "hr": "hr", "ba": "bs", "de": "de", "rs": "sr",
  "si": "sl", "gr": "el", "it": "it",
};

function getLang(slug: string): string {
  const suffix = slug.split("-").pop() || "";
  return SHOP_LANG[suffix] || "en";
}

// ──── Translations ────
type Translations = {
  pageTitle: string;
  findOrder: string;
  orderNumber: string;
  orderNumberPlaceholder: string;
  emailLabel: string;
  emailPlaceholder: string;
  searchButton: string;
  searching: string;
  selectProducts: string;
  returnReason: string;
  selectReason: string;
  descriptionOptional: string;
  describeProblem: string;
  photosLabel: string;
  addPhoto: string;
  ibanLabel: string;
  noteOptional: string;
  notePlaceholder: string;
  submitButton: string;
  submitting: string;
  product: string;
  products: string;
  successTitle: string;
  successMessage: string;
  backToStore: string;
  storeNotFound: string;
  checkUrl: string;
  emailMismatch: string;
  selectAtLeastOne: string;
  existingReturn: string;
  orderNotFound: string;
  enterBoth: string;
  // Reason categories
  catClaim: string;        // Reklamácia
  catReturn: string;       // Vrátenie
  catExchange: string;     // Výmena
  claimWrongProduct: string;
  claimMissing: string;
  claimDamaged: string;
  claimLowQuality: string;
  return14days: string;
  return30days: string;
  return100days: string;
  exchangeLabel: string;
  exchangeProductCode: string;
  exchangeProductPrice: string;
  exchangeQuantity: string;
  // Legacy fallback
  reasonDamaged: string;
  reasonWrongItem: string;
  reasonNotAsDescribed: string;
  reasonChangedMind: string;
  reasonDefective: string;
  reasonOther: string;
};

const TRANSLATIONS: Record<string, Translations> = {
  sk: {
    pageTitle: "Žiadosť o vrátenie tovaru",
    findOrder: "Vyhľadajte vašu objednávku",
    orderNumber: "Číslo objednávky",
    orderNumberPlaceholder: "napr. 75501019",
    emailLabel: "Email použitý pri objednávke",
    emailPlaceholder: "vas@email.com",
    searchButton: "Vyhľadať objednávku",
    searching: "Vyhľadávam...",
    selectProducts: "Vyberte produkty na vrátenie:",
    returnReason: "Dôvod vrátenia:",
    selectReason: "Vyberte dôvod...",
    descriptionOptional: "Popis (voliteľné):",
    describeProblem: "Opíšte problém...",
    photosLabel: "Fotky poškodenia (max 4):",
    addPhoto: "Pridať foto",
    ibanLabel: "IBAN (číslo účtu pre vrátenie peňazí)",
    noteOptional: "Poznámka (voliteľné)",
    notePlaceholder: "Doplňujúce informácie...",
    submitButton: "Odoslať žiadosť",
    submitting: "Odosielam...",
    product: "produkt",
    products: "produkty",
    successTitle: "Žiadosť odoslaná!",
    successMessage: "Vašu žiadosť o vrátenie sme prijali. O stave vás budeme informovať emailom.",
    backToStore: "Späť do obchodu",
    storeNotFound: "Obchod nebol nájdený",
    checkUrl: "Skontrolujte URL adresu.",
    emailMismatch: "Email sa nezhoduje s objednávkou.",
    selectAtLeastOne: "Vyberte aspoň jeden produkt na vrátenie.",
    existingReturn: "Pre túto objednávku už existuje žiadosť o vrátenie.",
    orderNotFound: "Objednávka nebola nájdená.",
    enterBoth: "Zadajte číslo objednávky aj email.",
    catClaim: "Reklamácia",
    catReturn: "Vrátenie tovaru",
    catExchange: "Výmena tovaru",
    claimWrongProduct: "Odoslaný nesprávny produkt",
    claimMissing: "Chýbajúci (nedoručený) produkt",
    claimDamaged: "Poškodený produkt",
    claimLowQuality: "Nekvalitný produkt",
    return14days: "Odstúpenie od zmluvy do 14 dní",
    return30days: "Vrátenie tovaru do 30 dní",
    return100days: "Vrátenie tovaru do 100 dní",
    exchangeLabel: "Výmena tovaru",
    exchangeProductCode: "Kód nového produktu",
    exchangeProductPrice: "Cena nového produktu",
    exchangeQuantity: "Počet kusov",
    reasonDamaged: "Poškodený tovar",
    reasonWrongItem: "Nesprávny tovar",
    reasonNotAsDescribed: "Tovar nezodpovedá popisu",
    reasonChangedMind: "Rozmyslel/a som si",
    reasonDefective: "Chybný/nefunkčný tovar",
    reasonOther: "Iný dôvod",
  },
  cs: {
    pageTitle: "Žádost o vrácení zboží",
    findOrder: "Vyhledejte vaši objednávku",
    orderNumber: "Číslo objednávky",
    orderNumberPlaceholder: "např. 75501019",
    emailLabel: "Email použitý při objednávce",
    emailPlaceholder: "vas@email.com",
    searchButton: "Vyhledat objednávku",
    searching: "Vyhledávám...",
    selectProducts: "Vyberte produkty k vrácení:",
    returnReason: "Důvod vrácení:",
    selectReason: "Vyberte důvod...",
    descriptionOptional: "Popis (volitelné):",
    describeProblem: "Popište problém...",
    photosLabel: "Fotky poškození (max 4):",
    addPhoto: "Přidat foto",
    ibanLabel: "IBAN (číslo účtu pro vrácení peněz)",
    noteOptional: "Poznámka (volitelné)",
    notePlaceholder: "Doplňující informace...",
    submitButton: "Odeslat žádost",
    submitting: "Odesílám...",
    product: "produkt",
    products: "produkty",
    successTitle: "Žádost odeslána!",
    successMessage: "Vaši žádost o vrácení jsme přijali. O stavu vás budeme informovat emailem.",
    backToStore: "Zpět do obchodu",
    storeNotFound: "Obchod nebyl nalezen",
    checkUrl: "Zkontrolujte URL adresu.",
    emailMismatch: "Email se neshoduje s objednávkou.",
    selectAtLeastOne: "Vyberte alespoň jeden produkt k vrácení.",
    existingReturn: "Pro tuto objednávku již existuje žádost o vrácení.",
    orderNotFound: "Objednávka nebyla nalezena.",
    enterBoth: "Zadejte číslo objednávky i email.",
    catClaim: "Reklamace",
    catReturn: "Vrácení zboží",
    catExchange: "Výměna zboží",
    claimWrongProduct: "Odeslaný nesprávný produkt",
    claimMissing: "Chybějící (nedoručený) produkt",
    claimDamaged: "Poškozený produkt",
    claimLowQuality: "Nekvalitní produkt",
    return14days: "Odstoupení od smlouvy do 14 dnů",
    return30days: "Vrácení zboží do 30 dnů",
    return100days: "Vrácení zboží do 100 dnů",
    exchangeLabel: "Výměna zboží",
    exchangeProductCode: "Kód nového produktu",
    exchangeProductPrice: "Cena nového produktu",
    exchangeQuantity: "Počet kusů",
    reasonDamaged: "Poškozené zboží",
    reasonWrongItem: "Nesprávné zboží",
    reasonNotAsDescribed: "Zboží neodpovídá popisu",
    reasonChangedMind: "Rozmyslel/a jsem si",
    reasonDefective: "Vadné/nefunkční zboží",
    reasonOther: "Jiný důvod",
  },
  hu: {
    pageTitle: "Visszaküldési kérelem",
    findOrder: "Keresse meg rendelését",
    orderNumber: "Rendelési szám",
    orderNumberPlaceholder: "pl. 75501019",
    emailLabel: "A rendeléshez használt email",
    emailPlaceholder: "az@email.com",
    searchButton: "Rendelés keresése",
    searching: "Keresés...",
    selectProducts: "Válassza ki a visszaküldendő termékeket:",
    returnReason: "Visszaküldés oka:",
    selectReason: "Válasszon okot...",
    descriptionOptional: "Leírás (opcionális):",
    describeProblem: "Írja le a problémát...",
    photosLabel: "Sérülés fotói (max 4):",
    addPhoto: "Fotó hozzáadása",
    ibanLabel: "IBAN (bankszámlaszám a visszatérítéshez)",
    noteOptional: "Megjegyzés (opcionális)",
    notePlaceholder: "További információk...",
    submitButton: "Kérelem elküldése",
    submitting: "Küldés...",
    product: "termék",
    products: "termékek",
    successTitle: "Kérelem elküldve!",
    successMessage: "Visszaküldési kérelmét megkaptuk. Az állapotáról emailben értesítjük.",
    backToStore: "Vissza a boltba",
    storeNotFound: "A bolt nem található",
    checkUrl: "Ellenőrizze az URL címet.",
    emailMismatch: "Az email nem egyezik a rendeléssel.",
    selectAtLeastOne: "Válasszon ki legalább egy terméket.",
    existingReturn: "Ehhez a rendeléshez már létezik visszaküldési kérelem.",
    orderNotFound: "A rendelés nem található.",
    enterBoth: "Adja meg a rendelési számot és az emailt.",
    catClaim: "Reklamáció",
    catReturn: "Visszaküldés",
    catExchange: "Csere",
    claimWrongProduct: "Rossz termék érkezett",
    claimMissing: "Hiányzó (nem kézbesített) termék",
    claimDamaged: "Sérült termék",
    claimLowQuality: "Gyenge minőségű termék",
    return14days: "Elállás a szerződéstől 14 napon belül",
    return30days: "Visszaküldés 30 napon belül",
    return100days: "Visszaküldés 100 napon belül",
    exchangeLabel: "Termékcsere",
    exchangeProductCode: "Új termék kódja",
    exchangeProductPrice: "Új termék ára",
    exchangeQuantity: "Darabszám",
    reasonDamaged: "Sérült áru",
    reasonWrongItem: "Hibás termék érkezett",
    reasonNotAsDescribed: "Nem felel meg a leírásnak",
    reasonChangedMind: "Meggondoltam magam",
    reasonDefective: "Hibás/nem működő termék",
    reasonOther: "Egyéb ok",
  },
  pl: {
    pageTitle: "Wniosek o zwrot towaru",
    findOrder: "Wyszukaj swoje zamówienie",
    orderNumber: "Numer zamówienia",
    orderNumberPlaceholder: "np. 75501019",
    emailLabel: "Email użyty przy zamówieniu",
    emailPlaceholder: "twoj@email.com",
    searchButton: "Wyszukaj zamówienie",
    searching: "Wyszukiwanie...",
    selectProducts: "Wybierz produkty do zwrotu:",
    returnReason: "Powód zwrotu:",
    selectReason: "Wybierz powód...",
    descriptionOptional: "Opis (opcjonalnie):",
    describeProblem: "Opisz problem...",
    photosLabel: "Zdjęcia uszkodzenia (max 4):",
    addPhoto: "Dodaj zdjęcie",
    ibanLabel: "IBAN (numer konta do zwrotu pieniędzy)",
    noteOptional: "Uwaga (opcjonalnie)",
    notePlaceholder: "Dodatkowe informacje...",
    submitButton: "Wyślij wniosek",
    submitting: "Wysyłanie...",
    product: "produkt",
    products: "produkty",
    successTitle: "Wniosek wysłany!",
    successMessage: "Twój wniosek o zwrot został przyjęty. O statusie poinformujemy Cię emailem.",
    backToStore: "Wróć do sklepu",
    storeNotFound: "Sklep nie został znaleziony",
    checkUrl: "Sprawdź adres URL.",
    emailMismatch: "Email nie pasuje do zamówienia.",
    selectAtLeastOne: "Wybierz co najmniej jeden produkt do zwrotu.",
    existingReturn: "Dla tego zamówienia już istnieje wniosek o zwrot.",
    orderNotFound: "Zamówienie nie zostało znalezione.",
    enterBoth: "Podaj numer zamówienia i email.",
    catClaim: "Reklamacja",
    catReturn: "Zwrot towaru",
    catExchange: "Wymiana towaru",
    claimWrongProduct: "Wysłano niewłaściwy produkt",
    claimMissing: "Brakujący (niedostarczony) produkt",
    claimDamaged: "Uszkodzony produkt",
    claimLowQuality: "Produkt niskiej jakości",
    return14days: "Odstąpienie od umowy do 14 dni",
    return30days: "Zwrot towaru do 30 dni",
    return100days: "Zwrot towaru do 100 dni",
    exchangeLabel: "Wymiana towaru",
    exchangeProductCode: "Kod nowego produktu",
    exchangeProductPrice: "Cena nowego produktu",
    exchangeQuantity: "Ilość sztuk",
    reasonDamaged: "Uszkodzony towar",
    reasonWrongItem: "Niewłaściwy towar",
    reasonNotAsDescribed: "Towar niezgodny z opisem",
    reasonChangedMind: "Zmieniłem/am zdanie",
    reasonDefective: "Wadliwy towar",
    reasonOther: "Inny powód",
  },
  ro: {
    pageTitle: "Cerere de returnare",
    findOrder: "Căutați comanda dvs.",
    orderNumber: "Numărul comenzii",
    orderNumberPlaceholder: "ex. 75501019",
    emailLabel: "Emailul folosit la comandă",
    emailPlaceholder: "dvs@email.com",
    searchButton: "Caută comanda",
    searching: "Se caută...",
    selectProducts: "Selectați produsele pentru returnare:",
    returnReason: "Motivul returnării:",
    selectReason: "Selectați motivul...",
    descriptionOptional: "Descriere (opțional):",
    describeProblem: "Descrieți problema...",
    photosLabel: "Fotografii deteriorare (max 4):",
    addPhoto: "Adaugă foto",
    ibanLabel: "IBAN (cont bancar pentru rambursare)",
    noteOptional: "Notă (opțional)",
    notePlaceholder: "Informații suplimentare...",
    submitButton: "Trimite cererea",
    submitting: "Se trimite...",
    product: "produs",
    products: "produse",
    successTitle: "Cerere trimisă!",
    successMessage: "Cererea dvs. de returnare a fost primită. Vă vom informa prin email despre status.",
    backToStore: "Înapoi la magazin",
    storeNotFound: "Magazinul nu a fost găsit",
    checkUrl: "Verificați adresa URL.",
    emailMismatch: "Emailul nu corespunde cu comanda.",
    selectAtLeastOne: "Selectați cel puțin un produs pentru returnare.",
    existingReturn: "Pentru această comandă există deja o cerere de returnare.",
    orderNotFound: "Comanda nu a fost găsită.",
    enterBoth: "Introduceți numărul comenzii și emailul.",
    catClaim: "Reclamație",
    catReturn: "Returnare produs",
    catExchange: "Schimb produs",
    claimWrongProduct: "Produs trimis greșit",
    claimMissing: "Produs lipsă (nelivrat)",
    claimDamaged: "Produs deteriorat",
    claimLowQuality: "Produs de calitate slabă",
    return14days: "Retragere din contract în 14 zile",
    return30days: "Returnare produs în 30 zile",
    return100days: "Returnare produs în 100 zile",
    exchangeLabel: "Schimb produs",
    exchangeProductCode: "Codul noului produs",
    exchangeProductPrice: "Prețul noului produs",
    exchangeQuantity: "Cantitate",
    reasonDamaged: "Produs deteriorat",
    reasonWrongItem: "Produs greșit",
    reasonNotAsDescribed: "Produsul nu corespunde descrierii",
    reasonChangedMind: "M-am răzgândit",
    reasonDefective: "Produs defect",
    reasonOther: "Alt motiv",
  },
  bg: {
    pageTitle: "Заявка за връщане",
    findOrder: "Намерете вашата поръчка",
    orderNumber: "Номер на поръчката",
    orderNumberPlaceholder: "напр. 75501019",
    emailLabel: "Имейл от поръчката",
    emailPlaceholder: "vash@email.com",
    searchButton: "Търси поръчка",
    searching: "Търсене...",
    selectProducts: "Изберете продукти за връщане:",
    returnReason: "Причина за връщане:",
    selectReason: "Изберете причина...",
    descriptionOptional: "Описание (по избор):",
    describeProblem: "Опишете проблема...",
    photosLabel: "Снимки на повредата (макс. 4):",
    addPhoto: "Добави снимка",
    ibanLabel: "IBAN (банкова сметка за възстановяване)",
    noteOptional: "Бележка (по избор)",
    notePlaceholder: "Допълнителна информация...",
    submitButton: "Изпрати заявка",
    submitting: "Изпращане...",
    product: "продукт",
    products: "продукти",
    successTitle: "Заявката е изпратена!",
    successMessage: "Вашата заявка за връщане е получена. Ще ви уведомим по имейл за статуса.",
    backToStore: "Обратно към магазина",
    storeNotFound: "Магазинът не е намерен",
    checkUrl: "Проверете URL адреса.",
    emailMismatch: "Имейлът не съвпада с поръчката.",
    selectAtLeastOne: "Изберете поне един продукт за връщане.",
    existingReturn: "За тази поръчка вече съществува заявка за връщане.",
    orderNotFound: "Поръчката не е намерена.",
    enterBoth: "Въведете номер на поръчката и имейл.",
    catClaim: "Рекламация",
    catReturn: "Връщане на стока",
    catExchange: "Замяна на стока",
    claimWrongProduct: "Изпратен грешен продукт",
    claimMissing: "Липсващ (недоставен) продукт",
    claimDamaged: "Повреден продукт",
    claimLowQuality: "Некачествен продукт",
    return14days: "Отказ от договор до 14 дни",
    return30days: "Връщане на стока до 30 дни",
    return100days: "Връщане на стока до 100 дни",
    exchangeLabel: "Замяна на стока",
    exchangeProductCode: "Код на нов продукт",
    exchangeProductPrice: "Цена на нов продукт",
    exchangeQuantity: "Брой",
    reasonDamaged: "Повреден продукт",
    reasonWrongItem: "Грешен продукт",
    reasonNotAsDescribed: "Продуктът не отговаря на описанието",
    reasonChangedMind: "Промених решението си",
    reasonDefective: "Дефектен продукт",
    reasonOther: "Друга причина",
  },
  hr: {
    pageTitle: "Zahtjev za povrat",
    findOrder: "Pronađite svoju narudžbu",
    orderNumber: "Broj narudžbe",
    orderNumberPlaceholder: "npr. 75501019",
    emailLabel: "Email korišten pri narudžbi",
    emailPlaceholder: "vas@email.com",
    searchButton: "Pretraži narudžbu",
    searching: "Pretraživanje...",
    selectProducts: "Odaberite proizvode za povrat:",
    returnReason: "Razlog povrata:",
    selectReason: "Odaberite razlog...",
    descriptionOptional: "Opis (opcionalno):",
    describeProblem: "Opišite problem...",
    photosLabel: "Fotografije oštećenja (max 4):",
    addPhoto: "Dodaj fotografiju",
    ibanLabel: "IBAN (bankovni račun za povrat novca)",
    noteOptional: "Napomena (opcionalno)",
    notePlaceholder: "Dodatne informacije...",
    submitButton: "Pošalji zahtjev",
    submitting: "Šaljem...",
    product: "proizvod",
    products: "proizvodi",
    successTitle: "Zahtjev poslan!",
    successMessage: "Vaš zahtjev za povrat je zaprimljen. O statusu ćemo vas obavijestiti emailom.",
    backToStore: "Natrag u trgovinu",
    storeNotFound: "Trgovina nije pronađena",
    checkUrl: "Provjerite URL adresu.",
    emailMismatch: "Email se ne podudara s narudžbom.",
    selectAtLeastOne: "Odaberite barem jedan proizvod za povrat.",
    existingReturn: "Za ovu narudžbu već postoji zahtjev za povrat.",
    orderNotFound: "Narudžba nije pronađena.",
    enterBoth: "Unesite broj narudžbe i email.",
    catClaim: "Reklamacija",
    catReturn: "Povrat robe",
    catExchange: "Zamjena robe",
    claimWrongProduct: "Poslan pogrešan proizvod",
    claimMissing: "Nedostajući (neisporučen) proizvod",
    claimDamaged: "Oštećen proizvod",
    claimLowQuality: "Nekvalitetan proizvod",
    return14days: "Odustajanje od ugovora do 14 dana",
    return30days: "Povrat robe do 30 dana",
    return100days: "Povrat robe do 100 dana",
    exchangeLabel: "Zamjena robe",
    exchangeProductCode: "Šifra novog proizvoda",
    exchangeProductPrice: "Cijena novog proizvoda",
    exchangeQuantity: "Količina",
    reasonDamaged: "Oštećen proizvod",
    reasonWrongItem: "Pogrešan proizvod",
    reasonNotAsDescribed: "Proizvod ne odgovara opisu",
    reasonChangedMind: "Predomislio/la sam se",
    reasonDefective: "Neispravan proizvod",
    reasonOther: "Drugi razlog",
  },
  bs: {
    pageTitle: "Zahtjev za povrat",
    findOrder: "Pronađite svoju narudžbu",
    orderNumber: "Broj narudžbe",
    orderNumberPlaceholder: "npr. 75501019",
    emailLabel: "Email korišten pri narudžbi",
    emailPlaceholder: "vas@email.com",
    searchButton: "Pretraži narudžbu",
    searching: "Pretraživanje...",
    selectProducts: "Odaberite proizvode za povrat:",
    returnReason: "Razlog povrata:",
    selectReason: "Odaberite razlog...",
    descriptionOptional: "Opis (opcionalno):",
    describeProblem: "Opišite problem...",
    photosLabel: "Fotografije oštećenja (max 4):",
    addPhoto: "Dodaj fotografiju",
    ibanLabel: "IBAN (bankovni račun za povrat novca)",
    noteOptional: "Napomena (opcionalno)",
    notePlaceholder: "Dodatne informacije...",
    submitButton: "Pošalji zahtjev",
    submitting: "Šaljem...",
    product: "proizvod",
    products: "proizvodi",
    successTitle: "Zahtjev poslan!",
    successMessage: "Vaš zahtjev za povrat je zaprimljen. O statusu ćemo vas obavijestiti emailom.",
    backToStore: "Nazad u trgovinu",
    storeNotFound: "Trgovina nije pronađena",
    checkUrl: "Provjerite URL adresu.",
    emailMismatch: "Email se ne podudara s narudžbom.",
    selectAtLeastOne: "Odaberite barem jedan proizvod za povrat.",
    existingReturn: "Za ovu narudžbu već postoji zahtjev za povrat.",
    orderNotFound: "Narudžba nije pronađena.",
    enterBoth: "Unesite broj narudžbe i email.",
    catClaim: "Reklamacija",
    catReturn: "Povrat robe",
    catExchange: "Zamjena robe",
    claimWrongProduct: "Poslan pogrešan proizvod",
    claimMissing: "Nedostajući (neisporučen) proizvod",
    claimDamaged: "Oštećen proizvod",
    claimLowQuality: "Nekvalitetan proizvod",
    return14days: "Odustajanje od ugovora do 14 dana",
    return30days: "Povrat robe do 30 dana",
    return100days: "Povrat robe do 100 dana",
    exchangeLabel: "Zamjena robe",
    exchangeProductCode: "Šifra novog proizvoda",
    exchangeProductPrice: "Cijena novog proizvoda",
    exchangeQuantity: "Količina",
    reasonDamaged: "Oštećen proizvod",
    reasonWrongItem: "Pogrešan proizvod",
    reasonNotAsDescribed: "Proizvod ne odgovara opisu",
    reasonChangedMind: "Predomislio/la sam se",
    reasonDefective: "Neispravan proizvod",
    reasonOther: "Drugi razlog",
  },
  de: {
    pageTitle: "Rückgabeantrag",
    findOrder: "Finden Sie Ihre Bestellung",
    orderNumber: "Bestellnummer",
    orderNumberPlaceholder: "z.B. 75501019",
    emailLabel: "Bei der Bestellung verwendete E-Mail",
    emailPlaceholder: "ihre@email.com",
    searchButton: "Bestellung suchen",
    searching: "Suche...",
    selectProducts: "Wählen Sie die Produkte zur Rückgabe:",
    returnReason: "Rückgabegrund:",
    selectReason: "Grund auswählen...",
    descriptionOptional: "Beschreibung (optional):",
    describeProblem: "Beschreiben Sie das Problem...",
    photosLabel: "Fotos des Schadens (max. 4):",
    addPhoto: "Foto hinzufügen",
    ibanLabel: "IBAN (Bankkonto für Rückerstattung)",
    noteOptional: "Anmerkung (optional)",
    notePlaceholder: "Zusätzliche Informationen...",
    submitButton: "Antrag absenden",
    submitting: "Wird gesendet...",
    product: "Produkt",
    products: "Produkte",
    successTitle: "Antrag gesendet!",
    successMessage: "Ihr Rückgabeantrag wurde empfangen. Wir informieren Sie per E-Mail über den Status.",
    backToStore: "Zurück zum Shop",
    storeNotFound: "Shop nicht gefunden",
    checkUrl: "Überprüfen Sie die URL-Adresse.",
    emailMismatch: "Die E-Mail stimmt nicht mit der Bestellung überein.",
    selectAtLeastOne: "Wählen Sie mindestens ein Produkt zur Rückgabe.",
    existingReturn: "Für diese Bestellung existiert bereits ein Rückgabeantrag.",
    orderNotFound: "Bestellung nicht gefunden.",
    enterBoth: "Geben Sie Bestellnummer und E-Mail ein.",
    catClaim: "Reklamation",
    catReturn: "Warenrückgabe",
    catExchange: "Warenaustausch",
    claimWrongProduct: "Falsches Produkt geliefert",
    claimMissing: "Fehlendes (nicht geliefertes) Produkt",
    claimDamaged: "Beschädigtes Produkt",
    claimLowQuality: "Produkt minderer Qualität",
    return14days: "Widerruf innerhalb von 14 Tagen",
    return30days: "Rückgabe innerhalb von 30 Tagen",
    return100days: "Rückgabe innerhalb von 100 Tagen",
    exchangeLabel: "Warenaustausch",
    exchangeProductCode: "Neuer Produktcode",
    exchangeProductPrice: "Neuer Produktpreis",
    exchangeQuantity: "Anzahl",
    reasonDamaged: "Beschädigte Ware",
    reasonWrongItem: "Falscher Artikel",
    reasonNotAsDescribed: "Entspricht nicht der Beschreibung",
    reasonChangedMind: "Meinung geändert",
    reasonDefective: "Defekter Artikel",
    reasonOther: "Anderer Grund",
  },
  sr: {
    pageTitle: "Захтев за повраћај",
    findOrder: "Пронађите вашу поруџбину",
    orderNumber: "Број поруџбине",
    orderNumberPlaceholder: "нпр. 75501019",
    emailLabel: "Имејл коришћен при поруџбини",
    emailPlaceholder: "vas@email.com",
    searchButton: "Претражи поруџбину",
    searching: "Претраживање...",
    selectProducts: "Изаберите производе за повраћај:",
    returnReason: "Разлог повраћаја:",
    selectReason: "Изаберите разлог...",
    descriptionOptional: "Опис (опционално):",
    describeProblem: "Опишите проблем...",
    photosLabel: "Фотографије оштећења (макс. 4):",
    addPhoto: "Додај фотографију",
    ibanLabel: "IBAN (банковни рачун за повраћај новца)",
    noteOptional: "Напомена (опционално)",
    notePlaceholder: "Додатне информације...",
    submitButton: "Пошаљи захтев",
    submitting: "Шаљем...",
    product: "производ",
    products: "производи",
    successTitle: "Захтев послат!",
    successMessage: "Ваш захтев за повраћај је примљен. О статусу ћемо вас обавестити имејлом.",
    backToStore: "Назад у продавницу",
    storeNotFound: "Продавница није пронађена",
    checkUrl: "Проверите URL адресу.",
    emailMismatch: "Имејл се не подудара са поруџбином.",
    selectAtLeastOne: "Изаберите бар један производ за повраћај.",
    existingReturn: "За ову поруџбину већ постоји захтев за повраћај.",
    orderNotFound: "Поруџбина није пронађена.",
    enterBoth: "Унесите број поруџбине и имејл.",
    catClaim: "Рекламација",
    catReturn: "Повраћај робе",
    catExchange: "Замена робе",
    claimWrongProduct: "Послат погрешан производ",
    claimMissing: "Недостајући (неиспоручен) производ",
    claimDamaged: "Оштећен производ",
    claimLowQuality: "Неквалитетан производ",
    return14days: "Одустајање од уговора до 14 дана",
    return30days: "Повраћај робе до 30 дана",
    return100days: "Повраћај робе до 100 дана",
    exchangeLabel: "Замена робе",
    exchangeProductCode: "Шифра новог производа",
    exchangeProductPrice: "Цена новог производа",
    exchangeQuantity: "Количина",
    reasonDamaged: "Оштећен производ",
    reasonWrongItem: "Погрешан производ",
    reasonNotAsDescribed: "Производ не одговара опису",
    reasonChangedMind: "Предомислио/ла сам се",
    reasonDefective: "Неисправан производ",
    reasonOther: "Други разлог",
  },
  sl: {
    pageTitle: "Zahtevek za vračilo",
    findOrder: "Poiščite vaše naročilo",
    orderNumber: "Številka naročila",
    orderNumberPlaceholder: "npr. 75501019",
    emailLabel: "Email uporabljen pri naročilu",
    emailPlaceholder: "vas@email.com",
    searchButton: "Poišči naročilo",
    searching: "Iskanje...",
    selectProducts: "Izberite izdelke za vračilo:",
    returnReason: "Razlog vračila:",
    selectReason: "Izberite razlog...",
    descriptionOptional: "Opis (neobvezno):",
    describeProblem: "Opišite problem...",
    photosLabel: "Fotografije poškodbe (max 4):",
    addPhoto: "Dodaj fotografijo",
    ibanLabel: "IBAN (bančni račun za vračilo denarja)",
    noteOptional: "Opomba (neobvezno)",
    notePlaceholder: "Dodatne informacije...",
    submitButton: "Pošlji zahtevek",
    submitting: "Pošiljam...",
    product: "izdelek",
    products: "izdelki",
    successTitle: "Zahtevek poslan!",
    successMessage: "Vaš zahtevek za vračilo je bil prejet. O statusu vas bomo obvestili po emailu.",
    backToStore: "Nazaj v trgovino",
    storeNotFound: "Trgovina ni najdena",
    checkUrl: "Preverite URL naslov.",
    emailMismatch: "Email se ne ujema z naročilom.",
    selectAtLeastOne: "Izberite vsaj en izdelek za vračilo.",
    existingReturn: "Za to naročilo že obstaja zahtevek za vračilo.",
    orderNotFound: "Naročilo ni najdeno.",
    enterBoth: "Vnesite številko naročila in email.",
    catClaim: "Reklamacija",
    catReturn: "Vračilo blaga",
    catExchange: "Zamenjava blaga",
    claimWrongProduct: "Poslan napačen izdelek",
    claimMissing: "Manjkajoči (nedostavljeni) izdelek",
    claimDamaged: "Poškodovan izdelek",
    claimLowQuality: "Izdelek slabe kakovosti",
    return14days: "Odstop od pogodbe do 14 dni",
    return30days: "Vračilo blaga do 30 dni",
    return100days: "Vračilo blaga do 100 dni",
    exchangeLabel: "Zamenjava blaga",
    exchangeProductCode: "Koda novega izdelka",
    exchangeProductPrice: "Cena novega izdelka",
    exchangeQuantity: "Količina",
    reasonDamaged: "Poškodovan izdelek",
    reasonWrongItem: "Napačen izdelek",
    reasonNotAsDescribed: "Izdelek ne ustreza opisu",
    reasonChangedMind: "Premislil/a sem si",
    reasonDefective: "Okvarjen izdelek",
    reasonOther: "Drug razlog",
  },
  el: {
    pageTitle: "Αίτηση επιστροφής",
    findOrder: "Βρείτε την παραγγελία σας",
    orderNumber: "Αριθμός παραγγελίας",
    orderNumberPlaceholder: "π.χ. 75501019",
    emailLabel: "Email που χρησιμοποιήθηκε στην παραγγελία",
    emailPlaceholder: "to@email.com",
    searchButton: "Αναζήτηση παραγγελίας",
    searching: "Αναζήτηση...",
    selectProducts: "Επιλέξτε προϊόντα για επιστροφή:",
    returnReason: "Λόγος επιστροφής:",
    selectReason: "Επιλέξτε λόγο...",
    descriptionOptional: "Περιγραφή (προαιρετικά):",
    describeProblem: "Περιγράψτε το πρόβλημα...",
    photosLabel: "Φωτογραφίες ζημιάς (μέγ. 4):",
    addPhoto: "Προσθήκη φωτο",
    ibanLabel: "IBAN (τραπεζικός λογαριασμός για επιστροφή χρημάτων)",
    noteOptional: "Σημείωση (προαιρετικά)",
    notePlaceholder: "Πρόσθετες πληροφορίες...",
    submitButton: "Υποβολή αιτήματος",
    submitting: "Υποβολή...",
    product: "προϊόν",
    products: "προϊόντα",
    successTitle: "Το αίτημα υποβλήθηκε!",
    successMessage: "Το αίτημα επιστροφής σας ελήφθη. Θα σας ενημερώσουμε μέσω email για την κατάσταση.",
    backToStore: "Πίσω στο κατάστημα",
    storeNotFound: "Το κατάστημα δεν βρέθηκε",
    checkUrl: "Ελέγξτε τη διεύθυνση URL.",
    emailMismatch: "Το email δεν ταιριάζει με την παραγγελία.",
    selectAtLeastOne: "Επιλέξτε τουλάχιστον ένα προϊόν για επιστροφή.",
    existingReturn: "Υπάρχει ήδη αίτημα επιστροφής για αυτή την παραγγελία.",
    orderNotFound: "Η παραγγελία δεν βρέθηκε.",
    enterBoth: "Εισάγετε τον αριθμό παραγγελίας και το email.",
    catClaim: "Αξίωση",
    catReturn: "Επιστροφή προϊόντος",
    catExchange: "Ανταλλαγή προϊόντος",
    claimWrongProduct: "Στάλθηκε λάθος προϊόν",
    claimMissing: "Ελλιπές (μη παραδοθέν) προϊόν",
    claimDamaged: "Κατεστραμμένο προϊόν",
    claimLowQuality: "Προϊόν χαμηλής ποιότητας",
    return14days: "Υπαναχώρηση εντός 14 ημερών",
    return30days: "Επιστροφή εντός 30 ημερών",
    return100days: "Επιστροφή εντός 100 ημερών",
    exchangeLabel: "Ανταλλαγή προϊόντος",
    exchangeProductCode: "Κωδικός νέου προϊόντος",
    exchangeProductPrice: "Τιμή νέου προϊόντος",
    exchangeQuantity: "Ποσότητα",
    reasonDamaged: "Κατεστραμμένο προϊόν",
    reasonWrongItem: "Λάθος προϊόν",
    reasonNotAsDescribed: "Δεν αντιστοιχεί στην περιγραφή",
    reasonChangedMind: "Άλλαξα γνώμη",
    reasonDefective: "Ελαττωματικό προϊόν",
    reasonOther: "Άλλος λόγος",
  },
  it: {
    pageTitle: "Richiesta di reso",
    findOrder: "Trova il tuo ordine",
    orderNumber: "Numero ordine",
    orderNumberPlaceholder: "es. 75501019",
    emailLabel: "Email utilizzata nell'ordine",
    emailPlaceholder: "tuo@email.com",
    searchButton: "Cerca ordine",
    searching: "Ricerca...",
    selectProducts: "Seleziona i prodotti da restituire:",
    returnReason: "Motivo del reso:",
    selectReason: "Seleziona motivo...",
    descriptionOptional: "Descrizione (facoltativo):",
    describeProblem: "Descrivi il problema...",
    photosLabel: "Foto del danno (max 4):",
    addPhoto: "Aggiungi foto",
    ibanLabel: "IBAN (conto bancario per il rimborso)",
    noteOptional: "Nota (facoltativo)",
    notePlaceholder: "Informazioni aggiuntive...",
    submitButton: "Invia richiesta",
    submitting: "Invio...",
    product: "prodotto",
    products: "prodotti",
    successTitle: "Richiesta inviata!",
    successMessage: "La tua richiesta di reso è stata ricevuta. Ti informeremo via email sullo stato.",
    backToStore: "Torna al negozio",
    storeNotFound: "Negozio non trovato",
    checkUrl: "Controlla l'indirizzo URL.",
    emailMismatch: "L'email non corrisponde all'ordine.",
    selectAtLeastOne: "Seleziona almeno un prodotto da restituire.",
    existingReturn: "Esiste già una richiesta di reso per questo ordine.",
    orderNotFound: "Ordine non trovato.",
    enterBoth: "Inserisci il numero dell'ordine e l'email.",
    catClaim: "Reclamo",
    catReturn: "Reso prodotto",
    catExchange: "Scambio prodotto",
    claimWrongProduct: "Prodotto sbagliato spedito",
    claimMissing: "Prodotto mancante (non consegnato)",
    claimDamaged: "Prodotto danneggiato",
    claimLowQuality: "Prodotto di bassa qualità",
    return14days: "Recesso dal contratto entro 14 giorni",
    return30days: "Reso entro 30 giorni",
    return100days: "Reso entro 100 giorni",
    exchangeLabel: "Scambio prodotto",
    exchangeProductCode: "Codice nuovo prodotto",
    exchangeProductPrice: "Prezzo nuovo prodotto",
    exchangeQuantity: "Quantità",
    reasonDamaged: "Prodotto danneggiato",
    reasonWrongItem: "Prodotto sbagliato",
    reasonNotAsDescribed: "Non corrisponde alla descrizione",
    reasonChangedMind: "Ho cambiato idea",
    reasonDefective: "Prodotto difettoso",
    reasonOther: "Altro motivo",
  },
  en: {
    pageTitle: "Return Request",
    findOrder: "Find your order",
    orderNumber: "Order number",
    orderNumberPlaceholder: "e.g. 75501019",
    emailLabel: "Email used for the order",
    emailPlaceholder: "your@email.com",
    searchButton: "Search order",
    searching: "Searching...",
    selectProducts: "Select products to return:",
    returnReason: "Return reason:",
    selectReason: "Select reason...",
    descriptionOptional: "Description (optional):",
    describeProblem: "Describe the problem...",
    photosLabel: "Photos of damage (max 4):",
    addPhoto: "Add photo",
    ibanLabel: "IBAN (bank account for refund)",
    noteOptional: "Note (optional)",
    notePlaceholder: "Additional information...",
    submitButton: "Submit request",
    submitting: "Submitting...",
    product: "product",
    products: "products",
    successTitle: "Request submitted!",
    successMessage: "Your return request has been received. We will notify you by email about the status.",
    backToStore: "Back to store",
    storeNotFound: "Store not found",
    checkUrl: "Check the URL address.",
    emailMismatch: "Email does not match the order.",
    selectAtLeastOne: "Select at least one product to return.",
    existingReturn: "A return request already exists for this order.",
    orderNotFound: "Order not found.",
    enterBoth: "Enter the order number and email.",
    catClaim: "Claim",
    catReturn: "Return",
    catExchange: "Exchange",
    claimWrongProduct: "Wrong product shipped",
    claimMissing: "Missing (undelivered) product",
    claimDamaged: "Damaged product",
    claimLowQuality: "Low quality product",
    return14days: "Withdrawal within 14 days",
    return30days: "Return within 30 days",
    return100days: "Return within 100 days",
    exchangeLabel: "Product exchange",
    exchangeProductCode: "New product code",
    exchangeProductPrice: "New product price",
    exchangeQuantity: "Quantity",
    reasonDamaged: "Damaged product",
    reasonWrongItem: "Wrong item",
    reasonNotAsDescribed: "Not as described",
    reasonChangedMind: "Changed my mind",
    reasonDefective: "Defective product",
    reasonOther: "Other reason",
  },
};

function getTranslations(slug: string): Translations {
  const lang = getLang(slug);
  return TRANSLATIONS[lang] || TRANSLATIONS.en;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const slug = params.shop || "";
  const shopDomain = SHOP_SLUGS[slug];
  const shopName = SHOP_NAMES[slug] || slug;

  const t = getTranslations(slug);
  const lang = getLang(slug);

  if (!shopDomain) {
    return json({ error: "Store not found", shopName: "", shopDomain: "", reasons: [], brandColor: "#333", t, lang });
  }

  const brandColor = slug.startsWith("papilora") ? "#6B2D8B" : "#D4A853";

  // Load return reasons for this store
  const reasons = await prisma.returnReason.findMany({
    where: { shop: shopDomain, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  return json({ error: null, shopName, shopDomain, reasons, brandColor, t, lang });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const slug = params.shop || "";
  const shopDomain = SHOP_SLUGS[slug];

  const t = getTranslations(slug);

  if (!shopDomain) {
    return json({ error: "Store not found", step: "lookup" });
  }

  // Step 1: Look up order
  if (intent === "lookup") {
    const orderNumber = (formData.get("orderNumber") as string || "").trim();
    const email = (formData.get("email") as string || "").trim().toLowerCase();

    if (!orderNumber || !email) {
      return json({ error: t.enterBoth, step: "lookup" });
    }

    // Get Shopify admin API access
    try {
      // Find ALL sessions for this shop
      const sessions = await prisma.session.findMany({
        where: { shop: shopDomain },
      });

      if (sessions.length === 0) {
        console.error(`No sessions found for ${shopDomain}`);
        return json({ error: t.orderNotFound, step: "lookup" });
      }

      // Try EVERY session token until one works
      let workingSession: any = null;
      let workingCount = 0;
      const triedTokens: string[] = [];

      for (const sess of sessions) {
        if (!sess.accessToken) continue;
        const tokenPreview = sess.accessToken.substring(0, 10) + "...";
        try {
          const testUrl = `https://${shopDomain}/admin/api/2025-04/orders/count.json?status=any`;
          const testResp = await fetch(testUrl, {
            headers: { "X-Shopify-Access-Token": sess.accessToken },
          });
          triedTokens.push(`${sess.id}=${testResp.status}`);
          if (testResp.status === 200) {
            const testData = await testResp.json();
            workingSession = sess;
            workingCount = testData.count || 0;
            break;
          }
        } catch (e) {
          triedTokens.push(`${sess.id}=error`);
        }
      }

      if (!workingSession) {
        console.error(`No working token for ${shopDomain}. Tried: ${triedTokens.join(", ")}`);
        return json({ error: t.orderNotFound, step: "lookup" });
      }

      const session = workingSession;
      const totalOrders = workingCount;
      const cleanNumber = orderNumber.replace(/^#/, '');

      const restUrl = `https://${shopDomain}/admin/api/2025-04/orders.json?name=${encodeURIComponent(cleanNumber)}&status=any&limit=1`;

      let response = await fetch(restUrl, {
        headers: { "X-Shopify-Access-Token": session.accessToken },
      });

      let data = await response.json();

      // If not found, try with # prefix
      if (!data.orders || data.orders.length === 0) {
        const restUrl2 = `https://${shopDomain}/admin/api/2025-04/orders.json?name=%23${encodeURIComponent(cleanNumber)}&status=any&limit=1`;
        response = await fetch(restUrl2, {
          headers: { "X-Shopify-Access-Token": session.accessToken },
        });
        data = await response.json();
      }

      let order = data.orders?.[0];

      if (!order) {
        return json({
          error: t.orderNotFound,
          step: "lookup"
        });
      }

      // Verify email
      const orderEmail = (order.email || order.customer?.email || "").toLowerCase();
      if (orderEmail !== email) {
        return json({ error: t.emailMismatch, step: "lookup" });
      }

      // Find already returned line items (from active returns)
      const existingReturns = await prisma.returnRequest.findMany({
        where: {
          shop: shopDomain,
          shopifyOrderId: String(order.id),
          status: { notIn: ["cancelled", "closed"] },
        },
        include: { lineItems: true },
      });

      const alreadyReturnedLineItemIds = new Set<string>();
      for (const ret of existingReturns) {
        for (const li of ret.lineItems) {
          alreadyReturnedLineItemIds.add(li.shopifyLineItemId);
        }
      }

      // Fetch product images for all line items
      const productIds = [...new Set((order.line_items || []).map((item: any) => item.product_id).filter(Boolean))];
      const productImages: Record<string, string> = {};

      // Fetch images in batches (max 250 per request via REST)
      if (productIds.length > 0) {
        try {
          const idsParam = productIds.join(",");
          const productsUrl = `https://${shopDomain}/admin/api/2025-04/products.json?ids=${idsParam}&fields=id,image,images`;
          const productsResp = await fetch(productsUrl, {
            headers: { "X-Shopify-Access-Token": session.accessToken },
          });
          if (productsResp.ok) {
            const productsData = await productsResp.json();
            for (const product of (productsData.products || [])) {
              if (product.image?.src) {
                productImages[String(product.id)] = product.image.src;
              } else if (product.images?.[0]?.src) {
                productImages[String(product.id)] = product.images[0].src;
              }
            }
          }
        } catch (e) {
          console.error("Failed to fetch product images:", e);
        }
      }

      // Map line items with images and mark already returned ones
      const lineItems = (order.line_items || []).map((item: any) => ({
        id: String(item.id),
        title: item.title || "",
        variantTitle: item.variant_title || "",
        sku: item.sku || "",
        quantity: item.quantity || 1,
        price: parseFloat(item.price || "0"),
        currency: order.currency || "EUR",
        imageUrl: productImages[String(item.product_id)] || "",
        alreadyReturned: alreadyReturnedLineItemIds.has(String(item.id)),
      }));

      // Check if ALL items are already returned
      const availableItems = lineItems.filter((li: any) => !li.alreadyReturned);
      if (availableItems.length === 0) {
        return json({ error: t.existingReturn, step: "lookup" });
      }

      return json({
        step: "form",
        order: {
          id: `gid://shopify/Order/${order.id}`,
          name: order.name,
          email: orderEmail,
          customerName: `${order.customer?.first_name || ""} ${order.customer?.last_name || ""}`.trim(),
          customerId: order.customer?.id ? `gid://shopify/Customer/${order.customer.id}` : "",
          currency: order.currency,
          lineItems,
        },
        error: null,
      });
    } catch (err: any) {
      console.error("Order lookup error:", err);
      console.error("Order lookup error:", err);
      return json({ error: t.orderNotFound, step: "lookup" });
    }
  }

  // Step 2: Submit return
  if (intent === "submit") {
    const orderData = JSON.parse(formData.get("orderData") as string || "{}");
    const selectedItems = JSON.parse(formData.get("selectedItems") as string || "[]");
    const reasons = JSON.parse(formData.get("reasons") as string || "{}");
    const notes = JSON.parse(formData.get("notes") as string || "{}");
    const customerNotes = formData.get("customerNotes") as string || "";
    const customerIban = formData.get("customerIban") as string || "";
    const exchangeData = JSON.parse(formData.get("exchangeData") as string || "{}");
    const photoMapping = JSON.parse(formData.get("photoMapping") as string || "{}");

    // Collect uploaded photos per item
    const uploadedPhotos: Record<string, { fileName: string; data: string; mimeType: string; size: number }[]> = {};
    for (const [itemId, fieldNames] of Object.entries(photoMapping) as [string, string[]][]) {
      uploadedPhotos[itemId] = [];
      for (const fieldName of fieldNames) {
        const file = formData.get(fieldName);
        if (file && file instanceof File && file.size > 0) {
          const buffer = Buffer.from(await file.arrayBuffer());
          const base64 = buffer.toString("base64");
          uploadedPhotos[itemId].push({
            fileName: file.name,
            data: `data:${file.type};base64,${base64}`,
            mimeType: file.type,
            size: file.size,
          });
        }
      }
    }

    if (selectedItems.length === 0) {
      return json({ error: t.selectAtLeastOne, step: "form", order: orderData });
    }

    // Build line items for the return
    const returnLineItems = selectedItems.map((itemId: string) => {
      const item = orderData.lineItems.find((li: any) => li.id === itemId);
      const reasonCode = reasons[itemId] || "";
      let note = notes[itemId] || "";

      // Map reason code to readable label
      const REASON_LABELS: Record<string, string> = {
        claim_wrong_product: "Reklamácia: Nesprávny produkt",
        claim_missing: "Reklamácia: Chýbajúci produkt",
        claim_damaged: "Reklamácia: Poškodený produkt",
        claim_low_quality: "Reklamácia: Nekvalitný produkt",
        return_14days: "Vrátenie: Odstúpenie do 14 dní",
        return_30days: "Vrátenie: Do 30 dní",
        return_100days: "Vrátenie: Do 100 dní",
        exchange_product: "Výmena tovaru",
      };
      const reasonLabel = REASON_LABELS[reasonCode] || reasonCode;

      // Append exchange data to note if this is an exchange
      const exchange = exchangeData[itemId];
      if (exchange && reasonCode.startsWith("exchange_")) {
        const exchangeInfo = `[VÝMENA] Kód: ${exchange.productCode || "—"}, Cena: ${exchange.productPrice || "—"}, Ks: ${exchange.quantity || "1"}`;
        note = note ? `${note}\n${exchangeInfo}` : exchangeInfo;
      }
      return {
        lineItemId: item.id,
        productTitle: item.title,
        variantTitle: item.variantTitle,
        sku: item.sku,
        quantity: 1,
        pricePerItem: item.price,
        reasonId: null, // Reason stored as label in customerNote
        customerNote: reasonLabel ? (note ? `${reasonLabel}\n${note}` : reasonLabel) : (note || undefined),
      };
    });

    const totalRefund = returnLineItems.reduce((sum: number, item: any) => sum + item.pricePerItem * item.quantity, 0);

    try {
      // Create return in our database
      const returnRequest = await prisma.returnRequest.create({
        data: {
          shop: shopDomain,
          shopifyOrderId: orderData.id,
          shopifyOrderName: orderData.name,
          customerId: orderData.customerId,
          customerEmail: orderData.email,
          customerName: orderData.customerName,
          status: "pending",
          totalRefundAmount: totalRefund,
          currency: orderData.currency,
          customerNotes: customerNotes || null,
          customerIban: customerIban || null,
          lineItems: {
            create: returnLineItems.map((item: any) => ({
              shopifyLineItemId: item.lineItemId,
              productTitle: item.productTitle,
              variantTitle: item.variantTitle || null,
              sku: item.sku || null,
              quantity: item.quantity,
              pricePerItem: item.pricePerItem,
              reasonId: item.reasonId || null,
              customerNote: item.customerNote || null,
            })),
          },
          statusHistory: {
            create: {
              fromStatus: "",
              toStatus: "pending",
              changedBy: "customer",
              note: "Žiadosť vytvorená cez returns portál",
            },
          },
        },
      });

      // Save uploaded photos
      const allPhotos: { returnRequestId: string; fileName: string; fileUrl: string; fileSize: number; mimeType: string }[] = [];
      for (const [itemId, photos] of Object.entries(uploadedPhotos)) {
        for (const photo of photos) {
          allPhotos.push({
            returnRequestId: returnRequest.id,
            fileName: photo.fileName,
            fileUrl: photo.data, // base64 data URL
            fileSize: photo.size,
            mimeType: photo.mimeType,
          });
        }
      }
      if (allPhotos.length > 0) {
        await prisma.returnPhoto.createMany({ data: allPhotos });
      }

      return json({ step: "success", error: null, returnId: returnRequest.id, photosUploaded: allPhotos.length });
    } catch (err: any) {
      console.error("Return create error:", err);
      return json({ error: "Chyba pri vytváraní žiadosti. Skúste znova.", step: "form", order: orderData });
    }
  }

  return json({ error: "Neplatná akcia", step: "lookup" });
};

export default function ReturnsPortal() {
  const { error: loaderError, shopName, shopDomain, reasons, brandColor, t, lang } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [itemReasons, setItemReasons] = useState<Record<string, string>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [itemPhotos, setItemPhotos] = useState<Record<string, { file: File; preview: string }[]>>({});
  const [itemExchange, setItemExchange] = useState<Record<string, { productCode: string; productPrice: string; quantity: string }>>({});

  if (loaderError) {
    return (
      <html lang={lang || "en"}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width,initial-scale=1" />
          <title>{t?.storeNotFound || "Store not found"}</title>
        </head>
        <body style={{ fontFamily: "system-ui, sans-serif", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" }}>
          <div style={{ textAlign: "center", padding: 40 }}>
            <h1>{t?.storeNotFound || "Store not found"}</h1>
            <p>{t?.checkUrl || "Check the URL address."}</p>
          </div>
        </body>
      </html>
    );
  }

  const step = (actionData as any)?.step || "lookup";
  const order = (actionData as any)?.order;
  const error = (actionData as any)?.error;

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{t.pageTitle} - {shopName}</title>
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f7; color: #333; min-height: 100vh; }
          .header { background: ${brandColor}; color: white; padding: 20px 0; text-align: center; }
          .header h1 { font-size: 24px; font-weight: 600; }
          .header p { opacity: 0.9; margin-top: 4px; }
          .container { max-width: 700px; margin: 30px auto; padding: 0 20px; }
          .card { background: white; border-radius: 12px; padding: 30px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); margin-bottom: 20px; }
          .form-group { margin-bottom: 20px; }
          .form-group label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; }
          .form-group input, .form-group select, .form-group textarea {
            width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;
            font-size: 16px; transition: border-color 0.2s;
          }
          .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
            outline: none; border-color: ${brandColor};
          }
          .btn { display: inline-block; padding: 14px 28px; border-radius: 8px; font-size: 16px;
            font-weight: 600; border: none; cursor: pointer; transition: opacity 0.2s; }
          .btn-primary { background: ${brandColor}; color: white; width: 100%; }
          .btn-primary:hover { opacity: 0.9; }
          .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
          .btn-secondary { background: #eee; color: #333; }
          .error { background: #fee; border: 1px solid #fcc; color: #c33; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; }
          .success { background: #efe; border: 1px solid #cfc; color: #363; padding: 20px; border-radius: 8px; text-align: center; }
          .product-item { display: flex; align-items: flex-start; gap: 12px; padding: 16px 0; border-bottom: 1px solid #eee; }
          .product-item:last-child { border-bottom: none; }
          .product-img { width: 70px; height: 70px; border-radius: 8px; object-fit: cover; background: #f0f0f0; }
          .product-info { flex: 1; }
          .product-title { font-weight: 600; font-size: 15px; }
          .product-variant { color: #777; font-size: 13px; }
          .product-price { font-weight: 600; color: ${brandColor}; }
          .product-checkbox { margin-top: 4px; width: 20px; height: 20px; accent-color: ${brandColor}; }
          .item-details { margin-top: 10px; padding: 12px; background: #f9f9f9; border-radius: 8px; }
          .item-details select, .item-details textarea { margin-top: 6px; }
          .photo-upload-area { margin-top: 8px; }
          .photo-previews { display: flex; gap: 10px; flex-wrap: wrap; }
          .photo-preview { position: relative; width: 80px; height: 80px; border-radius: 8px; overflow: hidden; border: 2px solid #e0e0e0; }
          .photo-preview img { width: 100%; height: 100%; object-fit: cover; }
          .photo-remove { position: absolute; top: 2px; right: 2px; width: 22px; height: 22px; border-radius: 50%; background: rgba(0,0,0,0.6); color: #fff; border: none; cursor: pointer; font-size: 14px; line-height: 1; display: flex; align-items: center; justify-content: center; }
          .photo-remove:hover { background: rgba(200,0,0,0.8); }
          .photo-add { width: 80px; height: 80px; border-radius: 8px; border: 2px dashed #ccc; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transition: border-color 0.2s, background 0.2s; }
          .photo-add:hover { border-color: ${brandColor}; background: #f5f0fa; }
          .photo-add-icon { font-size: 24px; color: #999; line-height: 1; }
          .photo-add:hover .photo-add-icon { color: ${brandColor}; }
          .photo-add-text { font-size: 10px; color: #999; margin-top: 4px; }
          .steps { display: flex; justify-content: center; gap: 8px; margin-bottom: 20px; }
          .step { width: 10px; height: 10px; border-radius: 50%; background: #ddd; }
          .step.active { background: ${brandColor}; }
          .footer { text-align: center; padding: 20px; color: #999; font-size: 13px; }
        `}} />
      </head>
      <body>
        <div className="header">
          <h1>{shopName}</h1>
          <p>{t.pageTitle}</p>
        </div>

        <div className="container">
          {step === "success" ? (
            <div className="card">
              <div className="success">
                <h2 style={{ marginBottom: 10, fontSize: 22 }}>✅ {t.successTitle}</h2>
                <p>{t.successMessage}</p>
              </div>
            </div>
          ) : step === "form" && order ? (
            <ReturnForm
              order={order}
              reasons={reasons}
              error={error}
              isSubmitting={isSubmitting}
              selectedItems={selectedItems}
              setSelectedItems={setSelectedItems}
              itemReasons={itemReasons}
              setItemReasons={setItemReasons}
              itemNotes={itemNotes}
              setItemNotes={setItemNotes}
              itemPhotos={itemPhotos}
              setItemPhotos={setItemPhotos}
              itemExchange={itemExchange}
              setItemExchange={setItemExchange}
              t={t}
            />
          ) : (
            <>
              <div className="steps">
                <div className="step active" />
                <div className="step" />
                <div className="step" />
              </div>
              <div className="card">
                <h2 style={{ marginBottom: 20, fontSize: 20 }}>{t.findOrder}</h2>
                {error && <div className="error">{error}</div>}
                <Form method="post">
                  <input type="hidden" name="intent" value="lookup" />
                  <div className="form-group">
                    <label>{t.orderNumber}</label>
                    <input type="text" name="orderNumber" placeholder={t.orderNumberPlaceholder} required />
                  </div>
                  <div className="form-group">
                    <label>{t.emailLabel}</label>
                    <input type="email" name="email" placeholder={t.emailPlaceholder} required />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                    {isSubmitting ? t.searching : t.searchButton}
                  </button>
                </Form>
              </div>
            </>
          )}
        </div>

        <div className="footer">
          Powered by Artmie Returns Manager
        </div>
      </body>
    </html>
  );
}

function ReturnForm({ order, reasons, error, isSubmitting, selectedItems, setSelectedItems, itemReasons, setItemReasons, itemNotes, setItemNotes, itemPhotos, setItemPhotos, itemExchange, setItemExchange, t }: any) {
  const toggleItem = (itemId: string) => {
    setSelectedItems((prev: string[]) =>
      prev.includes(itemId) ? prev.filter((id: string) => id !== itemId) : [...prev, itemId]
    );
  };

  return (
    <>
      <div className="steps">
        <div className="step active" />
        <div className="step active" />
        <div className="step" />
      </div>

      <Form method="post" encType="multipart/form-data">
        <input type="hidden" name="intent" value="submit" />
        <input type="hidden" name="orderData" value={JSON.stringify(order)} />
        <input type="hidden" name="selectedItems" value={JSON.stringify(selectedItems)} />
        <input type="hidden" name="reasons" value={JSON.stringify(itemReasons)} />
        <input type="hidden" name="notes" value={JSON.stringify(itemNotes)} />
        <input type="hidden" name="exchangeData" value={JSON.stringify(itemExchange)} />
        <input type="hidden" name="photoMapping" value={JSON.stringify(
          Object.fromEntries(
            Object.entries(itemPhotos).map(([itemId, photos]: [string, any[]]) => [
              itemId,
              photos.map((_: any, idx: number) => `photo_${itemId}_${idx}`)
            ])
          )
        )} />

        <div className="card">
          <h2 style={{ marginBottom: 4, fontSize: 20 }}>{t.orderNumber} {order.name}</h2>
          <p style={{ color: "#777", marginBottom: 20, fontSize: 14 }}>{order.email}</p>

          {error && <div className="error">{error}</div>}

          <h3 style={{ marginBottom: 12, fontSize: 16 }}>{t.selectProducts}</h3>

          {order.lineItems.map((item: any) => (
            <div key={item.id}>
              <div className="product-item" style={item.alreadyReturned ? { opacity: 0.5, pointerEvents: "none" } : {}}>
                {item.alreadyReturned ? (
                  <div className="product-checkbox" style={{ width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", color: "#999", fontSize: 14 }}>✓</div>
                ) : (
                  <input
                    type="checkbox"
                    className="product-checkbox"
                    checked={selectedItems.includes(item.id)}
                    onChange={() => toggleItem(item.id)}
                  />
                )}
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.title} className="product-img" />
                ) : (
                  <div className="product-img" />
                )}
                <div className="product-info">
                  <div className="product-title">{item.title}</div>
                  {item.variantTitle && <div className="product-variant">{item.variantTitle}</div>}
                  {item.sku && <div className="product-variant">SKU: {item.sku}</div>}
                  <div className="product-price">{item.price.toFixed(2)} {item.currency} × {item.quantity}</div>
                  {item.alreadyReturned && (
                    <div style={{ color: "#e67e22", fontSize: 12, fontWeight: 600, marginTop: 4 }}>
                      ⚠ {lang === "sk" || lang === "cs" ? "Už reklamované" : lang === "hu" ? "Már visszaküldve" : lang === "pl" ? "Już zgłoszono zwrot" : lang === "de" ? "Bereits zurückgegeben" : lang === "it" ? "Già restituito" : lang === "el" ? "Ήδη επιστράφηκε" : lang === "ro" ? "Deja returnat" : lang === "bg" ? "Вече върнат" : lang === "sr" ? "Већ враћено" : lang === "sl" ? "Že vrnjeno" : lang === "hr" || lang === "bs" ? "Već vraćeno" : "Already returned"}
                    </div>
                  )}
                </div>
              </div>

              {selectedItems.includes(item.id) && (
                <div className="item-details">
                  <label style={{ fontSize: 13, fontWeight: 600 }}>{t.returnReason}</label>
                  <select
                    value={itemReasons[item.id] || ""}
                    onChange={(e) => {
                      setItemReasons((prev: any) => ({ ...prev, [item.id]: e.target.value }));
                      // Clear exchange data if not exchange
                      if (!e.target.value.startsWith("exchange_")) {
                        setItemExchange((prev) => { const n = { ...prev }; delete n[item.id]; return n; });
                      } else if (!itemExchange[item.id]) {
                        setItemExchange((prev) => ({ ...prev, [item.id]: { productCode: "", productPrice: "", quantity: "1" } }));
                      }
                    }}
                    style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  >
                    <option value="">{t.selectReason}</option>
                    <optgroup label={`── ${t.catClaim} ──`}>
                      <option value="claim_wrong_product">{t.claimWrongProduct}</option>
                      <option value="claim_missing">{t.claimMissing}</option>
                      <option value="claim_damaged">{t.claimDamaged}</option>
                      <option value="claim_low_quality">{t.claimLowQuality}</option>
                    </optgroup>
                    <optgroup label={`── ${t.catReturn} ──`}>
                      <option value="return_14days">{t.return14days}</option>
                      <option value="return_30days">{t.return30days}</option>
                      <option value="return_100days">{t.return100days}</option>
                    </optgroup>
                    <optgroup label={`── ${t.catExchange} ──`}>
                      <option value="exchange_product">{t.exchangeLabel}</option>
                    </optgroup>
                  </select>

                  {/* Exchange fields */}
                  {(itemReasons[item.id] || "").startsWith("exchange_") && (
                    <div style={{ marginTop: 10, padding: 12, background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 8 }}>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>{t.exchangeProductCode}</label>
                          <input
                            type="text"
                            value={itemExchange[item.id]?.productCode || ""}
                            onChange={(e) => setItemExchange((prev) => ({ ...prev, [item.id]: { ...prev[item.id], productCode: e.target.value } }))}
                            placeholder="SKU / kód"
                            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>{t.exchangeProductPrice}</label>
                          <input
                            type="number"
                            step="0.01"
                            value={itemExchange[item.id]?.productPrice || ""}
                            onChange={(e) => setItemExchange((prev) => ({ ...prev, [item.id]: { ...prev[item.id], productPrice: e.target.value } }))}
                            placeholder="0.00"
                            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>{t.exchangeQuantity}</label>
                          <input
                            type="number"
                            min="1"
                            value={itemExchange[item.id]?.quantity || "1"}
                            onChange={(e) => setItemExchange((prev) => ({ ...prev, [item.id]: { ...prev[item.id], quantity: e.target.value } }))}
                            style={{ width: "100%", padding: 8, borderRadius: 6, border: "1px solid #ddd", fontSize: 13 }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  <label style={{ fontSize: 13, fontWeight: 600, marginTop: 8, display: "block" }}>{t.descriptionOptional}</label>
                  <textarea
                    value={itemNotes[item.id] || ""}
                    onChange={(e) => setItemNotes((prev: any) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder={t.describeProblem}
                    rows={2}
                    style={{ width: "100%", padding: 10, borderRadius: 6, border: "1px solid #ddd", fontSize: 14 }}
                  />

                  <label style={{ fontSize: 13, fontWeight: 600, marginTop: 12, display: "block" }}>
                    {t.photosLabel}
                  </label>
                  <div className="photo-upload-area">
                    <div className="photo-previews">
                      {(itemPhotos[item.id] || []).map((photo: any, idx: number) => (
                        <div key={idx} className="photo-preview">
                          <img src={photo.preview} alt={`${idx + 1}`} />
                          <button
                            type="button"
                            className="photo-remove"
                            onClick={() => {
                              URL.revokeObjectURL(photo.preview);
                              setItemPhotos((prev: any) => ({
                                ...prev,
                                [item.id]: (prev[item.id] || []).filter((_: any, i: number) => i !== idx),
                              }));
                            }}
                          >×</button>
                        </div>
                      ))}
                      {(itemPhotos[item.id] || []).length < 4 && (
                        <label className="photo-add">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: "none" }}
                            onChange={(e) => {
                              const files = Array.from(e.target.files || []);
                              const currentPhotos = itemPhotos[item.id] || [];
                              const remaining = 4 - currentPhotos.length;
                              const newPhotos = files.slice(0, remaining).map(file => ({
                                file,
                                preview: URL.createObjectURL(file),
                              }));
                              setItemPhotos((prev: any) => ({
                                ...prev,
                                [item.id]: [...currentPhotos, ...newPhotos],
                              }));
                              e.target.value = "";
                            }}
                          />
                          <span className="photo-add-icon">+</span>
                          <span className="photo-add-text">{t.addPhoto}</span>
                        </label>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="form-group">
            <label>{t.ibanLabel}</label>
            <input type="text" name="customerIban" placeholder="SK89 0200 0000 0012 3456 7890" />
          </div>
          <div className="form-group">
            <label>{t.noteOptional}</label>
            <textarea name="customerNotes" rows={3} placeholder={t.notePlaceholder} />
          </div>

          {/* Hidden file inputs for photo uploads */}
          <div style={{ display: "none" }}>
            {Object.entries(itemPhotos).map(([itemId, photos]: [string, any[]]) =>
              photos.map((photo: any, idx: number) => {
                const dt = new DataTransfer();
                dt.items.add(photo.file);
                return (
                  <input
                    key={`photo_${itemId}_${idx}`}
                    type="file"
                    name={`photo_${itemId}_${idx}`}
                    ref={(el) => { if (el) el.files = dt.files; }}
                  />
                );
              })
            )}
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSubmitting || selectedItems.length === 0}>
            {isSubmitting ? t.submitting : `${t.submitButton} (${selectedItems.length} ${selectedItems.length === 1 ? t.product : t.products})`}
          </button>
        </div>
      </Form>
    </>
  );
}
