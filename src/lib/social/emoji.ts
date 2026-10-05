/**
 * The emoji picker's data: common emoji in eight groups with English and
 * Turkish search words (the first English word is the :shortcode:), and the
 * search the picker and ":smi…" suggestions use. Framework-free.
 */
import type { Copy } from "@/lib/i18n";
import { foldForMatch } from "./composer";

export type EmojiEntry = { char: string; name: string; words: string[] };

export type EmojiCategoryId = "smileys" | "people" | "nature" | "food" | "activity" | "travel" | "objects" | "symbols";

/* One emoji per line: "<emoji> <english words>|<turkish words>". */
const DATA: Record<EmojiCategoryId, string> = {
    smileys: `
😀 grinning smile happy|sırıtma gülümseme mutlu
😃 smiley happy joy|mutlu neşe
😄 smile laugh happy|gülme mutlu
😁 grin teeth|sırıtma diş
😆 laughing satisfied|kahkaha gülme
😅 sweat_smile relief|terleme rahatlama
🤣 rofl rolling laugh|yerlere yatma kahkaha
😂 joy tears laugh|gözyaşı gülme kahkaha
🙂 slight_smile|hafif gülümseme
🙃 upside_down silly|ters yüz
😉 wink|göz kırpma
😊 blush happy|kızarma mutlu
😇 innocent angel halo|melek masum
🥰 smiling_hearts love|aşk kalpli yüz
😍 heart_eyes love|kalp göz aşık
🤩 star_struck wow|yıldız gözler hayran
😘 kissing_heart kiss|öpücük
😋 yum delicious|lezzetli nefis
😛 tongue|dil çıkarma
😜 winking_tongue crazy|çılgın dil
🤪 zany crazy|deli çılgın
🤑 money_mouth rich|para zengin
🤗 hugging hug|sarılma kucaklama
🤭 hand_over_mouth oops|ağzını kapatma
🤫 shushing quiet|sus sessiz
🤔 thinking hmm|düşünme hmm
🤐 zipper_mouth secret|fermuar sır
🤨 raised_eyebrow suspicious|şüpheli kaş
😐 neutral|nötr ifadesiz
😑 expressionless|ifadesiz
😶 no_mouth silent|ağızsız sessiz
😏 smirk|sırıtma
😒 unamused|sıkılmış
🙄 eye_roll|göz devirme
😬 grimacing awkward|gergin
😌 relieved|rahatlamış
😔 pensive sad|dalgın üzgün
😪 sleepy|uykulu
🤤 drooling|salya
😴 sleeping zzz|uyuyan
😷 mask sick|maske hasta
🤒 thermometer ill|ateş hasta
🤢 nauseated|mide bulantısı
🤮 vomiting|kusma
🥵 hot|sıcak
🥶 cold freezing|soğuk donma
🥴 woozy dizzy|sersem
😵 dizzy_face|baş dönmesi
🤯 exploding_head mind_blown|kafa patlaması şok
🤠 cowboy|kovboy
🥳 partying celebrate|parti kutlama
😎 sunglasses cool|güneş gözlüğü havalı
🤓 nerd geek|inek gözlüklü
🧐 monocle|monokl
😕 confused|şaşkın
😟 worried|endişeli
🙁 frowning|asık surat
😮 open_mouth wow|şaşırma
😯 hushed|susmuş
😲 astonished|hayret
😳 flushed|utanma kızarma
🥺 pleading puppy|yalvarma
😦 frowning_open|kaygılı
😨 fearful|korkmuş
😰 anxious_sweat|kaygı ter
😥 sad_relieved|üzgün
😢 cry tear|ağlama gözyaşı
😭 sob crying|hüngür ağlama
😱 scream|çığlık korku
😖 confounded|perişan
😣 persevere|sabır
😞 disappointed|hayal kırıklığı
😓 downcast_sweat|terli
😩 weary|bitkin
😫 tired|yorgun
🥱 yawning|esneme
😤 triumph huff|burun hırlama
😡 rage angry|öfke kızgın
😠 angry mad|kızgın
🤬 cursing|küfür
😈 smiling_imp devil|şeytan
💀 skull dead|kafatası ölü
💩 poop|kaka
🤡 clown|palyaço
👻 ghost|hayalet
👽 alien|uzaylı
🤖 robot bot|robot bot
😺 smiley_cat|gülen kedi
😹 joy_cat|gülen kedi
😻 heart_eyes_cat|aşık kedi
`,
    people: `
👋 wave hello bye|el sallama merhaba
🤚 raised_back_of_hand|el
✋ raised_hand stop|el dur
🖐️ hand_splayed five|beş parmak
👌 ok_hand perfect|tamam mükemmel
🤌 pinched_fingers|italyan parmak
✌️ victory peace|zafer barış
🤞 crossed_fingers luck|şans parmak çapraz
🤟 love_you|seni seviyorum
🤘 metal rock|metal rock
🤙 call_me|ara beni
👈 point_left|sol
👉 point_right|sağ
👆 point_up|yukarı
👇 point_down|aşağı
☝️ index_up|işaret parmağı
👍 thumbsup like yes|beğen evet onay
👎 thumbsdown dislike no|beğenme hayır
✊ fist|yumruk
👊 punch fist_bump|yumruk
🤛 left_fist|yumruk
🤜 right_fist|yumruk
👏 clap applause|alkış
🙌 raised_hands hooray|yaşasın eller
👐 open_hands|açık eller
🤲 palms_up|avuç
🤝 handshake deal|tokalaşma anlaşma
🙏 pray thanks please|dua teşekkür lütfen
✍️ writing|yazma
💅 nail_polish|oje
💪 muscle strong|kas güçlü
🧠 brain smart|beyin akıllı
👀 eyes look|gözler bakış
👁️ eye|göz
👄 lips|dudak
👶 baby|bebek
🧒 child|çocuk
🧑 person|kişi
👨 man|adam
👩 woman|kadın
🧓 older_person|yaşlı
🧑‍💻 technologist coder developer|yazılımcı geliştirici
🧑‍🎓 student|öğrenci
🧑‍🏫 teacher|öğretmen
🧑‍🚀 astronaut|astronot
🦸 superhero|süper kahraman
🧙 mage wizard|büyücü
🤷 shrug|omuz silkme
🤦 facepalm|kafaya vurma
🙋 raising_hand|el kaldırma
🙅 no_gesture|hayır
🙆 ok_gesture|tamam
💁 info_desk|bilgi
🙇 bow|eğilme selam
🏃 running|koşma
💃 dancer dance|dans
🕺 man_dancing|dans
👯 dancers party|parti
🧘 yoga|yoga meditasyon
`,
    nature: `
🐶 dog puppy|köpek
🐱 cat kitty|kedi
🐭 mouse|fare
🐹 hamster|hamster
🐰 rabbit bunny|tavşan
🦊 fox|tilki
🐻 bear|ayı
🐼 panda|panda
🐨 koala|koala
🐯 tiger|kaplan
🦁 lion|aslan
🐮 cow|inek
🐷 pig|domuz
🐸 frog|kurbağa
🐵 monkey|maymun
🙈 see_no_evil|görmedim maymun
🙉 hear_no_evil|duymadım
🙊 speak_no_evil|konuşmadım
🐔 chicken|tavuk
🐧 penguin|penguen
🐦 bird|kuş
🦅 eagle|kartal
🦉 owl|baykuş
🦄 unicorn|tek boynuzlu at
🐝 bee|arı
🦋 butterfly|kelebek
🐞 ladybug|uğur böceği
🐢 turtle|kaplumbağa
🐍 snake python|yılan
🐙 octopus|ahtapot
🐬 dolphin|yunus
🐳 whale|balina
🦈 shark|köpek balığı
🐉 dragon|ejderha
🌵 cactus|kaktüs
🌲 tree|ağaç
🌴 palm|palmiye
🌱 seedling|fide filiz
🍀 clover luck|yonca şans
🍁 maple leaf|akçaağaç yaprak
🌸 cherry_blossom flower|kiraz çiçeği
🌹 rose|gül
🌻 sunflower|ayçiçeği
🌷 tulip|lale
🌞 sun|güneş
🌙 moon|ay
⭐ star|yıldız
🌟 glowing_star|parlayan yıldız
✨ sparkles|parıltı
⚡ zap lightning|şimşek
🔥 fire lit hot|ateş yangın
🌈 rainbow|gökkuşağı
☁️ cloud|bulut
🌧️ rain|yağmur
⛄ snowman|kardan adam
❄️ snowflake|kar tanesi
🌊 wave ocean|dalga deniz
🌍 earth world|dünya
`,
    food: `
🍏 green_apple|yeşil elma
🍎 apple|elma
🍐 pear|armut
🍊 orange|portakal
🍋 lemon|limon
🍌 banana|muz
🍉 watermelon|karpuz
🍇 grapes|üzüm
🍓 strawberry|çilek
🍒 cherries|kiraz
🍑 peach|şeftali
🥭 mango|mango
🍍 pineapple|ananas
🥥 coconut|hindistan cevizi
🥝 kiwi|kivi
🍅 tomato|domates
🥑 avocado|avokado
🌶️ hot_pepper|acı biber
🌽 corn|mısır
🥕 carrot|havuç
🥐 croissant|kruvasan
🍞 bread|ekmek
🧀 cheese|peynir
🥚 egg|yumurta
🍳 cooking|yemek pişirme
🥞 pancakes|pankek
🍗 chicken_leg|tavuk but
🍖 meat|et
🌭 hotdog|sosisli
🍔 burger hamburger|hamburger
🍟 fries|patates kızartması
🍕 pizza|pizza
🥙 doner kebab|döner dürüm
🌮 taco|tako
🍝 spaghetti|makarna
🍜 ramen noodles|erişte ramen
🍣 sushi|suşi
🍦 ice_cream|dondurma
🍩 doughnut|donut
🍪 cookie|kurabiye
🎂 birthday cake|doğum günü pasta
🍰 cake|pasta
🍫 chocolate|çikolata
🍬 candy|şeker
🍭 lollipop|lolipop
🍯 honey|bal
☕ coffee|kahve
🍵 tea|çay
🥤 soda drink|içecek
🧃 juice|meyve suyu
🧋 bubble_tea|boba
`,
    activity: `
⚽ soccer football|futbol
🏀 basketball|basketbol
🏈 football|amerikan futbolu
⚾ baseball|beyzbol
🎾 tennis|tenis
🏐 volleyball|voleybol
🏓 ping_pong|masa tenisi
🏸 badminton|badminton
🥅 goal|kale gol
⛳ golf|golf
🏹 archery|okçuluk
🎣 fishing|balık tutma
🥊 boxing|boks
🥋 martial_arts|dövüş sanatları
🛹 skateboard|kaykay
⛸️ ice_skate|paten
🎿 ski|kayak
🏆 trophy win|kupa zafer
🥇 gold medal first|altın madalya birinci
🥈 silver second|gümüş ikinci
🥉 bronze third|bronz üçüncü
🏅 medal|madalya
🎮 video_game gamepad|oyun konsolu
🕹️ joystick|oyun kolu
🎲 dice game|zar
♟️ chess|satranç
🧩 puzzle|yapboz
🎯 target bullseye|hedef
🎳 bowling|bovling
🎨 art palette|sanat resim
🎬 movie clapper|film
🎤 microphone sing|mikrofon şarkı
🎧 headphones music|kulaklık müzik
🎸 guitar|gitar
🎹 piano|piyano
🥁 drum|davul
🎉 tada party|kutlama parti
🎊 confetti|konfeti
🎁 gift present|hediye
🎈 balloon|balon
`,
    travel: `
🚗 car|araba
🚕 taxi|taksi
🚌 bus|otobüs
🏎️ race_car|yarış arabası
🚓 police_car|polis arabası
🚑 ambulance|ambulans
🚒 fire_engine|itfaiye
🚲 bike|bisiklet
🛵 scooter|motor
🚂 train|tren
🚇 metro|metro
✈️ airplane|uçak
🚀 rocket launch|roket fırlatma
🛸 ufo|ufo
🚁 helicopter|helikopter
⛵ sailboat|yelkenli
🚢 ship|gemi
⚓ anchor|çapa
🗺️ map|harita
🧭 compass|pusula
🏔️ mountain|dağ
🏕️ camping|kamp
🏖️ beach|plaj
🏝️ island|ada
🏙️ city|şehir
🏠 house home|ev
🏢 office|ofis
🏫 school|okul
🏥 hospital|hastane
🕌 mosque|cami
🗼 tower|kule
🎡 ferris_wheel|dönme dolap
🌉 bridge|köprü
🌃 night|gece
🌅 sunrise|gün doğumu
`,
    objects: `
⌚ watch|saat
📱 phone mobile|telefon
💻 laptop computer|bilgisayar dizüstü
⌨️ keyboard|klavye
🖥️ desktop|masaüstü
🖱️ mouse_click|fare
💾 floppy save|disket kaydet
💿 cd|cd
📷 camera|kamera
🎥 video_camera|video kamera
📺 tv|televizyon
📻 radio|radyo
🔋 battery|pil
🔌 plug|fiş
💡 bulb idea|ampul fikir
🔦 flashlight|el feneri
🕯️ candle|mum
📚 books|kitaplar
📖 book read|kitap okuma
📝 memo note|not
✏️ pencil|kurşun kalem
🖊️ pen|kalem
📌 pushpin pin|raptiye sabitle
📎 paperclip|ataç
✂️ scissors|makas
📁 folder|klasör
📅 calendar date|takvim
📊 chart|grafik
📈 trending up|yükseliş
📉 trending down|düşüş
🗂️ dividers|dosyalar
🔒 lock|kilit
🔓 unlock|kilit açık
🔑 key|anahtar
🔨 hammer|çekiç
🛠️ tools|aletler
⚙️ gear settings|dişli ayarlar
🧪 test_tube|deney tüpü
🔬 microscope|mikroskop
🔭 telescope|teleskop
💊 pill|ilaç
🧲 magnet|mıknatıs
💰 money_bag|para kesesi
💸 money_wings|para
💳 credit_card|kredi kartı
✉️ envelope mail|zarf posta
📦 package box|paket kutu
🛒 cart|alışveriş arabası
⏰ alarm clock|alarm saat
⏳ hourglass|kum saati
🔔 bell|zil
📣 megaphone|megafon
`,
    symbols: `
❤️ heart love|kalp aşk
🧡 orange_heart|turuncu kalp
💛 yellow_heart|sarı kalp
💚 green_heart|yeşil kalp
💙 blue_heart|mavi kalp
💜 purple_heart|mor kalp
🖤 black_heart|siyah kalp
🤍 white_heart|beyaz kalp
💔 broken_heart|kırık kalp
💕 two_hearts|kalpler
💖 sparkling_heart|parlayan kalp
💯 hundred perfect|yüz tam
✅ check yes done|tamam onay
☑️ ballot_check|onay kutusu
✔️ heavy_check|tik
❌ x no cross|çarpı hayır
❗ exclamation|ünlem
❓ question|soru
⚠️ warning|uyarı
🚫 no_entry forbidden|yasak
⛔ stop|dur
💤 zzz sleep|uyku
💬 speech chat|konuşma sohbet
💭 thought|düşünce
🗯️ anger_bubble|öfke
♻️ recycle|geri dönüşüm
🔁 repeat|tekrar
🔄 refresh|yenile
➕ plus|artı
➖ minus|eksi
➡️ arrow_right|sağ ok
⬅️ arrow_left|sol ok
⬆️ arrow_up|yukarı ok
⬇️ arrow_down|aşağı ok
🆗 ok|tamam
🆕 new|yeni
🆒 cool|havalı
🔴 red_circle|kırmızı daire
🟢 green_circle|yeşil daire
🔵 blue_circle|mavi daire
🟡 yellow_circle|sarı daire
⚫ black_circle|siyah daire
⚪ white_circle|beyaz daire
🏳️ white_flag|beyaz bayrak
🏁 checkered_flag finish|bitiş bayrağı
🇹🇷 turkey flag_tr|türkiye bayrak
©️ copyright|telif
™️ trademark|marka
`,
};

