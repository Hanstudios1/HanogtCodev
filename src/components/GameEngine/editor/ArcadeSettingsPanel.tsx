"use client";

/**
 * Project settings → Arcade (V5): the game's leaderboards and achievements.
 * Scripts report to them (Leaderboard.Submit, Achievements.Unlock); the Arcade
 * keeps scores and unlocks for signed-in players and checks every score
 * against what is set here.
 */
import { Eye, EyeOff, Medal, Plus, ShieldCheck, Trash2, Trophy } from "lucide-react";
import { useState } from "react";
import { ARCADE_LIMITS, cleanArcadeId, createAchievement, createLeaderboard } from "@/lib/game-engine/arcade";
import type { ArcadeAchievement, ArcadeLeaderboard, ArcadeSettings, GameProjectDocument } from "@/lib/game-engine/types";
import { useEditor } from "./context";
import { touch } from "./operations";
import { useEditorState } from "./store";
import { Button, IconButton, NumberInput, SelectInput, TextInput, cx, inputClass } from "./ui";

/** The first free id of the form "base", "base-2", "base-3"… */
function freeId(base: string, taken: ReadonlyArray<{ id: string }>) {
    const used = new Set(taken.map((item) => item.id));
    if (!used.has(base)) return base;
    for (let index = 2; ; index += 1) if (!used.has(`${base}-${index}`)) return `${base}-${index}`;
}

/** An id field: cleaned and checked for clashes when it is committed. */
function IdInput({ value, taken, disabled, onChange, onRejected }: { value: string; taken: ReadonlyArray<{ id: string }>; disabled: boolean; onChange: (id: string) => void; onRejected: (message: string) => void }) {
    const { t } = useEditor();
    const [draft, setDraft] = useState<string | null>(null);
    const commit = () => {
        if (draft === null) return;
        const id = cleanArcadeId(draft);
        setDraft(null);
        if (!id || id === value) {
            if (!id) onRejected(t("arcadeIdInvalid"));
            return;
        }
        if (taken.some((item) => item.id === id)) {
            onRejected(t("arcadeIdTaken").replace("{id}", id));
            return;
        }
        onChange(id);
    };
    return (
        <input
            value={draft ?? value}
            disabled={disabled}
            spellCheck={false}
            maxLength={ARCADE_LIMITS.idLength}
            aria-label={t("arcadeId")}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
                if (event.key === "Escape") {
                    setDraft(null);
                    event.currentTarget.blur();
                }
            }}
            className={cx(inputClass, "font-mono text-[11.5px] text-indigo-200")}
        />
    );
}

function Label({ children }: { children: React.ReactNode }) {
    return <span className="mb-1 block text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500">{children}</span>;
}

