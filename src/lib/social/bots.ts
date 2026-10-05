/**
 * What Hanogt's group bots say, in each reader's language: notices the
 * Hanogt Security Bot posts after a moderation command (stored as an event
 * with its values, like system messages), and the replies only the person
 * who ran a command sees. Framework-free (server and browser).
 */
import type { Copy } from "@/lib/i18n";

export type BotEvent =
    | "warned" | "muted" | "unmuted" | "kicked" | "banned" | "purged" | "slowmode_on" | "slowmode_off"
    | "automod_muted" | "custom" | "welcome" | "ai_failed";

export const BOT_EVENT_COPY: Record<BotEvent, Copy> = {
    warned: { TR: "{target}, {actor} tarafından uyarıldı ({count}. uyarı).", EN: "{target} was warned by {actor} (warning {count})." },
    muted: { TR: "{target}, {actor} tarafından {duration} susturuldu.", EN: "{target} was muted by {actor} for {duration}." },
    unmuted: { TR: "{target} için susturma {actor} tarafından kaldırıldı.", EN: "{actor} lifted {target}'s mute." },
    kicked: { TR: "{target}, {actor} tarafından gruptan çıkarıldı.", EN: "{target} was removed from the group by {actor}." },
    banned: { TR: "{target}, {actor} tarafından gruptan çıkarıldı ve engellendi.", EN: "{target} was removed and blocked by {actor}." },
    purged: { TR: "{actor} bu kanaldaki son {count} mesajı sildi.", EN: "{actor} deleted the last {count} messages in this channel." },
    slowmode_on: { TR: "{actor} bu kanalda yavaş modu açtı: iki mesaj arasında {duration}.", EN: "{actor} turned on slow mode in this channel: {duration} between two messages." },
    slowmode_off: { TR: "{actor} bu kanalda yavaş modu kapattı.", EN: "{actor} turned off slow mode in this channel." },
    automod_muted: { TR: "{target}, AutoMod uyarıları nedeniyle {duration} susturuldu.", EN: "{target} was muted for {duration} after AutoMod warnings." },
    custom: { TR: "{actor}, /{command} komutunu kullandı.", EN: "{actor} used /{command}." },
    welcome: { TR: "Karşılama mesajı", EN: "Welcome message" },
    ai_failed: { TR: "Hanogt AI şu anda yanıt veremedi; hakkın iade edildi. Biraz sonra tekrar dene.", EN: "Hanogt AI couldn't answer right now; your message was given back. Try again in a moment." },
};

export const BOT_REASON_COPY: Copy = { TR: "Sebep: {reason}", EN: "Reason: {reason}" };

/** "2 saat", "10 dakika", "45 saniye" from milliseconds, in the reader's language. */
export function formatDuration(ms: number, language: "TR" | "EN") {
    const units: Array<[number, Copy, Copy]> = [
        [604_800_000, { TR: "hafta", EN: "week" }, { TR: "hafta", EN: "weeks" }],
        [86_400_000, { TR: "gün", EN: "day" }, { TR: "gün", EN: "days" }],
        [3_600_000, { TR: "saat", EN: "hour" }, { TR: "saat", EN: "hours" }],
        [60_000, { TR: "dakika", EN: "minute" }, { TR: "dakika", EN: "minutes" }],
        [1_000, { TR: "saniye", EN: "second" }, { TR: "saniye", EN: "seconds" }],
    ];
    for (const [size, one, many] of units) {
        if (ms >= size && ms % size === 0) {
            const count = ms / size;
            return `${count} ${(count === 1 ? one : many)[language]}`;
        }
    }
    const minutes = Math.max(1, Math.round(ms / 60_000));
    return `${minutes} ${(minutes === 1 ? units[3][1] : units[3][2])[language]}`;
}

/**
 * Replies only the person who ran a command sees (never stored): the
 * command list, the rules, warnings, a report receipt, or why it didn't work.
 */