export const EMOJI_CATEGORY_COPY: Record<EmojiCategoryId, { icon: string; label: Copy }> = {
    smileys: { icon: "😀", label: { TR: "Yüzler", EN: "Smileys" } },
    people: { icon: "👋", label: { TR: "İnsanlar", EN: "People" } },
    nature: { icon: "🐶", label: { TR: "Doğa", EN: "Nature" } },
    food: { icon: "🍕", label: { TR: "Yiyecek", EN: "Food" } },
    activity: { icon: "⚽", label: { TR: "Etkinlik", EN: "Activity" } },
    travel: { icon: "🚀", label: { TR: "Seyahat", EN: "Travel" } },
    objects: { icon: "💡", label: { TR: "Nesneler", EN: "Objects" } },
    symbols: { icon: "❤️", label: { TR: "Semboller", EN: "Symbols" } },
};

export const EMOJI_CATEGORY_IDS = Object.keys(DATA) as EmojiCategoryId[];

function parseCategory(block: string): EmojiEntry[] {
    return block.split("\n").flatMap((line) => {
        const trimmed = line.trim();
        if (!trimmed) return [];
        const space = trimmed.indexOf(" ");
        if (space < 1) return [];
        const char = trimmed.slice(0, space);
        const [english = "", turkish = ""] = trimmed.slice(space + 1).split("|");
        const englishWords = english.split(" ").filter(Boolean);
        const name = englishWords[0] ?? "";
        if (!name) return [];
        return [{ char, name, words: [...englishWords, ...turkish.split(" ").filter(Boolean)].map(foldForMatch) }];
    });
}

