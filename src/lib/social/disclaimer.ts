/**
 * Hanogt Social's disclaimer, shown in Hanogt Social's settings (Safety),
 * when a group is created and once on first use. It mirrors the Terms of
 * Use (Hanogt Social, notices and liability sections). Framework-free.
 */
import type { Copy } from "@/lib/i18n";

export const SOCIAL_DISCLAIMER_TITLE: Copy = { TR: "Sorumluluk reddi", EN: "Disclaimer" };

export const SOCIAL_DISCLAIMER: Copy = {
    TR: "Hanogt Social'da paylaşılan mesajlar, GIF'ler, sesli mesajlar ve dosyalar onları paylaşan kullanıcıların sorumluluğundadır. Hanogt bu içerikleri önceden denetlemez; Hanogt Security Bot ve AutoMod gibi otomatik araçlar her ihlali yakalayamaz. Yürürlükteki mevzuatın izin verdiği ölçüde Hanogt, kullanıcıların paylaştığı içeriklerden ve bu içeriklerden doğan zararlardan sorumlu tutulamaz.",
    EN: "Messages, GIFs, voice messages and files shared on Hanogt Social are the responsibility of the people who share them. Hanogt doesn't review this content in advance, and automated tools such as Hanogt Security Bot and AutoMod can't catch every violation. To the extent permitted by applicable law, Hanogt is not liable for content shared by users or for damage arising from it.",
};

export const SOCIAL_NOTICE_PATH: Copy = {
    TR: "Hukuka aykırı bir içerik gördüğünde bunu bir destek talebiyle bize bildirebilirsin. Usulüne uygun bildirimler ve yetkili makam kararları, 5651 sayılı Kanun ve ilgili mevzuat çerçevesinde uygulanabildiği ölçüde incelenir, kayıt altına alınır ve kapsamıyla sınırlı olarak uygulanır.",
    EN: "If you see unlawful content, you can report it to us with a support ticket. Proper notices and decisions of competent authorities are reviewed, recorded and applied only within their scope, as far as applicable under Law No. 5651 and related legislation.",
};

export const SOCIAL_GROUP_REPORT: Copy = {
    TR: "Bir gruptaki kural ihlalini /rapor @kişi sebep komutuyla grubun moderatörlerine de iletebilirsin.",
    EN: "You can also report a rule break in a group to its moderators with /report @person reason.",
};

/** Shown in the group creation wizard: what running a group means. */
export const GROUP_OWNER_NOTE: Copy = {
    TR: "Grubu oluşturduğunda grubun sahibi olursun: grubu Kullanım Şartları'na uygun yönetmekten ve grubun kurallarını, yöneticileri, moderatörleri ve AutoMod ayarlarını belirlemekten sen sorumlusun. Hanogt Security Bot her grupta bulunur ve kaldırılamaz.",
    EN: "When you create the group, you become its owner: you're responsible for running it in line with the Terms of Use and for choosing its rules, admins, moderators and AutoMod settings. Hanogt Security Bot is part of every group and can't be removed.",
};
