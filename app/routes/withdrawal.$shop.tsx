import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useActionData, Form, useNavigation } from "@remix-run/react";
import { prisma } from "../db.server";

const SHOP_SLUGS: Record<string, string> = {
  "papilora-sk": "papilora.myshopify.com",
  "papilora-cz": "papilora-cz.myshopify.com",
  "papilora-hu": "papilora-hu.myshopify.com",
  "papilora-pl": "papilora-pl.myshopify.com",
  "papilora-ro": "papilora-ro.myshopify.com",
  "papilora-bg": "papilora-bg.myshopify.com",
  "papilora-hr": "papilora.myshopify.com",
  "papilora-ba": "papilora-ba.myshopify.com",
  "papilora-si": "papilora.myshopify.com",
  "papilora-gr": "papilora.myshopify.com",
  "papilora-it": "papilora.myshopify.com",
  "artmie-sk": "20a254-6e.myshopify.com",
  "artmie-cz": "cz-artmie.myshopify.com",
  "artmie-hu": "hu-artmie.myshopify.com",
  "artmie-pl": "pl-artmie.myshopify.com",
  "artmie-ro": "ro-artmie.myshopify.com",
  "artmie-bg": "20a254-6e.myshopify.com",
  "artmie-de": "20a254-6e.myshopify.com",
  "artmie-ba": "ba-artmie.myshopify.com",
  "artmie-rs": "rs-artmie.myshopify.com",
  "artmie-si": "20a254-6e.myshopify.com",
  "artmie-gr": "20a254-6e.myshopify.com",
  "artmie-it": "20a254-6e.myshopify.com",
  "artmie-hr": "20a254-6e.myshopify.com",
  "artmie-at": "20a254-6e.myshopify.com",
};

const SHOP_NAMES: Record<string, string> = {
  "papilora-sk": "Papilora SK", "papilora-cz": "Papilora CZ", "papilora-hu": "Papilora HU",
  "papilora-pl": "Papilora PL", "papilora-ro": "Papilora RO", "papilora-bg": "Papilora BG",
  "papilora-hr": "Papilora HR", "papilora-ba": "Papilora BA", "papilora-si": "Papilora SI",
  "papilora-gr": "Papilora GR", "papilora-it": "Papilora IT",
  "artmie-sk": "Artmie SK", "artmie-cz": "Artmie CZ", "artmie-hu": "Artmie HU",
  "artmie-pl": "Artmie PL", "artmie-ro": "Artmie RO", "artmie-bg": "Artmie BG",
  "artmie-de": "Artmie DE", "artmie-ba": "Artmie BA", "artmie-rs": "Artmie RS",
  "artmie-si": "Artmie SI", "artmie-gr": "Artmie GR", "artmie-it": "Artmie IT",
  "artmie-hr": "Artmie HR", "artmie-at": "Artmie AT",
};

const SHOP_LANG: Record<string, string> = {
  "sk": "sk", "cz": "cs", "hu": "hu", "pl": "pl", "ro": "ro",
  "bg": "bg", "hr": "hr", "ba": "bs", "de": "de", "rs": "sr",
  "si": "sl", "gr": "el", "it": "it", "at": "de",
};

function getLang(slug: string): string {
  const suffix = slug.split("-").pop() || "";
  return SHOP_LANG[suffix] || "en";
}

type T = {
  pageTitle: string; subtitle: string; findOrder: string;
  orderNumber: string; orderNumberPlaceholder: string;
  emailLabel: string; emailPlaceholder: string;
  searchButton: string; searching: string;
  orderDetails: string; orderDate: string; orderTotal: string; orderStatus: string;
  items: string; confirmTitle: string; confirmText: string;
  confirmButton: string; cancelling: string;
  successTitle: string; successText: string;
  errorNotFound: string; errorEmail: string; errorBoth: string;
  errorAlreadyCancelled: string; errorFulfilled: string; errorCancel: string;
  back: string;
  statusUnfulfilled: string; statusFulfilled: string; statusPartial: string;
};