export const EMOJI_BY_CATEGORY: Record<EmojiCategoryId, EmojiEntry[]> = Object.fromEntries(
    EMOJI_CATEGORY_IDS.map((id) => [id, parseCategory(DATA[id])]),
) as Record<EmojiCategoryId, EmojiEntry[]>;

export const ALL_EMOJI: EmojiEntry[] = EMOJI_CATEGORY_IDS.flatMap((id) => EMOJI_BY_CATEGORY[id]);

const BY_CHAR = new Map(ALL_EMOJI.map((entry) => [entry.char, entry]));

export function emojiByChar(char: string) {
    return BY_CHAR.get(char) ?? null;
}

/** Emoji whose words start with (or, after those, contain) the query; at most `limit`. */
export function searchEmoji(query: string, limit = 48): EmojiEntry[] {
    const wanted = foldForMatch(query.trim().replace(/^:|:$/g, ""));
    if (!wanted) return [];
    const starts: EmojiEntry[] = [];
    const contains: EmojiEntry[] = [];
    for (const entry of ALL_EMOJI) {
        if (entry.words.some((word) => word.startsWith(wanted))) starts.push(entry);
        else if (entry.words.some((word) => word.includes(wanted))) contains.push(entry);
        if (starts.length >= limit) break;
    }
    return [...starts, ...contains].slice(0, limit);
}
