const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'src', 'lib', 'i18n.tsx');
let content = fs.readFileSync(file, 'utf8');

const v003 = {
TR: {
update_v003_title: "Küresel Genişleme ve Güvenlik Revizyonu",
update_v003_desc: "11 yeni dil desteği, güvenlik botu v2.0, telefon doğrulama ve sesli arama kaldırıldı.",
update_v003_item1: "11 yeni dil eklendi: Hintçe, Almanca, Nijeryaca, Fransızca, Belçikaca, Hollandaca, Lehçe, Norveççe, Fince, İsveççe, Yunanca.",
update_v003_item2: "Hanogt Security Bot v2.0: SQL Injection, XSS, Command Injection, Encoded Payload, Fileless Malware algılama.",
update_v003_item3: "Güvenlik botuna davranış analizi, rate limiting ve ağırlıklı puanlama sistemi eklendi.",
update_v003_item4: "Telefon doğrulama kaldırıldı. Sesli mesaj artık doğrulama gerektirmiyor.",
update_v003_item5: "Sesli arama özelliği kaldırıldı.",
update_v003_item6: "Dil seçici yeniden tasarlandı: 20 dil, kaydırılabilir dropdown.",
update_v003_item7: "Toplam 20 dil desteği ile küresel erişim.",
},
EN: {
update_v003_title: "Global Expansion & Security Overhaul",
update_v003_desc: "11 new languages, security bot v2.0, phone verification and voice call removed.",
update_v003_item1: "11 new languages added: Hindi, German, Nigerian Pidgin, French, Belgian, Dutch, Polish, Norwegian, Finnish, Swedish, Greek.",
update_v003_item2: "Hanogt Security Bot v2.0: SQL Injection, XSS, Command Injection, Encoded Payload, Fileless Malware detection.",
update_v003_item3: "Behavioral analysis, rate limiting, and weighted scoring system added to security bot.",
update_v003_item4: "Phone verification removed. Voice messages no longer require verification.",
update_v003_item5: "Voice call feature removed.",
update_v003_item6: "Language selector redesigned: 20 languages, scrollable dropdown.",
update_v003_item7: "Global reach with 20 language support.",
},
DE: {
update_v003_title: "Globale Erweiterung & Sicherheitsüberholung",
update_v003_desc: "11 neue Sprachen, Sicherheitsbot v2.0, Telefonverifizierung und Sprachanruf entfernt.",
update_v003_item1: "11 neue Sprachen hinzugefügt: Hindi, Deutsch, Nigerianisch, Französisch, Belgisch, Niederländisch, Polnisch, Norwegisch, Finnisch, Schwedisch, Griechisch.",
update_v003_item2: "Hanogt Security Bot v2.0: SQL-Injection, XSS, Command-Injection Erkennung.",
update_v003_item3: "Verhaltensanalyse, Rate-Limiting und gewichtetes Bewertungssystem hinzugefügt.",
update_v003_item4: "Telefonverifizierung entfernt. Sprachnachrichten erfordern keine Verifizierung mehr.",
update_v003_item5: "Sprachanruffunktion entfernt.",
update_v003_item6: "Sprachauswahl neu gestaltet: 20 Sprachen, scrollbares Dropdown.",
update_v003_item7: "Globale Reichweite mit 20 Sprachunterstützung.",
},
FR: {
update_v003_title: "Expansion mondiale et refonte de sécurité",
update_v003_desc: "11 nouvelles langues, bot de sécurité v2.0, vérification téléphone et appel vocal supprimés.",
update_v003_item1: "11 nouvelles langues ajoutées : Hindi, Allemand, Nigérian, Français, Belge, Néerlandais, Polonais, Norvégien, Finnois, Suédois, Grec.",
update_v003_item2: "Hanogt Security Bot v2.0 : Détection SQL Injection, XSS, Command Injection.",
update_v003_item3: "Analyse comportementale, limitation de débit et système de notation pondéré ajoutés.",
update_v003_item4: "Vérification téléphone supprimée. Les messages vocaux ne nécessitent plus de vérification.",
update_v003_item5: "Fonction d'appel vocal supprimée.",
update_v003_item6: "Sélecteur de langue repensé : 20 langues, menu déroulant défilable.",
update_v003_item7: "Portée mondiale avec 20 langues supportées.",
}
};

// For languages not explicitly translated, use EN as fallback
const allLangs = ['TR','EN','RU','AZ','ES','KZ','JP','CN','KR','HI','DE','NG','FR','BE','NL','PL','NO','FI','SV','EL'];
const keys = Object.keys(v003.EN);

let count = 0;
for (const lang of allLangs) {
    const marker = `        update_v002_title:`;
    // Find this marker within the lang block
    const langStart = content.indexOf(`    ${lang}: {`);
    if (langStart === -1) continue;
    
    const markerPos = content.indexOf(marker, langStart);
    if (markerPos === -1) continue;
    
    // Check this marker is within the current lang block (not next lang)
    const nextLangIdx = content.indexOf('\n    ', markerPos + 10);
    
    const translations = v003[lang] || v003.EN;
    let insert = '';
    for (const key of keys) {
        const val = (translations[key] || v003.EN[key]).replace(/"/g, '\\"');
        insert += `        ${key}: "${val}",\n`;
    }
    
    content = content.slice(0, markerPos) + insert + content.slice(markerPos);
    count++;
}

fs.writeFileSync(file, content, 'utf8');
console.log(`Added v0.0.3 changelog entries to ${count} language blocks.`);
