const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'lib', 'i18n.tsx');
let content = fs.readFileSync(file, 'utf8');

// New keys added for v0.0.4 features
const newKeys = {
    TR: {
        execution_history: "Çalıştırma Geçmişi",
        clear_history: "Geçmişi Temizle",
        no_history: "Henüz çalıştırma yok.",
        data_export: "Veri Dışa Aktarma",
        data_export_desc: "Tüm hesap verilerinizi JSON formatında indirin.",
        download_my_data: "Verilerimi İndir",
    },
    EN: {
        execution_history: "Execution History",
        clear_history: "Clear History",
        no_history: "No executions yet.",
        data_export: "Data Export",
        data_export_desc: "Download all your account data in JSON format.",
        download_my_data: "Download My Data",
    },
    HI: {
        execution_history: "निष्पादन इतिहास",
        clear_history: "इतिहास साफ़ करें",
        no_history: "अभी तक कोई निष्पादन नहीं।",
        data_export: "डेटा निर्यात",
        data_export_desc: "अपने सभी खाता डेटा JSON प्रारूप में डाउनलोड करें।",
        download_my_data: "मेरा डेटा डाउनलोड करें",
    },
    DE: {
        execution_history: "Ausführungsverlauf",
        clear_history: "Verlauf löschen",
        no_history: "Noch keine Ausführungen.",
        data_export: "Datenexport",
        data_export_desc: "Alle Kontodaten im JSON-Format herunterladen.",
        download_my_data: "Meine Daten herunterladen",
    },
    FR: {
        execution_history: "Historique d'exécution",
        clear_history: "Effacer l'historique",
        no_history: "Aucune exécution pour le moment.",
        data_export: "Export de données",
        data_export_desc: "Téléchargez toutes vos données au format JSON.",
        download_my_data: "Télécharger mes données",
    },
    NL: {
        execution_history: "Uitvoeringsgeschiedenis",
        clear_history: "Geschiedenis wissen",
        no_history: "Nog geen uitvoeringen.",
        data_export: "Gegevens exporteren",
        data_export_desc: "Download al uw accountgegevens in JSON-formaat.",
        download_my_data: "Mijn gegevens downloaden",
    },
    PL: {
        execution_history: "Historia wykonań",
        clear_history: "Wyczyść historię",
        no_history: "Brak wykonań.",
        data_export: "Eksport danych",
        data_export_desc: "Pobierz wszystkie dane konta w formacie JSON.",
        download_my_data: "Pobierz moje dane",
    },
    NO: {
        execution_history: "Kjøringshistorikk",
        clear_history: "Tøm historikk",
        no_history: "Ingen kjøringer ennå.",
        data_export: "Dataeksport",
        data_export_desc: "Last ned alle kontodataene dine i JSON-format.",
        download_my_data: "Last ned mine data",
    },
    FI: {
        execution_history: "Suoritushistoria",
        clear_history: "Tyhjennä historia",
        no_history: "Ei suorituksia vielä.",
        data_export: "Tietojen vienti",
        data_export_desc: "Lataa kaikki tilitietosi JSON-muodossa.",
        download_my_data: "Lataa tietoni",
    },
    SV: {
        execution_history: "Körningshistorik",
        clear_history: "Rensa historik",
        no_history: "Inga körningar ännu.",
        data_export: "Dataexport",
        data_export_desc: "Ladda ner all kontodata i JSON-format.",
        download_my_data: "Ladda ner mina data",
    },
    EL: {
        execution_history: "Ιστορικό εκτελέσεων",
        clear_history: "Εκκαθάριση ιστορικού",
        no_history: "Δεν υπάρχουν εκτελέσεις ακόμα.",
        data_export: "Εξαγωγή δεδομένων",
        data_export_desc: "Κατεβάστε όλα τα δεδομένα του λογαριασμού σας σε μορφή JSON.",
        download_my_data: "Λήψη των δεδομένων μου",
    },
    NG: {
        execution_history: "Execution History",
        clear_history: "Clear History",
        no_history: "No execution don happen yet.",
        data_export: "Data Export",
        data_export_desc: "Download all your account data for JSON format.",
        download_my_data: "Download My Data",
    },
    BE: {
        execution_history: "Uitvoeringsgeschiedenis",
        clear_history: "Geschiedenis wissen",
        no_history: "Nog geen uitvoeringen.",
        data_export: "Gegevensexport",
        data_export_desc: "Download al uw accountgegevens in JSON-formaat.",
        download_my_data: "Mijn gegevens downloaden",
    },
};

// Also add for existing languages
const existingLangs = { RU: 'EN', AZ: 'EN', ES: 'EN', KZ: 'EN', JP: 'EN', CN: 'EN', KR: 'EN' };

const allLangs = [...Object.keys(newKeys), ...Object.keys(existingLangs)];
let count = 0;

for (const lang of allLangs) {
    const translations = newKeys[lang] || newKeys.EN;
    const keys = Object.keys(translations);
    
    // Find the lang block's update_v003_title line (which we know exists)
    const marker = `        update_v003_title:`;
    const langStart = content.indexOf(`    ${lang}: {`);
    if (langStart === -1) continue;
    
    const markerPos = content.indexOf(marker, langStart);
    if (markerPos === -1) continue;
    
    // Check if keys already exist
    const testKey = `        execution_history:`;
    const testPos = content.indexOf(testKey, langStart);
    const nextLang = content.indexOf('\n    ', langStart + 10);
    if (testPos !== -1 && (nextLang === -1 || testPos < nextLang)) {
        console.log(`${lang}: already has new keys, skipping`);
        continue;
    }
    
    let insert = '';
    for (const key of keys) {
        const val = translations[key].replace(/"/g, '\\"');
        insert += `        ${key}: "${val}",\n`;
    }
    
    content = content.slice(0, markerPos) + insert + content.slice(markerPos);
    count++;
}

fs.writeFileSync(file, content, 'utf8');
console.log(`Added new v0.0.4 keys to ${count} language blocks.`);