export type EphemeralReply =
    | { kind: "help" }
    | { kind: "rules"; rules: string }
    | { kind: "warnings"; target: string; items: Array<{ reason: string; at: string; auto: boolean }> }
    | { kind: "reported"; target: string }
    | { kind: "unmuted_none"; target: string }
    | { kind: "ai_limit"; resetsAt: string | null }
    | { kind: "ai_off" }
    | { kind: "ai_unavailable" }
    | { kind: "error"; code: string };

export const EPHEMERAL_COPY = {
    onlyYou: { TR: "Bunu yalnızca sen görüyorsun", EN: "Only you can see this" },
    dismiss: { TR: "Kapat", EN: "Dismiss" },
    helpTitle: { TR: "Kullanabileceğin komutlar", EN: "Commands you can use" },
    customTitle: { TR: "Bu grubun komutları", EN: "This group's commands" },
    rulesTitle: { TR: "Grubun kuralları", EN: "The group's rules" },
    noRules: { TR: "Bu grup henüz kural yazmadı.", EN: "This group hasn't written any rules yet." },
    warningsTitle: { TR: "{name} için uyarılar", EN: "Warnings for {name}" },
    noWarnings: { TR: "Uyarı yok. 👍", EN: "No warnings. 👍" },
    auto: { TR: "AutoMod", EN: "AutoMod" },
    reported: { TR: "{name} için raporun grubun moderatörlerine iletildi. Teşekkürler.", EN: "Your report about {name} went to the group's moderators. Thank you." },
    unmutedNone: { TR: "{name} zaten susturulmuş değil.", EN: "{name} isn't muted." },
    aiLimit: { TR: "Hanogt AI hakkın doldu. Yenilenme: {time}.", EN: "You've used your Hanogt AI allowance. It renews: {time}." },
    aiLimitSoon: { TR: "Hanogt AI hakkın doldu; biraz sonra tekrar dene.", EN: "You've used your Hanogt AI allowance; try again later." },
    aiOff: { TR: "Bu grupta Hanogt AI kapalı. Yöneticiler grup ayarlarından açabilir.", EN: "Hanogt AI is turned off in this group. Admins can turn it on in the group settings." },
    aiUnavailable: { TR: "Hanogt AI şu anda kullanılamıyor.", EN: "Hanogt AI isn't available right now." },
} satisfies Record<string, Copy>;

/** Why a command didn't run (CommandProblem and the server's codes). */
export const COMMAND_ERROR_COPY: Record<string, Copy> = {
    unknown: { TR: "Böyle bir komut yok. Komutları /yardim ile görebilirsin.", EN: "There's no such command. See the commands with /help." },
    needs_member: { TR: "Bir kişi belirt: @ ile adını yaz.", EN: "Name someone: type @ and their name." },
    unknown_member: { TR: "Bu adda bir üye bulunamadı.", EN: "No member with that name was found." },
    needs_text: { TR: "Komuttan sonra bir şey yaz.", EN: "Write something after the command." },
    bad_duration: { TR: "Süre anlaşılamadı. Örnek: 10dk, 2sa, 1g.", EN: "The duration couldn't be read. Example: 10m, 2h, 1d." },
    bad_count: { TR: "1 ile 100 arasında bir sayı yaz.", EN: "Write a number from 1 to 100." },
    forbidden: { TR: "Bu komut için yetkin yok.", EN: "You don't have permission for this command." },
    cannot_moderate: { TR: "Bu kişiye bu işlemi uygulayamazsın; rütbesi seninkiyle aynı ya da daha yüksek.", EN: "You can't do that to this person; their rank is the same as yours or higher." },
    self_action: { TR: "Bunu kendine uygulayamazsın.", EN: "You can't do that to yourself." },
    rate_limited: { TR: "Çok hızlı gidiyorsun. Biraz bekle.", EN: "You're going a bit fast. Wait a moment." },
    server_error: { TR: "Komut çalıştırılamadı. Tekrar dene.", EN: "The command couldn't run. Try again." },
};
