"use client";

import { Keyboard } from "lucide-react";
import Modal from "@/components/Editor/Modal";
import { EDIT_SHORTCUTS, formatShortcut } from "@/components/Editor/keyboard";
import { useI18n, type Copy } from "@/lib/i18n";

interface Shortcut {
    label: Copy;
    keys: readonly string[];
    /** Different keys on Apple platforms. */
    mac?: readonly string[];
    note?: Copy;
}

const HANOGT: Shortcut[] = [
    { label: { TR: "Tüm dosyaları çalıştır / önizle", EN: "Run all files / preview" }, keys: ["Mod", "Enter"] },
    { label: { TR: "Yalnızca etkin dosyayı çalıştır", EN: "Run the active file only" }, keys: ["Mod", "Shift", "Enter"] },
    { label: { TR: "Kaydet", EN: "Save" }, keys: ["Mod", "S"] },
    { label: { TR: "Hızlı işlemler", EN: "Quick actions" }, keys: ["Mod", "K"] },
    { label: { TR: "N. sekmeye geç", EN: "Go to tab N" }, keys: ["Alt", "1…9"] },
    { label: { TR: "Sekmeyi yeniden adlandır", EN: "Rename the tab" }, keys: ["F2"], note: { TR: "sekme seçiliyken", EN: "when the tab has focus" } },
    { label: { TR: "Sekmeyi kapat", EN: "Close the tab" }, keys: ["Delete"], note: { TR: "sekme seçiliyken veya orta tık", EN: "when the tab has focus, or middle-click" } },
];

const EDITOR: Shortcut[] = [
    { label: { TR: "Editör komut paleti", EN: "Editor command palette" }, keys: ["F1"] },
    { label: { TR: "Geri al", EN: "Undo" }, ...EDIT_SHORTCUTS.undo },
    { label: { TR: "Yinele", EN: "Redo" }, ...EDIT_SHORTCUTS.redo },
    { label: { TR: "Bul", EN: "Find" }, ...EDIT_SHORTCUTS.find },
    { label: { TR: "Bul ve değiştir", EN: "Find and replace" }, ...EDIT_SHORTCUTS.replace },
    { label: { TR: "Belgeyi biçimlendir", EN: "Format document" }, ...EDIT_SHORTCUTS.format },
    { label: { TR: "Satıra git", EN: "Go to line" }, ...EDIT_SHORTCUTS.gotoLine },
    { label: { TR: "Yorum satırı aç/kapat", EN: "Toggle line comment" }, ...EDIT_SHORTCUTS.comment },
    { label: { TR: "Tümünü seç", EN: "Select all" }, ...EDIT_SHORTCUTS.selectAll },
    { label: { TR: "Sonraki eşleşmeyi seç", EN: "Select next occurrence" }, keys: ["Mod", "D"] },
    { label: { TR: "Yukarı/aşağı imleç ekle", EN: "Add cursor above/below" }, keys: ["Ctrl", "Alt", "↑/↓"], mac: ["Alt", "Mod", "↑/↓"] },
    { label: { TR: "Satırı taşı", EN: "Move line" }, keys: ["Alt", "↑/↓"] },
    { label: { TR: "Satırı kopyala", EN: "Copy line" }, keys: ["Shift", "Alt", "↑/↓"] },
    { label: { TR: "Satırı sil", EN: "Delete line" }, keys: ["Mod", "Shift", "K"] },
    { label: { TR: "Bloğu katla / aç", EN: "Fold / unfold block" }, keys: ["Mod", "Shift", "[ / ]"], mac: ["Alt", "Mod", "[ / ]"] },
    { label: { TR: "Önerileri göster", EN: "Trigger suggestions" }, keys: ["Ctrl", "Space"] },
    { label: { TR: "Sembolü yeniden adlandır", EN: "Rename symbol" }, keys: ["F2"], note: { TR: "editörde", EN: "in the editor" } },
    { label: { TR: "Yazı boyutunu büyüt/küçült", EN: "Zoom the font" }, keys: ["Mod", "🖱"], note: { TR: "ayarlarda açıksa", EN: "when enabled in settings" } },
];

export default function ShortcutsDialog({ open, onClose, mac }: { open: boolean; onClose: () => void; mac: boolean }) {
    const { tx } = useI18n();
    const section = (title: string, items: Shortcut[]) => (
        <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{title}</h3>
            <dl className="divide-y divide-zinc-100 overflow-hidden rounded-2xl border border-zinc-200 dark:divide-white/5 dark:border-white/10">
                {items.map((item) => (
                    <div key={item.label.EN} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        <dt className="min-w-0">
                            <span className="text-zinc-700 dark:text-zinc-200">{tx(item.label)}</span>
                            {item.note && <span className="ms-1 text-xs text-zinc-400">({tx(item.note)})</span>}
                        </dt>
                        <dd>
                            <kbd className="whitespace-nowrap rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-xs text-zinc-600 dark:border-white/10 dark:bg-white/5 dark:text-zinc-300">{formatShortcut(mac && item.mac ? item.mac : item.keys, mac)}</kbd>
                        </dd>
                    </div>
                ))}
            </dl>
        </section>
    );
    return (
        <Modal open={open} onClose={onClose} size="lg" icon={<Keyboard className="h-5 w-5" aria-hidden />} title={tx({ TR: "Klavye kısayolları", EN: "Keyboard shortcuts" })} description={tx({ TR: "Editör dışındayken de çalışan Hanogt kısayolları ve Monaco editörünün en kullanışlı kısayolları.", EN: "Hanogt shortcuts that also work outside the editor, and the most useful Monaco editor shortcuts." })}>
            <div className="grid gap-5 md:grid-cols-2">
                {section("Hanogt", HANOGT)}
                {section(tx({ TR: "Kod editörü", EN: "Code editor" }), EDITOR)}
            </div>
        </Modal>
    );
}
