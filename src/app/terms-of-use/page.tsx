import type { Metadata } from "next";
import LegalPage, { type LegalHighlight, type LegalSection } from "@/components/LegalPage";

export const metadata: Metadata = {
    title: "Kullanım Şartları",
    description: "Hanogt Codev hesabı, kabul edilebilir kullanım, kod çalıştırma, sorumlu güvenlik araştırması, içerik ve lisanslar, yapay zekâ çıktıları, yaptırımlar, sorumluluk ve uyuşmazlık kuralları.",
    alternates: { canonical: "/terms-of-use" },
};

// Turkish is the authoritative text; keep every paragraph a separate { TR, EN }
// pair with plain string literals so the copy packs can translate it.

const highlights: LegalHighlight[] = [
    {
        title: { TR: "İçerik sizindir", EN: "Your content is yours" },
        text: { TR: "Kodunuz ve oyunlarınız sizindir; bize yalnızca hizmeti sunmak için gereken sınırlı bir izin verirsiniz.", EN: "Your code and games belong to you; you only give us the limited permission needed to provide the service." },
    },
    {
        title: { TR: "Güvenli ve saygılı kullanım", EN: "Safe and respectful use" },
        text: { TR: "Zararlı kod, saldırılar, içerik kazıma, taciz ve hukuka aykırı içerik yasaktır.", EN: "Malicious code, attacks, scraping, harassment and illegal content are not allowed." },
    },
    {
        title: { TR: "Orantılı yaptırım, itiraz hakkı", EN: "Proportionate enforcement, right to appeal" },
        text: { TR: "Uyarıdan hesap silmeye kadar yaptırımlar orantılı uygulanır; destek talebiyle itiraz edebilirsiniz.", EN: "Measures from warnings to account deletion are applied proportionately, and you can appeal with a support ticket." },
    },
    {
        title: { TR: "Emredici haklar saklı", EN: "Mandatory rights preserved" },
        text: { TR: "6502 sayılı Kanun ve diğer emredici hükümlerden doğan haklarınız bu şartlarla kaldırılamaz.", EN: "Your rights under Consumer Protection Law No. 6502 and other mandatory rules cannot be removed by these terms." },
    },
];

