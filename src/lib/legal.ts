/** Version metadata shared by the legal pages and the in-app notice. */
export const LEGAL_VERSION = "3.0";
export const LEGAL_EFFECTIVE_DATE = "27 Eylül 2026";
/** Stored in the browser when the user acknowledges the notice; a new id re-shows the notice. */
export const LEGAL_NOTICE_ID = "3.0-2026-09-27";

export const LEGAL_CHANGES: Array<{ version: string; date: string; items: string[] }> = [
    {
        version: "3.0",
        date: "27 Eylül 2026",
        items: [
            "Hanogt News: haber toplama yöntemi, üçüncü taraf içeriklere ilişkin ilkeler, yorum verileri ve otomatik moderasyon eklendi.",
            "Yapay zeka arenası: oyların tuzlanmış takma kimlikle saklanması ve dış sıralama kaynakları açıklandı.",
            "Hanogt Arcade: oyun yayınlama, beğeni, oynanma sayısı, remiks ve kaldırma kuralları eklendi.",
            "Hanogt Engine v2: bulut ve tarayıcı (IndexedDB) kaydı, HTML dışa aktarım ve script sanal makinesi açıklandı.",
            "Güvenlik Merkezi ve Security Bot v6: yerel analiz, k-anonim parola sızıntı kontrolü ve ilgili aktarım açıklandı.",
            "Tarayıcı depolama tablosu (çerez ve yerel depolama anahtarları) ile saklama süreleri tablosu eklendi.",
        ],
    },
    {
        version: "2.0",
        date: "3 Eylül 2026",
        items: [
            "Hanogt Media, gruplar ve Security Bot katkı programı açıklamaları eklendi.",
            "KVKK m.11 hakları, başvuru usulü ve otomatik karar itiraz yolu ayrıntılandırıldı.",
        ],
    },
];