export function ArcadeSettingsPanel({ disabled }: { disabled: boolean }) {
    const { store, t } = useEditor();
    const settings = useEditorState(store, (state) => state.project.settings.arcade);
    const [notice, setNotice] = useState<string | null>(null);
    const boards = settings.leaderboards;
    const achievements = settings.achievements;

    const update = (label: string, recipe: (arcade: ArcadeSettings, draft: GameProjectDocument) => void, mergeKey?: string) => store.update(label, (draft) => {
        recipe(draft.settings.arcade, draft);
        touch(draft);
    }, mergeKey ? { mergeKey: `arcade:${mergeKey}` } : undefined);
    const editBoard = (id: string, recipe: (board: ArcadeLeaderboard) => void, field: string) => update(t("hArcadeBoard"), (arcade) => {
        const board = arcade.leaderboards.find((item) => item.id === id);
        if (board) recipe(board);
    }, `board:${id}:${field}`);
    const editAchievement = (id: string, recipe: (achievement: ArcadeAchievement) => void, field: string) => update(t("hArcadeAchievement"), (arcade) => {
        const achievement = arcade.achievements.find((item) => item.id === id);
        if (achievement) recipe(achievement);
    }, `achievement:${id}:${field}`);

    const addBoard = () => {
        if (boards.length >= ARCADE_LIMITS.leaderboards) return;
        const id = freeId(boards.length ? "board" : "main", boards);
        update(t("hArcadeBoard"), (arcade) => {
            arcade.leaderboards.push(createLeaderboard(id, boards.length ? t("arcadeNewBoard") : t("arcadeScoreBoard")));
        });
    };
    const addAchievement = () => {
        if (achievements.length >= ARCADE_LIMITS.achievements) return;
        const id = freeId("achievement", achievements);
        update(t("hArcadeAchievement"), (arcade) => {
            arcade.achievements.push(createAchievement(id, t("arcadeNewAchievement")));
        });
    };

    return (
        <div className="space-y-4" data-arcade-settings>
            <div className="flex items-start gap-2.5 rounded-xl border border-white/[0.06] bg-zinc-950/50 p-3">
                <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden />
                <div className="min-w-0 text-[12px] leading-relaxed text-zinc-400">
                    <p>{t("arcadeIntro")}</p>
                    <p className="mt-1 break-words font-mono text-[11px] text-zinc-300">Leaderboard.Submit(&quot;{boards[0]?.id ?? "main"}&quot;, score); · Achievements.Unlock(&quot;{achievements[0]?.id ?? "first-win"}&quot;);</p>
                </div>
            </div>

            <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-200"><Trophy className="h-3.5 w-3.5 text-amber-300" aria-hidden />{t("arcadeBoards")} <span className="font-normal text-zinc-500">{boards.length}/{ARCADE_LIMITS.leaderboards}</span></h3>
                    <Button className="shrink-0 whitespace-nowrap" disabled={disabled || boards.length >= ARCADE_LIMITS.leaderboards} onClick={addBoard}><Plus className="h-3.5 w-3.5" />{t("arcadeAddBoard")}</Button>
                </div>
                {!boards.length ? <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-zinc-500">{t("arcadeNoBoards")}</p> : null}
                <div className="space-y-2">
                    {boards.map((board) => (
                        <div key={board.id} className="rounded-xl border border-white/[0.07] bg-zinc-900/60 p-3" data-arcade-board={board.id}>
                            <div className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-end gap-2">
                                <label className="block min-w-0"><Label>{t("arcadeId")}</Label>
                                    <IdInput value={board.id} taken={boards} disabled={disabled} onRejected={setNotice} onChange={(id) => editBoard(board.id, (item) => { item.id = id; }, "id")} />
                                </label>
                                <label className="block min-w-0"><Label>{t("arcadeName")}</Label>
                                    <TextInput value={board.name} maxLength={ARCADE_LIMITS.nameLength} disabled={disabled} onChange={(value) => value.trim() && editBoard(board.id, (item) => { item.name = value.trim().slice(0, ARCADE_LIMITS.nameLength); }, "name")} />
                                </label>
                                <IconButton icon={Trash2} label={t("arcadeRemoveBoard")} tone="danger" disabled={disabled} onClick={() => update(t("hArcadeBoard"), (arcade) => { arcade.leaderboards = arcade.leaderboards.filter((item) => item.id !== board.id); })} />
                            </div>
                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                <label className="block"><Label>{t("arcadeOrder")}</Label>
                                    <SelectInput value={board.order} disabled={disabled} onChange={(value) => editBoard(board.id, (item) => { item.order = value; }, "order")} options={[{ value: "desc", label: t("arcadeOrderDesc") }, { value: "asc", label: t("arcadeOrderAsc") }]} />
                                </label>
                                <label className="block"><Label>{t("arcadeFormat")}</Label>
                                    <SelectInput value={board.format} disabled={disabled} onChange={(value) => editBoard(board.id, (item) => { item.format = value; }, "format")} options={[{ value: "number", label: t("arcadeFormatNumber") }, { value: "time", label: t("arcadeFormatTime") }]} />
                                </label>
                            </div>
                            <div className="mt-2 grid grid-cols-3 gap-2">
                                <label className="block"><Label>{t("arcadeMinScore")}</Label>
                                    <NumberInput value={board.minScore} step={1} min={-ARCADE_LIMITS.scoreBound} max={board.maxScore} disabled={disabled} onChange={(value) => editBoard(board.id, (item) => { item.minScore = Math.min(value, item.maxScore); }, "min")} />
                                </label>
                                <label className="block"><Label>{t("arcadeMaxScore")}</Label>
                                    <NumberInput value={board.maxScore} step={1} min={board.minScore} max={ARCADE_LIMITS.scoreBound} disabled={disabled} onChange={(value) => editBoard(board.id, (item) => { item.maxScore = Math.max(value, item.minScore); }, "max")} />
                                </label>
                                <label className="block"><Label>{t("arcadeMinPlay")}</Label>
                                    <NumberInput value={board.minPlaySeconds} step={1} min={0} max={ARCADE_LIMITS.maxPlaySeconds} integer disabled={disabled} onChange={(value) => editBoard(board.id, (item) => { item.minPlaySeconds = Math.round(value); }, "play")} />
                                </label>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold text-zinc-200"><Medal className="h-3.5 w-3.5 text-fuchsia-300" aria-hidden />{t("arcadeAchievements")} <span className="font-normal text-zinc-500">{achievements.length}/{ARCADE_LIMITS.achievements}</span></h3>
                    <Button className="shrink-0 whitespace-nowrap" disabled={disabled || achievements.length >= ARCADE_LIMITS.achievements} onClick={addAchievement}><Plus className="h-3.5 w-3.5" />{t("arcadeAddAchievement")}</Button>
                </div>
                {!achievements.length ? <p className="rounded-lg border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-zinc-500">{t("arcadeNoAchievements")}</p> : null}
                <div className="space-y-1.5">
                    {achievements.map((achievement) => (
                        <div key={achievement.id} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)_auto_auto] items-start gap-1.5 rounded-lg border border-white/[0.06] bg-zinc-900/50 p-2 sm:grid-cols-[minmax(0,8rem)_minmax(0,10rem)_minmax(0,1fr)_auto_auto]" data-arcade-achievement={achievement.id}>
                            <IdInput value={achievement.id} taken={achievements} disabled={disabled} onRejected={setNotice} onChange={(id) => editAchievement(achievement.id, (item) => { item.id = id; }, "id")} />
                            <TextInput value={achievement.name} placeholder={t("arcadeName")} maxLength={ARCADE_LIMITS.nameLength} disabled={disabled} onChange={(value) => value.trim() && editAchievement(achievement.id, (item) => { item.name = value.trim().slice(0, ARCADE_LIMITS.nameLength); }, "name")} />
                            <div className="col-span-4 row-start-2 sm:col-span-1 sm:row-start-auto">
                                <TextInput value={achievement.description} placeholder={t("arcadeDescription")} maxLength={ARCADE_LIMITS.descriptionLength} disabled={disabled} onChange={(value) => editAchievement(achievement.id, (item) => { item.description = value.trim().slice(0, ARCADE_LIMITS.descriptionLength); }, "description")} />
                            </div>
                            <IconButton icon={achievement.hidden ? EyeOff : Eye} label={achievement.hidden ? t("arcadeHidden") : t("arcadeVisible")} active={achievement.hidden} disabled={disabled} onClick={() => editAchievement(achievement.id, (item) => { item.hidden = !item.hidden; }, "hidden")} />
                            <IconButton icon={Trash2} label={t("arcadeRemoveAchievement")} tone="danger" disabled={disabled} onClick={() => update(t("hArcadeAchievement"), (arcade) => { arcade.achievements = arcade.achievements.filter((item) => item.id !== achievement.id); })} />
                        </div>
                    ))}
                </div>
            </section>

            {notice ? <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200" role="status">{notice}</p> : null}
            <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-zinc-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />{t("arcadeRulesHint")}</p>
        </div>
    );
}