const sections: LegalSection[] = [
    {
        id: "contract",
        title: { TR: "Taraflar, kapsam ve kabul", EN: "Parties, scope and acceptance" },
        paragraphs: [
            { TR: "Bu Kullanım Şartları (“Şartlar”), Hanogt Codev web sitesi, masaüstü ve mobil uygulamaları ile bunlar üzerinden sunulan tüm hizmetlerin (“Hizmet”) kullanımına ilişkin olarak, Hizmeti işleten HanStudios / Hanogt Codev işletmesi (“Hanogt”, “biz”) ile Hizmeti kullanan kişi (“siz”) arasındaki ilişkiyi düzenler.", EN: "These Terms of Use (the “Terms”) govern the relationship between HanStudios / Hanogt Codev, the business that operates Hanogt Codev (“Hanogt”, “we”), and the person using it (“you”), in respect of the Hanogt Codev website, its desktop and mobile apps and all services offered through them (the “Service”)." },
            { TR: "Hesap oluşturarak veya Hizmeti kullanarak Şartların o tarihteki sürümünü kabul etmiş olursunuz. Kişisel verilerinizin işlenmesi [Gizlilik Politikası](/privacy-policy) ve [KVKK Aydınlatma Metni](/disclosure) ile açıklanır; bu metinler bilgilendirme amaçlıdır ve Şartları kabul etmeniz açık rıza verdiğiniz anlamına gelmez.", EN: "By creating an account or using the Service, you accept the version of the Terms in force at that time. How your personal data is processed is explained in the [Privacy Policy](/privacy-policy) and the [KVKK Information Notice](/disclosure); those texts are for information, and accepting the Terms does not mean you give explicit consent." },
            { TR: "İşletmecinin ticari unvanı, adresi, MERSİS/VKN, KEP ve iletişim bilgileri henüz yayımlanmamıştır; yayımlandığında Şartlara eklenecektir. O zamana kadar bize uygulama içindeki destek talebi kanalından ulaşabilirsiniz.", EN: "The operator's trade name, address, MERSİS/tax number, KEP and contact details have not been published yet; they will be added to the Terms when they are. Until then, you can reach us through the in-app support ticket channel." },
        ],
    },
    {
        id: "definitions",
        title: { TR: "Tanımlar", EN: "Definitions" },
        items: [
            { TR: "Hesap: Hizmeti kullanmak için e-posta ve parolayla veya Google ile oluşturduğunuz kişisel hesap.", EN: "Account: the personal account you create with an e-mail address and password or with Google to use the Service." },
            { TR: "Kullanıcı İçeriği: Hizmete yüklediğiniz veya Hizmette oluşturduğunuz kod, oyun, görsel, metin, ses, yorum, mesaj ve diğer içerikler.", EN: "User Content: the code, games, images, text, audio, comments, messages and other content you upload to or create in the Service." },
            { TR: "Herkese açık içerik: Media'da, Arcade'de, haber yorumlarında veya geri bildirim panosunda yayımladığınız ve başkalarının görebildiği içerik.", EN: "Public content: content you publish on Media, the Arcade, news comments or the feedback board that others can see." },
            { TR: "Hanogt AI: Hizmete yerleşik; tarayıcıda çalışan Çekirdeği ve üçüncü taraf bir dil modelini kullanan yapay zekâ asistanı ve ajan modu.", EN: "Hanogt AI: the AI assistant built into the Service, using the in-browser Core and a third-party language model, including agent mode." },
            { TR: "Ekip: Hizmeti yöneten ve rolü sahip, yönetici veya moderatör olan kişiler.", EN: "Staff: the people who run the Service and hold the role of owner, administrator or moderator." },
        ],
    },
    {
        id: "eligibility",
        title: { TR: "Kimler kullanabilir?", EN: "Who can use the Service" },
        items: [
            { TR: "Hizmeti kullanmak için en az 13 yaşında olmalısınız.", EN: "You must be at least 13 years old to use the Service." },
            { TR: "18 yaşından küçükseniz Hizmeti ebeveyninizin veya yasal temsilcinizin bilgisi dahilinde kullanmalısınız; uygulanacak hukukun gerektirdiği durumlarda onların onayı da gerekir.", EN: "If you are under 18, you should use the Service with the knowledge of a parent or legal guardian, and with their consent where the applicable law requires it." },
            { TR: "Şartların ağır ihlali nedeniyle hesabı kapatılan kişiler, iznimiz olmadan yeni hesap açamaz.", EN: "People whose account was closed for a serious breach of the Terms may not open a new account without our permission." },
            { TR: "Hizmeti bir kurum adına kullanıyorsanız, o kurumu bu Şartlarla bağlamaya yetkili olduğunuzu kabul edersiniz.", EN: "If you use the Service on behalf of an organisation, you confirm that you are authorised to bind that organisation to these Terms." },
        ],
    },
    {
        id: "account",
        title: { TR: "Hesap ve hesap güvenliği", EN: "Your account and its security" },
        items: [
            { TR: "Doğru bilgi vermeli ve hesabınızı güncel tutmalısınız. Hesap kişiseldir; devredilemez, satılamaz veya başkasıyla paylaşılamaz.", EN: "You must give accurate information and keep your account up to date. Your account is personal; it can't be transferred, sold or shared." },
            { TR: "Güçlü ve benzersiz bir parola kullanmalı, parolanızı ve doğrulama kodlarınızı kimseyle paylaşmamalısınız. İki adımlı doğrulamayı açmanızı ve kurtarma kodlarınızı güvenli bir yerde saklamanızı öneririz.", EN: "You must use a strong, unique password and never share your password or verification codes. We recommend turning on two-step verification and keeping your recovery codes somewhere safe." },
            { TR: "Hesabınıza yetkisiz erişim fark ederseniz parolanızı hemen değiştirin ve “Güvenlik Açığı” kategorisinde destek talebiyle bize bildirin. Ortak kullanılan cihazlarda işiniz bitince çıkış yapın.", EN: "If you notice unauthorised access to your account, change your password immediately and tell us with a support ticket in the “Security vulnerability” category. Sign out when you're done on shared devices." },
            { TR: "Hesabınız üzerinden yapılan işlemlerden, hesabınızın güvenliğini sağlama konusundaki kusurunuz ölçüsünde sorumlusunuz.", EN: "You are responsible for actions taken through your account to the extent that you failed to keep it secure." },
            { TR: "Hanogt ekibi sizden hiçbir zaman parola, doğrulama kodu veya kurtarma kodu istemez; böyle bir istekle karşılaşırsanız bize bildirin.", EN: "Hanogt staff will never ask for your password, verification codes or recovery codes; if anyone does, please report it to us." },
        ],
    },
    {
        id: "service",
        title: { TR: "Hizmetin niteliği ve değişiklikler", EN: "The Service and changes to it" },
        paragraphs: [
            { TR: "Hizmet şu anda ücretsizdir ve sürekli geliştirilmektedir. Kod düzenleme ve çalıştırma, tarayıcıda çalışan bir oyun motoru, oyun ve kod paylaşımı, haberler, iletişim özellikleri, güvenlik araçları ve bir yapay zekâ asistanı sunar. Bazı özellikler deneme (beta) aşamasında olabilir.", EN: "The Service is currently free and under continuous development. It offers code editing and execution, a game engine that runs in the browser, game and code sharing, news, communication features, security tools and an AI assistant. Some features may be in a trial (beta) stage." },
            { TR: "Hizmetin kesintisiz veya hatasız çalışacağını garanti etmeyiz. Bakım, güvenlik müdahaleleri veya üçüncü taraf altyapı sorunları nedeniyle özellikler geçici olarak kullanılamayabilir. Özellikleri değiştirebilir veya kaldırabiliriz; bir değişiklik verilerinizi önemli ölçüde etkileyecekse, acil güvenlik veya hukuki zorunluluk hâlleri dışında, bunu makul bir süre önce duyurur ve verilerinizi dışa aktarma imkânı sunarız.", EN: "We don't guarantee that the Service will be uninterrupted or error-free. Features may be temporarily unavailable because of maintenance, security work or third-party infrastructure problems. We may change or remove features; if a change will significantly affect your data, we will announce it a reasonable time in advance and let you export your data, except in urgent security or legal situations." },
        ],
    },
    {
        id: "acceptable-use",
        title: { TR: "Kabul edilebilir kullanım", EN: "Acceptable use" },
        paragraphs: [
            { TR: "Hizmeti hukuka, bu Şartlara ve başkalarının haklarına saygılı biçimde kullanmalısınız. Özellikle şunları yapamazsınız:", EN: "You must use the Service lawfully and respect these Terms and the rights of others. In particular, you may not:" },
        ],
        items: [
            { TR: "çocukların cinsel istismarına ilişkin içerik, şiddeti veya terörü öven içerik, nefret söylemi, dolandırıcılık ve yasa dışı mal veya hizmet ticareti dahil hukuka aykırı içerik yayımlamak veya göndermek;", EN: "publish or send illegal content, including child sexual abuse material, content praising violence or terrorism, hate speech, fraud and trade in illegal goods or services;" },
            { TR: "başkalarını taciz etmek, tehdit etmek, aşağılamak, ısrarla rahatsız etmek veya hedef göstermek;", EN: "harass, threaten, demean, stalk or target others;" },
            { TR: "başkalarının kişisel verilerini (kimlik numarası, adres, telefon, fotoğraf vb.) izinsiz paylaşmak;", EN: "share other people's personal data (ID numbers, addresses, phone numbers, photos and the like) without permission;" },
            { TR: "başka bir kişiyi, Hanogt ekibini veya bir kurumu taklit etmek ya da kendinizi yanıltıcı biçimde tanıtmak;", EN: "impersonate another person, Hanogt staff or an organisation, or misrepresent yourself;" },
            { TR: "zararlı yazılım, fidye yazılımı, kimlik bilgisi hırsızı, tuş kaydedici, oltalama sayfası veya kiti dağıtmak ya da bunları geliştirmek için Hizmeti kullanmak;", EN: "distribute malware, ransomware, credential stealers, keyloggers, phishing pages or kits, or use the Service to develop them;" },
            { TR: "Hizmete, altyapısına, diğer kullanıcılara veya üçüncü kişilerin sistemlerine saldırmak; yetkisiz erişim, servis dışı bırakma (DoS) saldırısı, ağ veya zafiyet taraması yapmak (sorumlu güvenlik araştırması kuralları dışında) ya da güvenlik önlemlerini, hız sınırlarını veya Security Bot'u atlatmaya çalışmak;", EN: "attack the Service, its infrastructure, other users or third-party systems; gain unauthorised access, carry out denial-of-service (DoS) attacks or network or vulnerability scans (outside the responsible security research rules); or try to get around security measures, rate limits or Security Bot;" },
            { TR: "Hizmetin içeriğini, profilleri, Media projelerini, Arcade oyunlarını veya haber verilerini otomatik araçlarla toplu olarak kazımak (scraping), botlarla aşırı yük oluşturmak veya Hizmetin arayüzlerini Hizmet dışında izinsiz kullanmak; arama motorlarının olağan dizinlemesi bunun dışındadır;", EN: "scrape the Service's content, profiles, Media projects, Arcade games or news data in bulk with automated tools, overload the Service with bots, or use the Service's interfaces outside the Service without permission; ordinary indexing by search engines is excluded;" },
            { TR: "spam, zincir mesaj veya istenmeyen reklam göndermek; oyları, beğenileri, oynanma sayılarını veya yorumları birden fazla hesapla ya da otomasyonla manipüle etmek;", EN: "send spam, chain messages or unsolicited advertising, or manipulate votes, likes, play counts or comments with multiple accounts or automation;" },
            { TR: "otomasyonla toplu hesap açmak, askıya alınan bir hesabın yerine yeni hesap açmak veya hesap alıp satmak;", EN: "create accounts in bulk with automation, open a new account to replace a suspended one, or buy or sell accounts;" },
            { TR: "başkalarının telif, marka veya diğer fikrî haklarını ihlal eden içerik yayımlamak;", EN: "publish content that infringes others' copyright, trademarks or other intellectual property rights;" },
            { TR: "sesli aramaları karşı tarafın bilgisi ve rızası olmadan kaydetmek.", EN: "record voice calls without the other person's knowledge and consent." },
        ],
    },
    {
        id: "code-execution",
        title: { TR: "Kod çalıştırma kuralları", EN: "Code execution rules" },
        paragraphs: [
            { TR: "Kod çalıştırma; öğrenme, deneme ve geliştirme içindir. Tarayıcıda çalışmayan dillerdeki kodunuz, üçüncü taraflarca ya da Hanogt adına işletilen ortak çalıştırıcılarda yürütülür. Bu nedenle:", EN: "Code execution is for learning, experimenting and development. Code in languages that don't run in the browser is executed on shared runners operated by third parties or for Hanogt. Therefore:" },
        ],
        items: [
            { TR: "çalıştırıcıları zararlı yazılım geliştirmek veya denemek, kripto para kazmak, başka sistemlere istek göndermek ya da onları taramak, yalıtımdan kaçmaya çalışmak veya kaynakları kasıtlı olarak tüketmek (ör. fork bombası) için kullanamazsınız;", EN: "you may not use the runners to develop or test malware, mine cryptocurrency, send requests to or scan other systems, try to escape isolation, or deliberately exhaust resources (for example with a fork bomb);" },
            { TR: "Security Bot taramasını atlatmak için kodu gizleyemez (obfuscation), parçalara bölemez veya başka yollara başvuramazsınız;", EN: "you may not obfuscate code, split it up or use other tricks to get around the Security Bot scan;" },
            { TR: "hız sınırlarını aşmak için birden fazla hesap veya otomasyon kullanamazsınız;", EN: "you may not use multiple accounts or automation to get around rate limits;" },
            { TR: "çalıştırdığınız koda parola, erişim anahtarı veya kişisel veri koymamalısınız, çünkü bu kod üçüncü taraf hizmetlere iletilir;", EN: "you shouldn't put passwords, access keys or personal data in code you run, because it is passed to third-party services;" },
            { TR: "herkese açık derleyiciler kendi kullanım koşullarına tabidir ve her zaman erişilebilir olmayabilir; bunların kullanılabilirliğini veya sonuçlarını garanti edemeyiz.", EN: "public compilers have their own terms of use and may not always be available; we can't guarantee their availability or results." },
        ],
        after: [
            { TR: "Bu kuralların ihlali, kod çalıştırmanın engellenmesine ve [yaptırımlar](/terms-of-use#moderation) bölümündeki önlemlere yol açabilir. Kodun hangi hizmetlere iletildiği [Gizlilik Politikası](/privacy-policy#code-execution)'nda açıklanır.", EN: "Breaking these rules may lead to code execution being blocked and to the measures in the [enforcement](/terms-of-use#moderation) section. Which services receive your code is explained in the [Privacy Policy](/privacy-policy#code-execution)." },
        ],
    },
    {
        id: "security-research",
        title: { TR: "Sorumlu güvenlik araştırması", EN: "Responsible security research" },
        paragraphs: [
            { TR: "Güvenlik açıklarını bulup bize bildiren araştırmacılara teşekkür ederiz. Aşağıdaki kurallara iyi niyetle uyduğunuz sürece araştırmanızı yetkili kabul ederiz ve yalnızca bu araştırma nedeniyle size karşı hukuki işlem başlatmaz, şikâyette bulunmayız. Bu taahhüt yalnızca Hanogt'u bağlar; üçüncü kişilerin haklarını veya kamu makamlarının yetkilerini sınırlamaz.", EN: "We thank researchers who find and report vulnerabilities to us. As long as you follow the rules below in good faith, we consider your research authorised, and we will not take legal action or file a complaint against you because of that research alone. This commitment binds only Hanogt; it does not limit the rights of third parties or the powers of public authorities." },
        ],
        items: [
            { TR: "Kapsam: Hanogt Codev web sitesi ve uygulamaları ile kendi hesaplarınız. Üçüncü taraf hizmetler (ör. Google, Firebase, Vercel, dil modeli sağlayıcısı, Wandbox, JetBrains, haber yayıncıları) kapsam dışıdır; bunlarda ancak kendi kurallarına uygun araştırma yapabilirsiniz.", EN: "Scope: the Hanogt Codev website and apps, and your own accounts. Third-party services (for example Google, Firebase, Vercel, the language model provider, Wandbox, JetBrains and news publishers) are out of scope; you may research them only under their own rules." },
            { TR: "Yalnızca kendi hesaplarınızı ve kendi oluşturduğunuz test verilerini kullanın; başka kullanıcıların hesaplarına, verilerine veya iletişimlerine erişmeyin, onları değiştirmeyin veya silmeyin.", EN: "Use only your own accounts and test data you created; don't access, change or delete other users' accounts, data or communications." },
            { TR: "Bir açık başkalarının verilerine erişim sağlıyorsa, açığı doğrulamak için gereken asgari işlemi yapıp durun; gördüğünüz verileri saklamayın, kopyalamayın ve paylaşmayın. Veri sızdırmak yasaktır.", EN: "If a vulnerability gives access to other people's data, do only the minimum needed to confirm it and stop; don't keep, copy or share any data you see. Exfiltrating data is prohibited." },
            { TR: "Servis dışı bırakma (DoS) ve yük testleri, spam, sosyal mühendislik (kullanıcılara veya ekibe yönelik oltalama dahil), fiziksel saldırılar ve otomatik tarayıcılarla aşırı trafik oluşturmak yasaktır.", EN: "Denial-of-service (DoS) and load testing, spam, social engineering (including phishing users or staff), physical attacks and generating heavy traffic with automated scanners are prohibited." },
            { TR: "Kod çalıştırma altyapısında yalıtımdan kaçış denemeleri, çalıştırıcılar üçüncü taraflara ait olabileceğinden kapsam dışıdır.", EN: "Attempts to escape isolation in the code execution infrastructure are out of scope, because the runners may belong to third parties." },
            { TR: "Bulgunuzu [Geri Bildirim ve SSS](/feedback) sayfasından “Güvenlik Açığı” kategorisinde destek talebiyle, yeniden üretme adımlarıyla birlikte bildirin; bildirime gerçek parola, erişim anahtarı veya başkalarına ait kişisel veri eklemeyin.", EN: "Report your finding with a support ticket in the “Security vulnerability” category on the [Feedback & FAQ](/feedback) page, with steps to reproduce it; don't include real passwords, access keys or other people's personal data." },
            { TR: "Açığı düzeltmemiz için makul süre tanıyın; açık düzeltilmeden veya bizimle anlaşmadan önce kamuya açıklamayın.", EN: "Give us reasonable time to fix the issue, and don't disclose it publicly before it is fixed or we have agreed on disclosure." },
        ],
        after: [
            { TR: "Şu anda ücretli bir hata ödül programımız yoktur. Bu kurallara uymayan araştırmalar iyi niyet güvencesinden yararlanamaz.", EN: "We don't currently run a paid bug bounty programme. Research that doesn't follow these rules is not covered by this good-faith commitment." },
        ],
    },
    {
        id: "content",
        title: { TR: "Kullanıcı içeriği ve verdiğiniz izin", EN: "Your content and the licence you give us" },
        paragraphs: [
            { TR: "Kullanıcı İçeriğiniz size aittir. Bu içeriğin hak sahibi olduğunuzu veya onu bu şekilde kullanmak için gerekli izinlere sahip olduğunuzu kabul edersiniz.", EN: "Your User Content belongs to you. You confirm that you own it or have the permissions needed to use it in this way." },
            { TR: "Hizmeti sunabilmemiz için Hanogt'a; Kullanıcı İçeriğinizi saklama, yedekleme, kopyalama, teknik olarak biçimini dönüştürme (ör. derleme, sıkıştırma, önizleme), sizin talebinizle çalıştırma ve sizin seçtiğiniz kişilere ya da herkese açık alanlarda gösterme amacıyla dünya çapında, ücretsiz, münhasır olmayan ve devredilemez bir izin verirsiniz. Bu izin yalnızca Hizmeti işletmek ve korumakla sınırlıdır ve yalnızca bu amaçla bize yardımcı olan hizmet sağlayıcılara aktarılabilir. İçeriğinizi satmayız, reklamda kullanmayız ve açık rızanız olmadan yapay zekâ modellerini eğitmek için kullanmayız.", EN: "So that we can provide the Service, you give Hanogt a worldwide, free, non-exclusive and non-transferable licence to store, back up, copy and technically convert (for example compile, compress or preview) your User Content, run it at your request, and show it to the people you choose or in public areas. This licence is limited to operating and protecting the Service and may be passed on only to service providers who help us for that purpose. We don't sell your content, use it in advertising or use it to train AI models without your explicit consent." },
            { TR: "Bu izin, içeriği sildiğinizde veya hesabınızı kapattığınızda sona erer. Ancak açık kaynak lisansıyla yayımladığınız içerik için başkalarına tanıdığınız lisans hakları, başkalarının daha önce indirdiği, remikslediği veya dışa aktardığı kopyalar, grup sohbetlerinde anonimleştirilerek kalan mesajlar ve yasal saklama yükümlülükleri bakımından etkiler devam edebilir.", EN: "This licence ends when you delete the content or close your account. However, the licences you granted others for content published under an open-source licence, copies others have already downloaded, remixed or exported, messages that remain in group chats in anonymised form, and legal retention obligations may continue to have effect." },
            { TR: "5846 sayılı Fikir ve Sanat Eserleri Kanunu'ndan doğan manevi haklarınız saklıdır.", EN: "Your moral rights under Law No. 5846 on Intellectual and Artistic Works are reserved." },
        ],
    },
    {
        id: "media-license",
        title: { TR: "Hanogt Media yayınları ve lisanslar", EN: "Hanogt Media posts and licences" },
        paragraphs: [
            { TR: "Media sayfasından veya doğrudan kod editöründen yayımladığınız proje herkese açık hâle gelir; herkes tarafından görüntülenebilir ve indirilebilir. Yayımlarken bir paylaşım lisansı seçersiniz:", EN: "A project you publish on Media, from the Media page or directly from the code editor, becomes public: anyone can view and download it. When publishing, you choose a sharing licence:" },
        ],
        items: [
            { TR: "“Lisans belirtilmedi · tüm haklar saklı”: Diğer kullanıcılar projeyi Hizmet içinde görüntüleyebilir ve kişisel inceleme için indirebilir; sizin izniniz olmadan çoğaltamaz, değiştiremez, yeniden yayımlayamaz veya ticari olarak kullanamaz.", EN: "“No licence · all rights reserved”: other users can view the project in the Service and download it for personal study; without your permission they may not copy, modify, republish or commercially use it." },
            { TR: "MIT, Apache 2.0 veya GPL 3.0: Projeyi indiren herkes onu seçtiğiniz lisansın koşullarıyla kullanabilir, değiştirebilir ve dağıtabilir. Açık kaynak lisansı, o sürümü edinmiş kişiler bakımından geri alınamaz; yayını kaldırmanız yalnızca yeni indirmeleri durdurur.", EN: "MIT, Apache 2.0 or GPL 3.0: anyone who downloads the project may use, modify and distribute it under the terms of the licence you chose. An open-source licence can't be revoked for people who already obtained that version; removing the post only stops new downloads." },
        ],
        after: [
            { TR: "Lisans seçimi yalnızca sizin hak sahibi olduğunuz kısımlar için geçerlidir. Projenizdeki üçüncü kişilere ait kod ve bağımlılıkların lisanslarına uymak da, başkalarının projelerini kullanırken lisans koşullarına uymak da sizin sorumluluğunuzdadır; indirdiğiniz kodu çalıştırmadan önce inceleyin.", EN: "Your choice of licence only covers the parts you own. You are responsible for complying with the licences of any third-party code and dependencies in your project, and with the licence terms when you use other people's projects; review downloaded code before running it." },
            { TR: "Yayımlamadan önce kodunuzda kişisel veri, parola, erişim anahtarı veya kullanma izniniz olmayan üçüncü kişi içeriği bulunmadığını kontrol edin. Yayınlar Security Bot taramasından geçer; bu tarama yayının güvenli olduğunu garanti etmez.", EN: "Before publishing, check that your code contains no personal data, passwords, access keys or third-party content you have no permission to use. Posts go through the Security Bot scan, but the scan doesn't guarantee that a post is safe." },
            { TR: "Yayınınızı sonradan güncelleyebilir (başlık, açıklama, etiketler, lisans, yazar adının gösterimi ve dosyalar) veya kaldırabilirsiniz; güncellenen dosyalar yeniden taranır. Lisansı sonradan değiştirmeniz, önceki sürümü eski lisansla edinmiş kişilerin haklarını etkilemez.", EN: "You can later update your post (title, description, tags, licence, whether your author name is shown and the files) or remove it; updated files are scanned again. Changing the licence later doesn't affect the rights of people who obtained an earlier version under the previous licence." },
        ],
    },
    {
        id: "engine-arcade",
        title: { TR: "Hanogt Engine ve Hanogt Arcade", EN: "Hanogt Engine and Hanogt Arcade" },
        paragraphs: [
            { TR: "Hanogt Engine, Unity'ye benzeyen ancak ondan bağımsız, tarayıcıda çalışan bir oyun motorudur; Unity'nin veya başka bir ticari motorun resmî ürünü değildir ve onlarla tam uyumluluk garantisi verilmez. C# ve C++ scriptler Hanogt'un script sanal makinesinde yorumlanır; dillerin tüm özellikleri desteklenmez.", EN: "Hanogt Engine is a game engine that runs in the browser and is similar to, but independent of, Unity; it is not an official product of Unity or any other commercial engine, and full compatibility with them is not guaranteed. C# and C++ scripts are interpreted in Hanogt's script virtual machine, and not every language feature is supported." },
            { TR: "Giriş yapmadan oluşturulan projeler yalnızca tarayıcınızda saklanır ve tarayıcı verileri silinince kaybolabilir; önemli projelerinizi dışa aktarıp yedeklemenizi öneririz.", EN: "Projects created without signing in are stored only in your browser and may be lost if browser data is cleared; we recommend exporting and backing up important projects." },
            { TR: "Bir oyunu Arcade'de yayımladığınızda, oyunun herkese açık olarak oynanmasına ve görüntülenmesine, diğer kullanıcıların da onu Hizmet içinde kendi projelerine kopyalayıp değiştirmesine (remiks) izin verirsiniz. Remiksini yayımlayan kullanıcı orijinal yazara atıf yapmalıdır. Yayını istediğiniz zaman kaldırabilirsiniz; ancak daha önce oluşturulmuş remiksler ve dışa aktarılmış kopyalar uzaktan silinemez.", EN: "When you publish a game on the Arcade, you allow it to be played and viewed publicly, and allow other users to copy it into their own projects in the Service and modify it (remix). A user who publishes a remix must credit the original author. You can unpublish at any time, but remixes and exported copies made earlier can't be deleted remotely." },
        ],
        items: [
            { TR: "Başkasına ait bir oyunu izinsiz kendi eserinizmiş gibi yayımlayamazsınız.", EN: "You may not publish someone else's game as your own without permission." },
            { TR: "Yanıltıcı başlık veya kapak kullanamaz, reklam amaçlı spam oyunlar yayımlayamaz, oynanma veya beğeni sayılarını yapay olarak artıramazsınız.", EN: "You may not use misleading titles or covers, publish spam games for advertising or artificially inflate play or like counts." },
            { TR: "Oyun içinde kişisel veri toplayamaz, oyuncuları kandıramaz veya zararlı içerik sunamazsınız.", EN: "You may not collect personal data in a game, deceive players or present harmful content." },
            { TR: "Beğeni ve oynanma sayıları kalite veya güvenlik garantisi değildir.", EN: "Like and play counts are not a guarantee of quality or safety." },
        ],
    },
    {
        id: "news",
        title: { TR: "Hanogt News, yorumlar ve arena", EN: "Hanogt News, comments and the arena" },
        paragraphs: [
            { TR: "Hanogt News, yayıncıların herkese açık akışlarından derlenen başlıkları, kısa özetleri ve orijinal habere bağlantıları gösterir. Haberlerin içeriği, doğruluğu ve hakları ilgili yayıncılara aittir; Hanogt haberleri düzenlemez veya onaylamaz. İçeriğinin gösterilmesini istemeyen yayıncılar destek talebiyle bize ulaşabilir; içerikleri akıştan çıkarılır.", EN: "Hanogt News shows headlines, short summaries and links to original articles gathered from publishers' public feeds. The content, accuracy and rights of the news belong to the publishers; Hanogt does not edit or endorse it. Publishers who don't want their content shown can contact us with a support ticket and it will be removed from the feed." },
            { TR: "Finans & Ekonomi kategorisindeki piyasa şeridi (döviz kurları, altın, BIST 100, S&P 500, Bitcoin) üçüncü taraf kaynaklardan alınır; veriler gecikmeli veya eksik olabilir, yalnızca bilgi amaçlıdır ve yatırım tavsiyesi değildir. Bu verilere dayanarak verdiğiniz kararlardan Hanogt sorumlu tutulamaz; emredici tüketici hakları saklıdır.", EN: "The market strip in the Finance & Economy category (exchange rates, gold, BIST 100, S&P 500, Bitcoin) comes from third-party sources; the data may be delayed or incomplete, is for information only and is not investment advice. Hanogt can't be held responsible for decisions you make based on it; mandatory consumer rights remain unaffected." },
            { TR: "Yapay zekâ arenasındaki topluluk puanları yalnızca Hanogt kullanıcılarının oylarından hesaplanır ve resmî bir değerlendirme (benchmark) değildir. Dış kaynaklı sıralamalar ilgili kaynağa atfedilerek gösterilir.", EN: "Community scores in the AI arena are calculated only from Hanogt users' votes and are not an official benchmark. External rankings are shown with credit to their source." },
        ],
        items: [
            { TR: "Yorumlar saygılı olmalıdır; hakaret, nefret söylemi, taciz, spam ve kişisel veri paylaşımı yasaktır ve otomatik olarak engellenebilir.", EN: "Comments must be respectful; insults, hate speech, harassment, spam and sharing personal data are prohibited and may be blocked automatically." },
            { TR: "Birden fazla hesap, bot veya koordineli davranışla oy manipülasyonu yapılamaz; bu tür oylar geçersiz sayılabilir.", EN: "You may not manipulate votes with multiple accounts, bots or coordinated behaviour; such votes may be discarded." },
            { TR: "Yorumlarınızdan siz sorumlusunuz; yorumlar herkese açıktır ve siz silene kadar yayında kalır.", EN: "You are responsible for your comments; they are public and stay up until you delete them." },
        ],
    },
    {
        id: "groups",
        title: { TR: "Hanogt Social: gruplar, sohbetler ve aramalar", EN: "Hanogt Social: groups, chats and calls" },
        items: [
            { TR: "Hanogt Social'daki adınızı, durumunuzu ve özel durum metninizi başkalarını taklit etmek, yanıltmak veya taciz etmek için kullanamazsınız.", EN: "You may not use your name, status or custom status text in Hanogt Social to impersonate, mislead or harass others." },
            { TR: "Grup üyeleri, grupta gördükleri profil, kod, mesaj ve sesli mesajları grup amacı dışında kullanamaz veya izinsiz yayımlayamaz.", EN: "Group members may not use profiles, code, messages or voice messages they see in a group outside the group's purpose, or publish them without permission." },
            { TR: "Grup sahipleri ve yöneticileri grubun kurallarını belirleyebilir, üyeleri çıkarabilir veya engelleyebilir; bu yetkileri bu Şartlara uygun kullanmalıdırlar.", EN: "Group owners and admins may set group rules and remove or ban members; they must use these powers in line with these Terms." },
            { TR: "Ortak editör gerçek zamanlı eşitleme sunar, ancak tam bir sürüm kontrol sistemi değildir; aynı anda yapılan düzenlemelerde son kayıt geçerli olabilir. Önemli projeler için sürüm kontrolü ve yedek kullanın.", EN: "The shared editor syncs in real time but is not a full version control system; when people edit at the same time, the last save may win. Use version control and backups for important projects." },
            { TR: "“Ekiple düzenle” oturumunda paylaştığınız dosyaları oturumdaki herkes düzenleyebilir. Yalnızca paylaşmaya hakkınız olan kodu paylaşın; başkalarının oturumda gördüğü kodu, sohbeti ve sesi izinsiz kaydedemez veya yayımlayamazsınız. Oturum sahibi oturumu salt okunur yapabilir, katılımcı çıkarabilir veya oturumu sonlandırabilir.", EN: "In an “Edit as a team” session, everyone in the session can edit the files you share. Share only code you have the right to share; you may not record or publish the code, chat or voice you see in someone else's session without permission. The session owner can make the session read-only, remove participants or end the session." },
            { TR: "Sesli aramaları karşı tarafın bilgisi ve rızası olmadan kaydedemezsiniz; Hanogt aramaları kaydetmez. Sizi rahatsız eden kullanıcıları engelleyebilir ve bize bildirebilirsiniz.", EN: "You may not record voice calls without the other person's knowledge and consent; Hanogt does not record calls. You can block and report users who bother you." },
        ],
    },
    {
        id: "hanogt-ai",
        title: { TR: "Hanogt AI ve yapay zekâ çıktıları", EN: "Hanogt AI and AI output" },
        items: [
            { TR: "Hanogt AI'ın yanıtları Hanogt AI Çekirdeği veya üçüncü taraf bir dil modeli tarafından otomatik olarak üretilir; hatalı, eksik, güncel olmayan veya güvensiz olabilir ve hukuki, tıbbi, mali ya da güvenlik konularında profesyonel danışmanlığın yerini tutmaz.", EN: "Hanogt AI's replies are generated automatically by the Hanogt AI Core or a third-party language model; they may be wrong, incomplete, out of date or unsafe, and they don't replace professional legal, medical, financial or security advice." },
            { TR: "Yanıtları ve üretilen kodu kullanmadan, çalıştırmadan veya yayımlamadan önce kontrol etmek ve üçüncü kişilerin haklarını ihlal etmediğinden emin olmak sizin sorumluluğunuzdadır.", EN: "It is your responsibility to check replies and generated code before you use, run or publish them, and to make sure they don't infringe anyone's rights." },
            { TR: "Ajan modunda Hanogt AI yalnızca sizin izin verdiğiniz işlemleri (profil özetinizi okuma, grup oluşturma, editörü kodla açma, oyun projesi oluşturma, bir sayfaya gitme) sizin hesabınızla yapar; herkese açık bilgilerle sınırlı site içi arama onay istemez. Onay kartını kabul etmeden önce ne yapılacağını okuyun; bir izni oturumun geri kalanı için verirseniz o oturumda yeniden sorulmaz. Onayladığınız işlemlerin sonuçlarından, Hanogt'un kusurundan kaynaklananlar dışında siz sorumlusunuz; beklemediğiniz bir sonucu geri alabilir (ör. oluşturulan grubu silebilir) ve bize bildirebilirsiniz. Ajan; silme, parola, iki adımlı doğrulama, yönetim ve başkalarına mesaj gönderme işlemlerini yapmaz.", EN: "In agent mode, Hanogt AI only takes the actions you allow (reading your profile summary, creating a group, opening the editor with code, creating a game project, going to a page) using your account; searching the site, which only uses public information, doesn't ask for approval. Read what will be done before you accept a confirmation card; if you allow an action for the rest of the session, you won't be asked again in that session. You are responsible for the results of actions you approve, except those caused by Hanogt's fault; you can undo an unexpected result (for example by deleting a group that was created) and report it to us. The agent does not delete anything, handle passwords or two-step verification, do administrative work or message other people." },
            { TR: "Hanogt AI'ı zararlı yazılım, oltalama, başkalarının sistemlerine yetkisiz erişim, taciz veya hukuka aykırı içerik üretmek için kullanamaz, güvenlik önlemlerini aşmaya (ör. jailbreak veya istem enjeksiyonu yoluyla) çalışamazsınız.", EN: "You may not use Hanogt AI to produce malware, phishing, unauthorised access to others' systems, harassment or illegal content, or try to get around its safeguards (for example through jailbreaks or prompt injection)." },
            { TR: "Kullanım sınırları uygulanır (şu anda dakikada 12 ve günde 250 istek); sınıra ulaştığınızda yanıtları Çekirdek verir.", EN: "Usage limits apply (currently 12 requests per minute and 250 per day); when you reach them, the Core answers instead." },
            { TR: "Hanogt, Hanogt AI'ın size verdiği yanıtlar üzerinde sizinle çelişen bir hak iddia etmez. Ancak benzer yanıtlar başkalarına da üretilebilir ve yapay zekâ çıktılarının fikrî mülkiyet korumasından yararlanıp yararlanmadığı uygulanacak hukuka göre belirsiz olabilir.", EN: "Hanogt claims no rights in the replies Hanogt AI gives you that conflict with yours. However, similar replies may be generated for others, and whether AI output is protected by intellectual property law may be uncertain under the applicable law." },
        ],
    },
    {
        id: "support",
        title: { TR: "Destek talepleri ve geri bildirim", EN: "Support tickets and feedback" },
        items: [
            { TR: "Destek taleplerini şikayetler, istekler ve KVKK başvuruları, güvenlik açıkları, ban kaldırma istekleri ve itirazlar, sorular ve geri bildirimler için kullanabilirsiniz. Talepleri spam, taciz veya ekibi yanıltmak için kullanamazsınız; kötüye kullanılan talepler kapatılabilir.", EN: "You can use support tickets for complaints, requests and KVKK requests, vulnerabilities, unban requests and appeals, questions and feedback. You may not use tickets for spam, harassment or to mislead staff; abusive tickets may be closed." },
            { TR: "Ekip, talebi değerlendirmek ve kötüye kullanımı ayırt etmek için hesap kaydınızı ve moderasyon geçmişinizi görebilir.", EN: "Staff can see your account record and moderation history to assess a ticket and tell genuine requests from abuse." },
            { TR: "KVKK başvuruları kanuni süre içinde, en geç 30 gün içinde yanıtlanır. Diğer talepler için belirli bir yanıt süresi taahhüt etmeyiz, ancak makul sürede yanıtlamaya çalışırız.", EN: "KVKK requests are answered within the legal time limit of 30 days at the latest. For other tickets we don't promise a specific response time, but we try to reply within a reasonable time." },
            { TR: "Geri bildirim panosundaki gönderiler giriş yapmış tüm kullanıcılara açıktır. Önerilerinizi, size karşı bir yükümlülük doğmaksızın ve ücret ödenmeksizin Hizmeti geliştirmek için kullanabiliriz.", EN: "Posts on the feedback board are visible to all signed-in users. We may use your suggestions to improve the Service without any obligation or payment to you." },
        ],
    },
    {
        id: "third-parties",
        title: { TR: "Üçüncü taraf hizmetleri", EN: "Third-party services" },
        paragraphs: [
            { TR: "Hizmet; Google (Firebase ve Google ile giriş), Vercel, dil modeli sağlayıcısı, Wandbox ve JetBrains Kotlin Playground derleyicileri, STUN/TURN sunucuları, haber yayıncıları, OpenRouter gibi veri kaynakları ve Have I Been Pwned gibi üçüncü taraf hizmetlerden yararlanır. Bu hizmetler kendi koşullarına ve kullanılabilirliklerine tabidir; Hanogt onları kendisine aitmiş gibi sunmaz.", EN: "The Service relies on third-party services such as Google (Firebase and Sign in with Google), Vercel, the language model provider, the Wandbox and JetBrains Kotlin Playground compilers, STUN/TURN servers, news publishers, data sources such as OpenRouter, and Have I Been Pwned. These services are subject to their own terms and availability, and Hanogt doesn't present them as its own." },
            { TR: "Kanunun izin verdiği ölçüde, üçüncü taraf hizmetlerin kesintilerinden kaynaklanan sorunlardan sorumlu değiliz; ancak etkilerini azaltmak için makul çabayı gösteririz.", EN: "To the extent permitted by law, we are not liable for problems caused by outages of third-party services, but we make reasonable efforts to limit their impact." },
        ],
    },
    {
        id: "moderation",
        title: { TR: "Moderasyon, yaptırımlar ve itiraz", EN: "Moderation, enforcement and appeals" },
        paragraphs: [
            { TR: "Şartlara aykırı davranışları ve içerikleri; kullanıcı bildirimleri, otomatik filtreler ve ekip incelemesiyle tespit ederiz. Yaptırımlar; ihlalin ağırlığı, tekrarı, verdiği zarar ve açıklamanız dikkate alınarak orantılı uygulanır:", EN: "We detect conduct and content that breaks the Terms through user reports, automated filters and staff review. Measures are applied proportionately, taking into account how serious the breach is, whether it was repeated, the harm caused and your explanation:" },
        ],
        items: [
            { TR: "Uyarı: ihlali bildiren ve düzeltmenizi isteyen bir bildirim.", EN: "Warning: a notice that tells you about the breach and asks you to fix it." },
            { TR: "İçeriğin kaldırılması: kurallara aykırı bir yorumun, Media yayınının, Arcade oyununun veya geri bildirim gönderisinin kaldırılması ya da yayından çekilmesi.", EN: "Content removal: removing or unpublishing a comment, Media post, Arcade game or feedback post that breaks the rules." },
            { TR: "Askıya alma: hesabın geçici veya süresiz olarak askıya alınması; askı süresince giriş yapılamaz ve açık oturumlar geçersiz olur.", EN: "Suspension: suspending the account temporarily or indefinitely; while suspended, you can't sign in and open sessions stop working." },
            { TR: "Hesabın ve verilerin silinmesi: ağır veya tekrarlanan ihlallerde hesap ve ilişkili veriler yetkili bir yönetici tarafından kalıcı olarak silinebilir.", EN: "Account and data deletion: for serious or repeated breaches, an authorised administrator may permanently delete the account and its related data." },
        ],
        after: [
            { TR: "Acil bir risk (ör. zararlı yazılımın yayılması, çocuk istismarı, ciddi bir tehdit veya ele geçirilmiş bir hesap) bulunmadıkça, mümkün olduğunda yaptırımdan önce veya yaptırımla birlikte gerekçesini ve itiraz yolunu size bildiririz. Ekip işlemleri ve gerekçeleri denetim kaydına yazılır. Otomatik engellemeler (Security Bot, yorum filtresi, hız sınırları) yaptırım değildir ve yalnızca ilgili isteği etkiler.", EN: "Unless there is an urgent risk (for example malware spreading, child abuse, a serious threat or a compromised account), where possible we tell you the reason and how to appeal before or together with the measure. Staff actions and their reasons are written to the audit log. Automated blocks (Security Bot, the comment filter and rate limits) are not sanctions and only affect the request in question." },
            { TR: "Bir karara “Ban Kaldırma İsteği” kategorisinde destek talebiyle itiraz edebilirsiniz. İtiraz bir insan tarafından incelenir; açık bir hata varsa karar geri alınır, kaldırılan içerik teknik olarak mümkünse geri yüklenir ve kayıt düzeltilir. Hesabınız askıya alındığı için giriş yapamıyorsanız, giriş sayfasında hesabınızla giriş yapmayı denediğinizde açılan itiraz formunu kullanabilirsiniz.", EN: "You can appeal a decision with a support ticket in the “Unban request” category. A person reviews the appeal; if there was a clear mistake, the decision is reversed, removed content is restored where technically possible and the record is corrected. If you can't sign in because your account is suspended, you can use the appeal form that opens on the sign-in page when you try to sign in with your account." },
        ],
    },
    {
        id: "intellectual-property",
        title: { TR: "Fikrî mülkiyet ve hak ihlali bildirimleri", EN: "Intellectual property and infringement notices" },
        paragraphs: [
            { TR: "Hanogt Codev adı ve logosu Hanogt'a aittir. Hizmetin kaynak kodu, depoda belirtilen açık kaynak lisansına (MIT) tabidir; bu lisans size Hanogt adını ve logosunu, Hizmetle bağlantılı olduğunuz izlenimini verecek şekilde kullanma hakkı vermez. Şablonlardan oluşturduğunuz oyunlar ve yazdığınız kodlar sizindir.", EN: "The Hanogt Codev name and logo belong to Hanogt. The Service's source code is subject to the open-source licence stated in its repository (MIT); that licence does not give you the right to use the Hanogt name or logo in a way that suggests you are connected with the Service. Games you build from templates and code you write are yours." },
            { TR: "Telif hakkınızın veya kişilik haklarınızın ihlal edildiğini düşünüyorsanız; içeriğin bağlantısını, hak sahipliğinizin dayanağını, iletişim bilgilerinizi ve gerekçenizi içeren bir bildirimi destek talebiyle iletin. Usulüne uygun bildirimler incelenir; gerektiğinde içeriğe erişim kısıtlanır ve içerik sahibine bilgi verilerek açıklama yapma imkânı tanınır. Kötüye kullanılan veya asılsız bildirimler kabul edilmez.", EN: "If you believe your copyright or personality rights are being infringed, send a notice with a support ticket that includes a link to the content, the basis of your rights, your contact details and your reasons. Proper notices are reviewed; where necessary, access to the content is restricted and its owner is informed and given the chance to respond. Abusive or unfounded notices are not accepted." },
            { TR: "Hanogt'un 5651 sayılı Kanun bakımından hangi hizmet sağlayıcı sıfatını taşıdığı, faaliyet modeli kesinleştiğinde ayrıca değerlendirilecektir. Uygulanabildiği ölçüde yetkili makam kararları ve hukuka uygun içerik çıkarma bildirimleri kayıt altına alınır, kapsamıyla sınırlı olarak uygulanır ve kanunen yasak değilse içerik sahibine bilgi verilir.", EN: "Which type of provider Hanogt is under Law No. 5651 will be assessed separately once its business model is finalised. As far as applicable, decisions of competent authorities and lawful takedown notices are recorded, applied only within their scope, and the content owner is informed unless the law forbids it." },
        ],
    },
    {
        id: "termination",
        title: { TR: "Fesih ve hesap silme", EN: "Termination and account deletion" },
        paragraphs: [
            { TR: "Hesabınızı dilediğiniz zaman [Hesap Ayarları](/account-settings)'ndan silebilirsiniz; silmeden önce “Verilerimi İndir” ile bir kopya almanızı öneririz. Silme geri alınamaz; hesabınız ve ilişkili verileriniz [Gizlilik Politikası](/privacy-policy#retention)'nda açıklandığı şekilde silinir veya anonimleştirilir.", EN: "You can delete your account at any time in [Account Settings](/account-settings); we recommend downloading a copy with “Download My Data” first. Deletion can't be undone; your account and related data are deleted or anonymised as described in the [Privacy Policy](/privacy-policy#retention)." },
            { TR: "Şartların ağır veya tekrarlanan ihlali, hukuki zorunluluk ya da Hizmetin veya diğer kullanıcıların güvenliğinin korunması gibi haklı sebeplerle hesabınızı askıya alabilir veya kapatabiliriz. Hizmeti tamamen sona erdirmemiz hâlinde bunu makul bir süre önce duyurur ve verilerinizi dışa aktarma imkânı sunarız.", EN: "We may suspend or close your account for good reason, such as a serious or repeated breach of the Terms, a legal requirement, or protecting the security of the Service or other users. If we shut the Service down entirely, we will announce it a reasonable time in advance and let you export your data." },
            { TR: "Niteliği gereği sona ermeden sonra da devam etmesi gereken hükümler (ör. verdiğiniz açık kaynak lisansları, fikrî mülkiyet, sorumluluk ve uyuşmazlık hükümleri) yürürlükte kalır.", EN: "Provisions that by their nature should survive termination (for example the open-source licences you granted, intellectual property, liability and dispute provisions) remain in force." },
        ],
    },
    {
        id: "liability",
        title: { TR: "Garanti reddi ve sorumluluğun sınırları", EN: "Disclaimers and limitation of liability" },
        paragraphs: [
            { TR: "Hizmet ücretsiz olarak, “olduğu gibi” ve “mevcut olduğu şekilde” sunulmaktadır. Hizmetin kesintisiz, hatasız veya belirli bir amaca uygun olacağını; Security Bot, Güvenlik Merkezi araçları ve Hanogt AI'ın her tehdidi veya hatayı tespit edeceğini garanti etmeyiz.", EN: "The Service is provided free of charge, “as is” and “as available”. We don't guarantee that the Service will be uninterrupted, error-free or fit for a particular purpose, or that Security Bot, the Security Center tools and Hanogt AI will detect every threat or error." },
            { TR: "Kanunun izin verdiği ölçüde Hanogt; üçüncü taraf hizmetlerin kesintilerinden, sizin talimatınızla çalıştırılan veya yayımlanan kodun ya da Hanogt AI ajanına yaptırdığınız işlemlerin sonuçlarından, tarayıcı verilerinin silinmesi gibi sizin kontrolünüzdeki nedenlerle kaybolan verilerden ve kâr kaybı gibi dolaylı zararlardan sorumlu değildir.", EN: "To the extent permitted by law, Hanogt is not liable for outages of third-party services, the results of code you run or publish or of actions you have Hanogt AI's agent carry out on your instructions, data lost for reasons within your control such as clearing browser data, or indirect losses such as lost profits." },
            { TR: "Bu sınırlamalar; Hanogt'un kastından veya ağır ihmalinden doğan sorumluluğunu (6098 sayılı Türk Borçlar Kanunu m.115), hayata ve vücut bütünlüğüne verilen zararları, kişisel verilerin kanuna aykırı işlenmesinden doğan sorumluluğu ve 6502 sayılı Tüketicinin Korunması Hakkında Kanun başta olmak üzere emredici hükümlerden doğan haklarınızı kaldırmaz veya sınırlamaz.", EN: "These limitations do not exclude or limit Hanogt's liability for intent or gross negligence (Article 115 of the Turkish Code of Obligations No. 6098), for harm to life or physical integrity, or for unlawful processing of personal data, nor your rights under mandatory rules, in particular Consumer Protection Law No. 6502." },
            { TR: "Bu Şartları ihlal etmeniz nedeniyle üçüncü kişilerin Hanogt'a yönelttiği taleplerden, kanuna göre ve kusurunuz ölçüsünde sorumlu olursunuz. Önemli projelerinizi düzenli olarak dışa aktarmanızı ve yedeklemenizi öneririz.", EN: "You are liable, under the law and to the extent of your fault, for claims third parties bring against Hanogt because you broke these Terms. We recommend exporting and backing up important projects regularly." },
        ],
    },
    {
        id: "paid-services",
        title: { TR: "Ücretli hizmetler ve ticari iletiler", EN: "Paid services and commercial messages" },
        paragraphs: [
            { TR: "Hizmet şu anda ücretsizdir. İleride ücretli bir özellik sunulursa fiyat, cayma hakkı, dijital içeriğe ilişkin istisnalar ve mesafeli sözleşme ön bilgilendirmesi, 6502 sayılı Kanun ve Mesafeli Sözleşmeler Yönetmeliği uyarınca satın almadan önce ayrıca sunulur; ücretli özellikler bakımından o belgeler öncelikli olarak uygulanır.", EN: "The Service is currently free. If a paid feature is offered in the future, the price, the right of withdrawal, the exceptions for digital content and the pre-contractual information for distance contracts will be provided separately before purchase under Law No. 6502 and the Distance Contracts Regulation, and those documents will take precedence for paid features." },
            { TR: "Size ticari elektronik ileti (ör. kampanya veya reklam) göndermek istersek 6563 sayılı Kanun uyarınca önceden ayrı onayınızı alırız ve onayınızı her zaman geri alabilirsiniz. Hizmetle ilgili zorunlu bilgilendirmeler bu kapsamda değildir.", EN: "If we want to send you commercial electronic messages (for example promotions or advertising), we will ask for your separate prior consent under Law No. 6563, and you can withdraw it at any time. Essential service messages are not covered by this." },
        ],
    },
    {
        id: "law",
        title: { TR: "Uygulanacak hukuk ve uyuşmazlıklar", EN: "Governing law and disputes" },
        paragraphs: [
            { TR: "Bu Şartlara Türkiye Cumhuriyeti hukuku uygulanır. Bir sorun yaşarsanız önce destek talebiyle bize ulaşmanızı rica ederiz; bu, kanuni başvuru haklarınızı kullanmanızı engellemez.", EN: "These Terms are governed by the laws of the Republic of Türkiye. If you have a problem, please contact us first with a support ticket; this does not stop you from using your legal remedies." },
            { TR: "Tüketici sıfatına sahipseniz; uyuşmazlığın değeri Ticaret Bakanlığı'nca her yıl belirlenen parasal sınırın altındaysa yerleşim yerinizdeki veya tüketici işlemini yaptığınız yerdeki tüketici hakem heyetine, bu sınırın üzerindeyse tüketici mahkemesine başvurabilirsiniz. Tüketici mahkemesinde dava açmadan önce, kanunda öngörülen hâllerde arabulucuya başvurmak zorunludur.", EN: "If you are a consumer, you can apply to the consumer arbitration committee where you live or where the consumer transaction took place if the value of the dispute is below the monetary limit set each year by the Ministry of Trade, or to the consumer court if it is above that limit. Before filing a case with a consumer court, mediation is mandatory in the cases provided by law." },
            { TR: "Diğer uyuşmazlıklarda, emredici yetki kuralları saklı kalmak kaydıyla, işletmecinin yerleşim yeri mahkemeleri ve icra daireleri yetkilidir.", EN: "For other disputes, the courts and enforcement offices of the operator's place of business have jurisdiction, subject to mandatory jurisdiction rules." },
        ],
    },
    {
        id: "changes",
        title: { TR: "Şartlardaki değişiklikler", EN: "Changes to these Terms" },
        paragraphs: [
            { TR: "Şartları güncelleyebiliriz. Aleyhinize esaslı bir değişiklik, yürürlüğe girmeden makul bir süre önce uygulama içinde duyurulur; gerekiyorsa onayınız ayrıca istenir. Değişikliği kabul etmiyorsanız, yürürlük tarihinden önce verilerinizi indirip hesabınızı silebilirsiniz.", EN: "We may update the Terms. A material change to your disadvantage will be announced in the app a reasonable time before it takes effect, and your approval will be asked for separately where required. If you don't accept a change, you can download your data and delete your account before it takes effect." },
            { TR: "Her sürüm, yürürlük tarihi ve değişiklik özetiyle sayfanın sonundaki sürüm geçmişinde yer alır.", EN: "Each version, with its effective date and a summary of changes, is listed in the version history at the end of the page." },
        ],
    },
    {
        id: "general",
        title: { TR: "Diğer hükümler", EN: "Other provisions" },
        items: [
            { TR: "Bölünebilirlik: Bir hükmün geçersiz sayılması diğer hükümlerin geçerliliğini etkilemez.", EN: "Severability: if a provision is held invalid, the other provisions remain valid." },
            { TR: "Feragat yok: Bir hakkımızı kullanmamamız, o haktan vazgeçtiğimiz anlamına gelmez.", EN: "No waiver: not exercising a right doesn't mean we have given it up." },
            { TR: "Devir: Hizmetin devri hâlinde Hanogt bu Şartlardan doğan hak ve yükümlülüklerini, size bildirmek ve kanuni haklarınızı kısıtlamamak kaydıyla devredebilir. Siz bu Şartlardan doğan haklarınızı iznimiz olmadan devredemezsiniz.", EN: "Assignment: if the Service is transferred, Hanogt may transfer its rights and obligations under these Terms, provided it tells you and your legal rights are not restricted. You may not transfer your rights under these Terms without our permission." },
            { TR: "Dil ve yorum: Bu Şartların Türkçe sürümü esas alınır; diğer dillerdeki sürümler bilgilendirme amaçlı çevirilerdir. Açık ve anlaşılır olmayan hükümler tüketici lehine yorumlanır.", EN: "Language and interpretation: the Turkish version of these Terms prevails; versions in other languages are translations provided for information. Provisions that are not clear and understandable are interpreted in the consumer's favour." },
            { TR: "İletişim: Bildirimlerimizi uygulama içinden yaparız. Bize destek talebiyle veya, yayımlandığında, veri sorumlusunun iletişim kanallarından ulaşabilirsiniz.", EN: "Contact: we send notices through the app. You can reach us with a support ticket or, once published, through the data controller's contact channels." },
        ],
    },
];

export default function TermsOfUsePage() {
    return (
        <LegalPage
            current="/terms-of-use"
            eyebrow={{ TR: "Hizmet koşulları", EN: "Terms of service" }}
            title={{ TR: "Kullanım Şartları", EN: "Terms of Use" }}
            summary={{ TR: "Hanogt Codev'i kullanırken sizin ve bizim hak ve yükümlülüklerimizi; hesap güvenliğini, kabul edilebilir kullanımı, içerik ve lisansları, yapay zekâ çıktılarını, yaptırımları ve uyuşmazlıkların çözümünü açık ve dengeli biçimde düzenler.", EN: "Sets out, clearly and fairly, your rights and obligations and ours when you use Hanogt Codev: account security, acceptable use, content and licences, AI output, enforcement and how disputes are resolved." }}
            sections={sections}
            highlights={highlights}
            notice={{ TR: "Bu şartlar, tüketici olarak sahip olduğunuz ve kanundan doğan emredici hakları kısıtlamaz. İşletmecinin kimlik ve iletişim bilgileri yayımlandığında şartlara eklenecektir.", EN: "These terms do not restrict the mandatory rights you have by law, including as a consumer. The operator's identity and contact details will be added to the terms when they are published." }}
        />
    );
}