const TRANSLATIONS: Record<string, T> = {
  sk: {
    pageTitle: "Odstúpenie od zmluvy", subtitle: "Zrušenie objednávky",
    findOrder: "Vyhľadajte vašu objednávku", orderNumber: "Číslo objednávky",
    orderNumberPlaceholder: "napr. 75501019", emailLabel: "Email použitý pri objednávke",
    emailPlaceholder: "vas@email.com", searchButton: "Vyhľadať objednávku", searching: "Hľadám...",
    orderDetails: "Detail objednávky", orderDate: "Dátum", orderTotal: "Celkom", orderStatus: "Stav",
    items: "Položky", confirmTitle: "Potvrdenie zrušenia",
    confirmText: "Naozaj chcete zrušiť túto objednávku? Objednávka bude stornovaná a budete informovaný emailom.",
    confirmButton: "Potvrdiť zrušenie objednávky", cancelling: "Ruším objednávku...",
    successTitle: "Objednávka zrušená", successText: "Vaša objednávka bola úspešne zrušená. O ďalšom postupe vás budeme informovať emailom.",
    errorNotFound: "Objednávka sa nenašla", errorEmail: "Email sa nezhoduje s objednávkou",
    errorBoth: "Zadajte číslo objednávky aj email", errorAlreadyCancelled: "Táto objednávka je už zrušená",
    errorFulfilled: "Táto objednávka už bola odoslaná. Pre vrátenie tovaru použite formulár na vrátenie.",
    errorCancel: "Nepodarilo sa zrušiť objednávku. Kontaktujte nás prosím.", back: "Späť",
    statusUnfulfilled: "Neodoslaná", statusFulfilled: "Odoslaná", statusPartial: "Čiastočne odoslaná",
  },
  cs: {
    pageTitle: "Odstoupení od smlouvy", subtitle: "Zrušení objednávky",
    findOrder: "Vyhledejte vaši objednávku", orderNumber: "Číslo objednávky",
    orderNumberPlaceholder: "např. 75501019", emailLabel: "Email použitý při objednávce",
    emailPlaceholder: "vas@email.com", searchButton: "Vyhledat objednávku", searching: "Hledám...",
    orderDetails: "Detail objednávky", orderDate: "Datum", orderTotal: "Celkem", orderStatus: "Stav",
    items: "Položky", confirmTitle: "Potvrzení zrušení",
    confirmText: "Opravdu chcete zrušit tuto objednávku? Objednávka bude stornována a budete informováni emailem.",
    confirmButton: "Potvrdit zrušení objednávky", cancelling: "Ruším objednávku...",
    successTitle: "Objednávka zrušena", successText: "Vaše objednávka byla úspěšně zrušena. O dalším postupu vás budeme informovat emailem.",
    errorNotFound: "Objednávka nebyla nalezena", errorEmail: "Email se neshoduje s objednávkou",
    errorBoth: "Zadejte číslo objednávky i email", errorAlreadyCancelled: "Tato objednávka je již zrušena",
    errorFulfilled: "Tato objednávka již byla odeslána. Pro vrácení zboží použijte formulář pro vrácení.",
    errorCancel: "Nepodařilo se zrušit objednávku. Kontaktujte nás prosím.", back: "Zpět",
    statusUnfulfilled: "Neodeslaná", statusFulfilled: "Odeslaná", statusPartial: "Částečně odeslaná",
  },
  hu: {
    pageTitle: "Elállás a szerződéstől", subtitle: "Rendelés törlése",
    findOrder: "Keresse meg rendelését", orderNumber: "Rendelési szám",
    orderNumberPlaceholder: "pl. 75501019", emailLabel: "A rendeléshez használt email",
    emailPlaceholder: "on@email.com", searchButton: "Rendelés keresése", searching: "Keresés...",
    orderDetails: "Rendelés részletei", orderDate: "Dátum", orderTotal: "Összesen", orderStatus: "Állapot",
    items: "Tételek", confirmTitle: "Törlés megerősítése",
    confirmText: "Biztosan törölni szeretné ezt a rendelést? A rendelés sztornózásra kerül, és emailben értesítjük.",
    confirmButton: "Rendelés törlésének megerősítése", cancelling: "Rendelés törlése...",
    successTitle: "Rendelés törölve", successText: "Rendelése sikeresen törölve. A további lépésekről emailben értesítjük.",
    errorNotFound: "Rendelés nem található", errorEmail: "Az email nem egyezik a rendelésben megadottal",
    errorBoth: "Adja meg a rendelési számot és az emailt", errorAlreadyCancelled: "Ez a rendelés már törölve van",
    errorFulfilled: "Ez a rendelés már ki lett szállítva. A visszaküldéshez használja a visszaküldési űrlapot.",
    errorCancel: "Nem sikerült törölni a rendelést. Kérjük, lépjen kapcsolatba velünk.", back: "Vissza",
    statusUnfulfilled: "Nem szállított", statusFulfilled: "Kiszállított", statusPartial: "Részben kiszállított",
  },
  pl: {
    pageTitle: "Odstąpienie od umowy", subtitle: "Anulowanie zamówienia",
    findOrder: "Wyszukaj swoje zamówienie", orderNumber: "Numer zamówienia",
    orderNumberPlaceholder: "np. 75501019", emailLabel: "Email użyty przy zamówieniu",
    emailPlaceholder: "twoj@email.com", searchButton: "Wyszukaj zamówienie", searching: "Szukam...",
    orderDetails: "Szczegóły zamówienia", orderDate: "Data", orderTotal: "Łącznie", orderStatus: "Status",
    items: "Produkty", confirmTitle: "Potwierdzenie anulowania",
    confirmText: "Czy na pewno chcesz anulować to zamówienie? Zamówienie zostanie anulowane, a Ty zostaniesz poinformowany mailowo.",
    confirmButton: "Potwierdź anulowanie zamówienia", cancelling: "Anuluję zamówienie...",
    successTitle: "Zamówienie anulowane", successText: "Twoje zamówienie zostało pomyślnie anulowane. O dalszych krokach poinformujemy Cię mailowo.",
    errorNotFound: "Zamówienie nie zostało znalezione", errorEmail: "Email nie pasuje do zamówienia",
    errorBoth: "Podaj numer zamówienia i email", errorAlreadyCancelled: "To zamówienie jest już anulowane",
    errorFulfilled: "To zamówienie zostało już wysłane. Aby zwrócić towar, użyj formularza zwrotu.",
    errorCancel: "Nie udało się anulować zamówienia. Skontaktuj się z nami.", back: "Wstecz",
    statusUnfulfilled: "Niewysłane", statusFulfilled: "Wysłane", statusPartial: "Częściowo wysłane",
  },
  ro: {
    pageTitle: "Retragere din contract", subtitle: "Anulare comandă",
    findOrder: "Căutați comanda dvs.", orderNumber: "Numărul comenzii",
    orderNumberPlaceholder: "ex. 75501019", emailLabel: "Emailul folosit la comandă",
    emailPlaceholder: "dvs@email.com", searchButton: "Căutare comandă", searching: "Se caută...",
    orderDetails: "Detalii comandă", orderDate: "Data", orderTotal: "Total", orderStatus: "Stare",
    items: "Produse", confirmTitle: "Confirmare anulare",
    confirmText: "Sunteți sigur că doriți să anulați această comandă? Comanda va fi anulată și veți fi notificat pe email.",
    confirmButton: "Confirmați anularea comenzii", cancelling: "Se anulează comanda...",
    successTitle: "Comandă anulată", successText: "Comanda dvs. a fost anulată cu succes. Vă vom informa pe email despre pașii următori.",
    errorNotFound: "Comanda nu a fost găsită", errorEmail: "Emailul nu corespunde cu comanda",
    errorBoth: "Introduceți numărul comenzii și emailul", errorAlreadyCancelled: "Această comandă este deja anulată",
    errorFulfilled: "Această comandă a fost deja expediată. Pentru returnare, utilizați formularul de returnare.",
    errorCancel: "Nu s-a putut anula comanda. Vă rugăm să ne contactați.", back: "Înapoi",
    statusUnfulfilled: "Neexpediată", statusFulfilled: "Expediată", statusPartial: "Parțial expediată",
  },
  bg: {
    pageTitle: "Отказ от договора", subtitle: "Отмяна на поръчка",
    findOrder: "Намерете вашата поръчка", orderNumber: "Номер на поръчката",
    orderNumberPlaceholder: "напр. 75501019", emailLabel: "Имейл от поръчката",
    emailPlaceholder: "vash@email.com", searchButton: "Търсене на поръчка", searching: "Търсене...",
    orderDetails: "Детайли на поръчката", orderDate: "Дата", orderTotal: "Общо", orderStatus: "Статус",
    items: "Продукти", confirmTitle: "Потвърждение за отмяна",
    confirmText: "Сигурни ли сте, че искате да отмените тази поръчка? Поръчката ще бъде анулирана и ще бъдете уведомени по имейл.",
    confirmButton: "Потвърдете отмяната", cancelling: "Отмяна на поръчката...",
    successTitle: "Поръчката е отменена", successText: "Вашата поръчка беше успешно отменена. Ще ви уведомим по имейл за следващите стъпки.",
    errorNotFound: "Поръчката не е намерена", errorEmail: "Имейлът не съвпада с поръчката",
    errorBoth: "Въведете номер на поръчката и имейл", errorAlreadyCancelled: "Тази поръчка вече е отменена",
    errorFulfilled: "Тази поръчка вече е изпратена. За връщане използвайте формуляра за връщане.",
    errorCancel: "Не можахме да отменим поръчката. Моля, свържете се с нас.", back: "Назад",
    statusUnfulfilled: "Неизпратена", statusFulfilled: "Изпратена", statusPartial: "Частично изпратена",
  },
  hr: {
    pageTitle: "Odustajanje od ugovora", subtitle: "Otkazivanje narudžbe",
    findOrder: "Pronađite svoju narudžbu", orderNumber: "Broj narudžbe",
    orderNumberPlaceholder: "npr. 75501019", emailLabel: "Email korišten pri narudžbi",
    emailPlaceholder: "vas@email.com", searchButton: "Pretraži narudžbu", searching: "Tražim...",
    orderDetails: "Detalji narudžbe", orderDate: "Datum", orderTotal: "Ukupno", orderStatus: "Status",
    items: "Proizvodi", confirmTitle: "Potvrda otkazivanja",
    confirmText: "Jeste li sigurni da želite otkazati ovu narudžbu? Narudžba će biti otkazana i bit ćete obaviješteni emailom.",
    confirmButton: "Potvrdite otkazivanje narudžbe", cancelling: "Otkazujem narudžbu...",
    successTitle: "Narudžba otkazana", successText: "Vaša narudžba je uspješno otkazana. O daljnjim koracima bit ćete obaviješteni emailom.",
    errorNotFound: "Narudžba nije pronađena", errorEmail: "Email se ne podudara s narudžbom",
    errorBoth: "Unesite broj narudžbe i email", errorAlreadyCancelled: "Ova narudžba je već otkazana",
    errorFulfilled: "Ova narudžba je već poslana. Za povrat koristite obrazac za povrat.",
    errorCancel: "Nije moguće otkazati narudžbu. Kontaktirajte nas.", back: "Natrag",
    statusUnfulfilled: "Neposlana", statusFulfilled: "Poslana", statusPartial: "Djelomično poslana",
  },
  bs: {
    pageTitle: "Odustajanje od ugovora", subtitle: "Otkazivanje narudžbe",
    findOrder: "Pronađite svoju narudžbu", orderNumber: "Broj narudžbe",
    orderNumberPlaceholder: "npr. 75501019", emailLabel: "Email korišten pri narudžbi",
    emailPlaceholder: "vas@email.com", searchButton: "Pretraži narudžbu", searching: "Tražim...",
    orderDetails: "Detalji narudžbe", orderDate: "Datum", orderTotal: "Ukupno", orderStatus: "Status",
    items: "Proizvodi", confirmTitle: "Potvrda otkazivanja",
    confirmText: "Jeste li sigurni da želite otkazati ovu narudžbu? Narudžba će biti otkazana i bit ćete obaviješteni emailom.",
    confirmButton: "Potvrdite otkazivanje narudžbe", cancelling: "Otkazujem narudžbu...",
    successTitle: "Narudžba otkazana", successText: "Vaša narudžba je uspješno otkazana. O daljnjim koracima bit ćete obaviješteni emailom.",
    errorNotFound: "Narudžba nije pronađena", errorEmail: "Email se ne podudara s narudžbom",
    errorBoth: "Unesite broj narudžbe i email", errorAlreadyCancelled: "Ova narudžba je već otkazana",
    errorFulfilled: "Ova narudžba je već poslana. Za povrat koristite obrazac za povrat.",
    errorCancel: "Nije moguće otkazati narudžbu. Kontaktirajte nas.", back: "Nazad",
    statusUnfulfilled: "Neposlana", statusFulfilled: "Poslana", statusPartial: "Djelomično poslana",
  },
  de: {
    pageTitle: "Widerrufsrecht", subtitle: "Bestellung stornieren",
    findOrder: "Finden Sie Ihre Bestellung", orderNumber: "Bestellnummer",
    orderNumberPlaceholder: "z.B. 75501019", emailLabel: "Bei der Bestellung verwendete E-Mail",
    emailPlaceholder: "ihre@email.com", searchButton: "Bestellung suchen", searching: "Suche...",
    orderDetails: "Bestelldetails", orderDate: "Datum", orderTotal: "Gesamt", orderStatus: "Status",
    items: "Artikel", confirmTitle: "Stornierung bestätigen",
    confirmText: "Möchten Sie diese Bestellung wirklich stornieren? Die Bestellung wird storniert und Sie werden per E-Mail benachrichtigt.",
    confirmButton: "Stornierung bestätigen", cancelling: "Bestellung wird storniert...",
    successTitle: "Bestellung storniert", successText: "Ihre Bestellung wurde erfolgreich storniert. Über die nächsten Schritte informieren wir Sie per E-Mail.",
    errorNotFound: "Bestellung nicht gefunden", errorEmail: "E-Mail stimmt nicht mit der Bestellung überein",
    errorBoth: "Geben Sie Bestellnummer und E-Mail ein", errorAlreadyCancelled: "Diese Bestellung ist bereits storniert",
    errorFulfilled: "Diese Bestellung wurde bereits versendet. Für Rücksendungen verwenden Sie bitte das Rücksendeformular.",
    errorCancel: "Die Bestellung konnte nicht storniert werden. Bitte kontaktieren Sie uns.", back: "Zurück",
    statusUnfulfilled: "Nicht versendet", statusFulfilled: "Versendet", statusPartial: "Teilweise versendet",
  },
  sr: {
    pageTitle: "Одустајање од уговора", subtitle: "Отказивање поруџбине",
    findOrder: "Пронађите вашу поруџбину", orderNumber: "Број поруџбине",
    orderNumberPlaceholder: "нпр. 75501019", emailLabel: "Имејл коришћен при поруџбини",
    emailPlaceholder: "vas@email.com", searchButton: "Претражи поруџбину", searching: "Тражим...",
    orderDetails: "Детаљи поруџбине", orderDate: "Датум", orderTotal: "Укупно", orderStatus: "Статус",
    items: "Производи", confirmTitle: "Потврда отказивања",
    confirmText: "Да ли сте сигурни да желите да откажете ову поруџбину? Поруџбина ће бити отказана и бићете обавештени имејлом.",
    confirmButton: "Потврдите отказивање поруџбине", cancelling: "Отказујем поруџбину...",
    successTitle: "Поруџбина отказана", successText: "Ваша поруџбина је успешно отказана. О даљим корацима бићете обавештени имејлом.",
    errorNotFound: "Поруџбина није пронађена", errorEmail: "Имејл се не подудара са поруџбином",
    errorBoth: "Унесите број поруџбине и имејл", errorAlreadyCancelled: "Ова поруџбина је већ отказана",
    errorFulfilled: "Ова поруџбина је већ послата. За повраћај користите формулар за повраћај.",
    errorCancel: "Није могуће отказати поруџбину. Контактирајте нас.", back: "Назад",
    statusUnfulfilled: "Непослата", statusFulfilled: "Послата", statusPartial: "Делимично послата",
  },
  sl: {
    pageTitle: "Odstop od pogodbe", subtitle: "Preklic naročila",
    findOrder: "Poiščite vaše naročilo", orderNumber: "Številka naročila",
    orderNumberPlaceholder: "npr. 75501019", emailLabel: "Email uporabljen pri naročilu",
    emailPlaceholder: "vas@email.com", searchButton: "Išči naročilo", searching: "Iščem...",
    orderDetails: "Podrobnosti naročila", orderDate: "Datum", orderTotal: "Skupaj", orderStatus: "Status",
    items: "Izdelki", confirmTitle: "Potrditev preklica",
    confirmText: "Ali ste prepričani, da želite preklicati to naročilo? Naročilo bo preklicano in obveščeni boste po e-pošti.",
    confirmButton: "Potrdite preklic naročila", cancelling: "Preklicujem naročilo...",
    successTitle: "Naročilo preklicano", successText: "Vaše naročilo je bilo uspešno preklicano. O nadaljnjih korakih vas bomo obvestili po e-pošti.",
    errorNotFound: "Naročilo ni bilo najdeno", errorEmail: "Email se ne ujema z naročilom",
    errorBoth: "Vnesite številko naročila in email", errorAlreadyCancelled: "To naročilo je že preklicano",
    errorFulfilled: "To naročilo je že bilo odposlano. Za vračilo uporabite obrazec za vračilo.",
    errorCancel: "Naročila ni bilo mogoče preklicati. Kontaktirajte nas.", back: "Nazaj",
    statusUnfulfilled: "Neodposlano", statusFulfilled: "Odposlano", statusPartial: "Delno odposlano",
  },
  el: {
    pageTitle: "Υπαναχώρηση από τη σύμβαση", subtitle: "Ακύρωση παραγγελίας",
    findOrder: "Βρείτε την παραγγελία σας", orderNumber: "Αριθμός παραγγελίας",
    orderNumberPlaceholder: "π.χ. 75501019", emailLabel: "Email που χρησιμοποιήθηκε στην παραγγελία",
    emailPlaceholder: "sas@email.com", searchButton: "Αναζήτηση παραγγελίας", searching: "Αναζήτηση...",
    orderDetails: "Στοιχεία παραγγελίας", orderDate: "Ημερομηνία", orderTotal: "Σύνολο", orderStatus: "Κατάσταση",
    items: "Προϊόντα", confirmTitle: "Επιβεβαίωση ακύρωσης",
    confirmText: "Είστε σίγουροι ότι θέλετε να ακυρώσετε αυτήν την παραγγελία; Η παραγγελία θα ακυρωθεί και θα ειδοποιηθείτε μέσω email.",
    confirmButton: "Επιβεβαίωση ακύρωσης παραγγελίας", cancelling: "Ακύρωση παραγγελίας...",
    successTitle: "Παραγγελία ακυρώθηκε", successText: "Η παραγγελία σας ακυρώθηκε επιτυχώς. Θα σας ενημερώσουμε μέσω email για τα επόμενα βήματα.",
    errorNotFound: "Η παραγγελία δεν βρέθηκε", errorEmail: "Το email δεν ταιριάζει με την παραγγελία",
    errorBoth: "Εισάγετε αριθμό παραγγελίας και email", errorAlreadyCancelled: "Αυτή η παραγγελία έχει ήδη ακυρωθεί",
    errorFulfilled: "Αυτή η παραγγελία έχει ήδη αποσταλεί. Για επιστροφή χρησιμοποιήστε τη φόρμα επιστροφής.",
    errorCancel: "Δεν ήταν δυνατή η ακύρωση. Επικοινωνήστε μαζί μας.", back: "Πίσω",
    statusUnfulfilled: "Μη απεσταλμένη", statusFulfilled: "Απεσταλμένη", statusPartial: "Μερικώς απεσταλμένη",
  },
  it: {
    pageTitle: "Recesso dal contratto", subtitle: "Annullamento ordine",
    findOrder: "Trova il tuo ordine", orderNumber: "Numero ordine",
    orderNumberPlaceholder: "es. 75501019", emailLabel: "Email utilizzata nell'ordine",
    emailPlaceholder: "tuo@email.com", searchButton: "Cerca ordine", searching: "Ricerca...",
    orderDetails: "Dettagli ordine", orderDate: "Data", orderTotal: "Totale", orderStatus: "Stato",
    items: "Articoli", confirmTitle: "Conferma annullamento",
    confirmText: "Sei sicuro di voler annullare questo ordine? L'ordine verrà annullato e sarai notificato via email.",
    confirmButton: "Conferma annullamento ordine", cancelling: "Annullamento in corso...",
    successTitle: "Ordine annullato", successText: "Il tuo ordine è stato annullato con successo. Ti informeremo via email sui prossimi passi.",
    errorNotFound: "Ordine non trovato", errorEmail: "L'email non corrisponde all'ordine",
    errorBoth: "Inserisci numero ordine ed email", errorAlreadyCancelled: "Questo ordine è già annullato",
    errorFulfilled: "Questo ordine è già stato spedito. Per il reso utilizza il modulo di reso.",
    errorCancel: "Non è stato possibile annullare l'ordine. Contattaci.", back: "Indietro",
    statusUnfulfilled: "Non spedito", statusFulfilled: "Spedito", statusPartial: "Parzialmente spedito",
  },
  en: {
    pageTitle: "Contract Withdrawal", subtitle: "Order Cancellation",
    findOrder: "Find your order", orderNumber: "Order number",
    orderNumberPlaceholder: "e.g. 75501019", emailLabel: "Email used for the order",
    emailPlaceholder: "your@email.com", searchButton: "Search order", searching: "Searching...",
    orderDetails: "Order details", orderDate: "Date", orderTotal: "Total", orderStatus: "Status",
    items: "Items", confirmTitle: "Confirm cancellation",
    confirmText: "Are you sure you want to cancel this order? The order will be cancelled and you will be notified by email.",
    confirmButton: "Confirm order cancellation", cancelling: "Cancelling order...",
    successTitle: "Order cancelled", successText: "Your order has been successfully cancelled. We will inform you about next steps via email.",
    errorNotFound: "Order not found", errorEmail: "Email does not match the order",
    errorBoth: "Enter order number and email", errorAlreadyCancelled: "This order is already cancelled",
    errorFulfilled: "This order has already been shipped. To return items, use the return form.",
    errorCancel: "Could not cancel the order. Please contact us.", back: "Back",
    statusUnfulfilled: "Unfulfilled", statusFulfilled: "Fulfilled", statusPartial: "Partially fulfilled",
  },
};

function getT(slug: string): T {
  const lang = getLang(slug);
  return TRANSLATIONS[lang] || TRANSLATIONS.en;
}

export const loader = async ({ params }: LoaderFunctionArgs) => {
  const slug = params.shop || "";
  const shopDomain = SHOP_SLUGS[slug];
  const shopName = SHOP_NAMES[slug] || slug;
  const t = getT(slug);
  const lang = getLang(slug);
  const brandColor = slug.startsWith("papilora") ? "#6B2D8B" : "#E8453C";
  const brandGradient = slug.startsWith("papilora") ? "#6B2D8B" : "linear-gradient(135deg, #E8453C, #F86543, #F7A828)";

  if (!shopDomain) {
    return json({ error: "Store not found", shopName: "", shopDomain: "", brandColor, brandGradient, t, lang, order: null });
  }
  return json({ error: null, shopName, shopDomain, brandColor, brandGradient, t, lang, order: null });
};

async function findWorkingSession(shopDomain: string) {
  const sessions = await prisma.session.findMany({ where: { shop: shopDomain } });
  for (const sess of sessions) {
    if (!sess.accessToken) continue;
    try {
      const resp = await fetch(`https://${shopDomain}/admin/api/2025-04/orders/count.json?status=any`, {
        headers: { "X-Shopify-Access-Token": sess.accessToken },
      });
      if (resp.status === 200) return sess;
    } catch {}
  }
  return null;
}

async function findOrder(shopDomain: string, accessToken: string, orderNumber: string) {
  const clean = orderNumber.replace(/^#/, "");

  // Try REST name search
  let resp = await fetch(`https://${shopDomain}/admin/api/2025-04/orders.json?name=${encodeURIComponent(clean)}&status=any&limit=1`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  let data = await resp.json();
  if (data.orders?.length > 0) return data.orders[0];

  // Try with # prefix
  resp = await fetch(`https://${shopDomain}/admin/api/2025-04/orders.json?name=%23${encodeURIComponent(clean)}&status=any&limit=1`, {
    headers: { "X-Shopify-Access-Token": accessToken },
  });
  data = await resp.json();
  if (data.orders?.length > 0) return data.orders[0];

  // Try GraphQL
  const gqlResp = await fetch(`https://${shopDomain}/admin/api/2025-04/graphql.json`, {
    method: "POST",
    headers: { "X-Shopify-Access-Token": accessToken, "Content-Type": "application/json" },
    body: JSON.stringify({ query: `{ orders(first: 1, query: "name:${clean}") { edges { node { legacyResourceId name } } } }` }),
  });
  const gqlData = await gqlResp.json();
  const gqlOrder = gqlData?.data?.orders?.edges?.[0]?.node;
  if (gqlOrder) {
    const fullResp = await fetch(`https://${shopDomain}/admin/api/2025-04/orders/${gqlOrder.legacyResourceId}.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const fullData = await fullResp.json();
    if (fullData.order) return fullData.order;
  }

  return null;
}

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const slug = params.shop || "";
  const shopDomain = SHOP_SLUGS[slug];
  const t = getT(slug);

  if (!shopDomain) return json({ error: "Store not found", step: "lookup" });

  if (intent === "lookup") {
    const orderNumber = (formData.get("orderNumber") as string || "").trim();
    const email = (formData.get("email") as string || "").trim().toLowerCase();
    if (!orderNumber || !email) return json({ error: t.errorBoth, step: "lookup" });

    try {
      const session = await findWorkingSession(shopDomain);
      if (!session) return json({ error: t.errorNotFound, step: "lookup" });

      const order = await findOrder(shopDomain, session.accessToken!, orderNumber);
      if (!order) return json({ error: t.errorNotFound, step: "lookup" });

      const orderEmail = (order.email || order.contact_email || "").toLowerCase();
      if (orderEmail !== email) return json({ error: t.errorEmail, step: "lookup" });

      if (order.cancelled_at) return json({ error: t.errorAlreadyCancelled, step: "lookup" });

      if (order.fulfillment_status === "fulfilled") return json({ error: t.errorFulfilled, step: "lookup" });

      return json({
        error: null, step: "confirm",
        order: {
          id: order.id,
          name: order.name,
          email: orderEmail,
          created_at: order.created_at,
          total_price: order.total_price,
          currency: order.currency,
          fulfillment_status: order.fulfillment_status,
          line_items: order.line_items?.map((li: any) => ({
            title: li.title,
            variant_title: li.variant_title,
            quantity: li.quantity,
            price: li.price,
          })) || [],
          customer_name: order.customer ? `${order.customer.first_name || ""} ${order.customer.last_name || ""}`.trim() : "",
          customer_id: order.customer?.id ? String(order.customer.id) : "",
        },
      });
    } catch (err: any) {
      console.error("Withdrawal lookup error:", err);
      return json({ error: t.errorNotFound, step: "lookup" });
    }
  }

  if (intent === "cancel") {
    const orderId = formData.get("orderId") as string;
    const orderName = formData.get("orderName") as string;
    const customerEmail = formData.get("customerEmail") as string;
    const customerName = formData.get("customerName") as string;
    const customerId = formData.get("customerId") as string;
    const totalPrice = formData.get("totalPrice") as string;
    const currency = formData.get("currency") as string;

    try {
      const session = await findWorkingSession(shopDomain);
      if (!session) return json({ error: t.errorCancel, step: "confirm" });

      // Cancel order in Shopify
      const cancelResp = await fetch(`https://${shopDomain}/admin/api/2025-04/orders/${orderId}/cancel.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": session.accessToken!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "customer", email: true }),
      });

      if (!cancelResp.ok) {
        const errData = await cancelResp.json().catch(() => null);
        console.error("Shopify cancel error:", cancelResp.status, errData);
        return json({ error: t.errorCancel, step: "confirm" });
      }

      // Save withdrawal record in DB
      await prisma.returnRequest.create({
        data: {
          shop: shopDomain,
          shopifyOrderId: `gid://shopify/Order/${orderId}`,
          shopifyOrderName: orderName,
          customerId: customerId ? `gid://shopify/Customer/${customerId}` : "unknown",
          customerEmail: customerEmail,
          customerName: customerName || "Unknown",
          status: "approved",
          totalRefundAmount: parseFloat(totalPrice) || 0,
          currency: currency || "EUR",
          customerNotes: "odstúpenie od zmluvy",
          adminNotes: `Automatické zrušenie objednávky ${orderName} - odstúpenie od zmluvy podľa EU smernice`,
          approvedAt: new Date(),
        },
      });

      return json({ error: null, step: "success" });
    } catch (err: any) {
      console.error("Withdrawal cancel error:", err);
      return json({ error: t.errorCancel, step: "confirm" });
    }
  }

  return json({ error: "Unknown action", step: "lookup" });
};

export default function WithdrawalPortal() {
  const { error: loaderError, shopName, brandColor, brandGradient, t, lang } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const step = actionData?.step || "lookup";
  const error = actionData?.error || loaderError;
  const order = (actionData as any)?.order;

  if (loaderError === "Store not found") {
    return <html lang="en"><body style={{ fontFamily: "system-ui", display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <p>Store not found</p>
    </body></html>;
  }

  return (
    <html lang={lang}>
      <head><meta charSet="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>{t.pageTitle} - {shopName}</title></head>
      <body>
        <style dangerouslySetInnerHTML={{ __html: `
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { font-family: system-ui, -apple-system, sans-serif; background: #f5f5f7; color: #333; min-height: 100vh; }
          .header { background: ${brandGradient}; color: white; padding: 20px 0; text-align: center; }
          .header h1 { font-size: 24px; font-weight: 600; }
          .header p { opacity: 0.9; margin-top: 4px; }
          .container { max-width: 560px; margin: 0 auto; padding: 24px 16px; }
          .card { background: white; border-radius: 12px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); margin-bottom: 16px; }
          .form-group { margin-bottom: 16px; }
          .form-group label { display: block; font-weight: 600; margin-bottom: 6px; font-size: 14px; }
          .form-group input { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #ddd; font-size: 15px; }
          .form-group input:focus { outline: none; border-color: ${brandColor}; }
          .btn { display: inline-block; padding: 14px 28px; border-radius: 8px; font-size: 16px; font-weight: 600; border: none; cursor: pointer; transition: opacity 0.2s; }
          .btn-primary { background: ${brandGradient}; color: white; width: 100%; }
          .btn-primary:hover { opacity: 0.9; }
          .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
          .btn-cancel { background: #dc2626; color: white; width: 100%; font-size: 17px; padding: 16px; }
          .btn-cancel:hover { background: #b91c1c; }
          .btn-cancel:disabled { opacity: 0.5; cursor: not-allowed; }
          .error { background: #fef2f2; color: #dc2626; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; border: 1px solid #fecaca; }
          .success-box { text-align: center; padding: 40px 20px; }
          .success-icon { font-size: 64px; margin-bottom: 16px; }
          .success-title { font-size: 22px; font-weight: 700; color: #16a34a; margin-bottom: 8px; }
          .success-text { color: #666; font-size: 15px; line-height: 1.6; }
          .order-info { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
          .order-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
          .order-label { color: #888; font-size: 14px; }
          .order-value { font-weight: 600; font-size: 14px; }
          .item-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f5f5f5; }
          .item-title { font-weight: 500; font-size: 14px; }
          .item-detail { color: #888; font-size: 13px; }
          .warning-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 14px; margin-bottom: 20px; font-size: 14px; color: #92400e; line-height: 1.5; }
          .footer { text-align: center; padding: 20px; color: #999; font-size: 13px; }
        `}} />

        <div className="header">
          <h1>{shopName}</h1>
          <p>{t.subtitle}</p>
        </div>

        <div className="container">
          {step === "success" ? (
            <div className="card">
              <div className="success-box">
                <div className="success-icon">&#10003;</div>
                <div className="success-title">{t.successTitle}</div>
                <p className="success-text">{t.successText}</p>
              </div>
            </div>
          ) : step === "confirm" && order ? (
            <>
              <div className="card">
                <h2 style={{ marginBottom: 16, fontSize: 18 }}>{t.orderDetails}</h2>
                <div className="order-info">
                  <div className="order-row">
                    <span className="order-label">{t.orderNumber}</span>
                    <span className="order-value">{order.name}</span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">{t.orderDate}</span>
                    <span className="order-value">{new Date(order.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="order-row">
                    <span className="order-label">{t.orderTotal}</span>
                    <span className="order-value">{order.total_price} {order.currency}</span>
                  </div>
                  <div className="order-row" style={{ borderBottom: "none" }}>
                    <span className="order-label">{t.orderStatus}</span>
                    <span className="order-value" style={{ color: "#16a34a" }}>
                      {order.fulfillment_status === "partial" ? t.statusPartial : t.statusUnfulfilled}
                    </span>
                  </div>
                </div>

                <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{t.items}</h3>
                {order.line_items.map((item: any, i: number) => (
                  <div className="item-row" key={i}>
                    <div>
                      <div className="item-title">{item.title}</div>
                      {item.variant_title && <div className="item-detail">{item.variant_title}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="item-detail">{item.quantity}x</div>
                      <div className="item-title">{item.price} {order.currency}</div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="card">
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>{t.confirmTitle}</h3>
                <div className="warning-box">
                  {t.confirmText}
                </div>
                {error && <div className="error">{error}</div>}
                <Form method="post">
                  <input type="hidden" name="intent" value="cancel" />
                  <input type="hidden" name="orderId" value={order.id} />
                  <input type="hidden" name="orderName" value={order.name} />
                  <input type="hidden" name="customerEmail" value={order.email} />
                  <input type="hidden" name="customerName" value={order.customer_name} />
                  <input type="hidden" name="customerId" value={order.customer_id} />
                  <input type="hidden" name="totalPrice" value={order.total_price} />
                  <input type="hidden" name="currency" value={order.currency} />
                  <button type="submit" className="btn btn-cancel" disabled={isSubmitting}>
                    {isSubmitting ? t.cancelling : t.confirmButton}
                  </button>
                </Form>
              </div>
            </>
          ) : (
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
          )}
        </div>

        <div className="footer">Powered by Returns Manager</div>
      </body>
    </html>
  );
}
