"use client";

import { Magnet, Play, RotateCcw, Shield, Trophy } from "lucide-react";
import { prefersReducedMotion } from "@/lib/appearance";
import { useEffect, useRef, useState } from "react";
import { RUNNER } from "./runner-rules";

export type RunnerEvent = "jump" | "doubleJump" | "coin" | "hit" | "shield" | "magnet";

type State = "intro" | "play" | "over";
interface Obstacle { x: number; w: number; h: number }
interface Coin { x: number; y: number; taken: boolean; spin: number }
interface PowerUp { x: number; y: number; kind: "shield" | "magnet" }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }

const BEST_KEY = "hanogt_runner_best";
/** Back to the self-playing intro after this long on the game-over screen. */
const OVER_TIMEOUT = 10;

/**
 * The site's accent colors (indigo and purple into pink, then amber; globals.css
 * --text-gradient): the runner is pink, coins amber, obstacles purple and the
 * power-ups indigo and purple, over a lavender-to-pink sky.
 */
const PALETTE = {
    light: {
        skyTop: "#f5f3ff", skyBottom: "#fdf2f8", far: "#ede9fe", near: "#fce7f3", ground: "#faf5ff", ink: "#1e1b4b", eye: "#ffffff",
        obstacle: ["#6366f1", "#a855f7"], runner: "#ec4899", coin: "#f59e0b", shield: "#6366f1", magnet: "#a855f7",
        line: ["#6366f1", "#a855f7", "#ec4899", "#f59e0b"],
    },
    dark: {
        skyTop: "#0c0a1d", skyBottom: "#1a0b1f", far: "#1d1736", near: "#2a1433", ground: "#120d20", ink: "#07060f", eye: "#07060f",
        obstacle: ["#818cf8", "#c084fc"], runner: "#f472b6", coin: "#fbbf24", shield: "#818cf8", magnet: "#c084fc",
        line: ["#818cf8", "#c084fc", "#f472b6", "#fbbf24"],
    },
};

/** "#rrggbb" with an alpha, for the particles. */
const alpha = (hex: string, value: number) => `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${value})`;
const paletteNow = () => (document.documentElement.classList.contains("dark") ? PALETTE.dark : PALETTE.light);

function readBest() {
    try {
        return Math.max(0, Number(window.localStorage.getItem(BEST_KEY)) || 0);
    } catch {
        return 0;
    }
}

function writeBest(value: number) {
    try {
        window.localStorage.setItem(BEST_KEY, String(value));
    } catch {
        // Storage blocked: the best score lasts for this visit.
    }
}

/**
 * An endless runner on a canvas, played by the rules of the C# Runner class
 * next to it (runner-rules.ts): it plays itself until the visitor presses
 * Space or taps, then it's theirs until they hit an obstacle. Coyote time,
 * a jump buffer and a double jump make it forgiving; coins in a row raise a
 * multiplier; a shield takes one hit and a magnet pulls coins in.
 */
export default function MiniGame({ labels, onEvent }: {
    labels: { hint: string; tap: string; play: string; again: string; over: string; best: string; score: string };
    onEvent?: (event: RunnerEvent) => void;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const pressRef = useRef<(() => void) | null>(null);
    const onEventRef = useRef(onEvent);
    const [hud, setHud] = useState({ score: 0, best: 0, multiplier: 1, shield: false, magnet: false });
    const [state, setState] = useState<State>("intro");
    const [still, setStill] = useState(false);

    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const reduceMotion = prefersReducedMotion();
        let width = 0, height = 0, ground = 0;
        let frame = 0;
        let last = performance.now();
        let visible = true;
        let running = !reduceMotion;
        let mode: State = "intro";
        let overFor = 0;
        let elapsed = 0;
        let spawnObstacle = 1.2, spawnCoin = 0.6, spawnPower = 9;
        let shake = 0;
        let score = 0, streak = 0, best = readBest();
        let shield = false, magnetFor = 0;
        // The C# fields: time since the runner left the ground, since Jump was pressed, jumps left.
        let sinceGrounded = 0, sinceJumpPressed = Number.POSITIVE_INFINITY, jumpsLeft: number = RUNNER.maxJumps;
        const player = { x: 56, y: 0, vy: 0, size: 26, grounded: true, squash: 0 };
        let obstacles: Obstacle[] = [];
        let coins: Coin[] = [];
        let powers: PowerUp[] = [];
        let particles: Particle[] = [];
        const emit = (event: RunnerEvent) => onEventRef.current?.(event);
        const multiplier = () => Math.min(RUNNER.maxMultiplier, 1 + Math.floor(streak / RUNNER.streakStep));
        const publish = () => setHud({ score, best, multiplier: multiplier(), shield, magnet: magnetFor > 0 });

        const resize = () => {
            const rect = canvas.getBoundingClientRect();
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            width = rect.width;
            height = rect.height;
            canvas.width = Math.round(width * dpr);
            canvas.height = Math.round(height * dpr);
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            ground = height - 34;
            if (player.grounded) player.y = ground - player.size;
            // Resizing clears the canvas: draw again at once rather than leave it blank until the next frame.
            draw();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(canvas);
        const visibility = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; });
        visibility.observe(canvas);

        const burst = (x: number, y: number, color: string, count = 10) => {
            for (let index = 0; index < count; index += 1) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 60 + Math.random() * 180;
                particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 80, life: 0.5 + Math.random() * 0.4, color });
            }
        };

        const resetWorld = () => {
            obstacles = [];
            coins = [];
            powers = [];
            particles = [];
            spawnObstacle = 1.2;
            spawnCoin = 0.6;
            spawnPower = 9;
            elapsed = 0;
            score = 0;
            streak = 0;
            shield = false;
            magnetFor = 0;
            player.vy = 0;
            player.grounded = true;
            player.y = ground - player.size;
            sinceGrounded = 0;
            sinceJumpPressed = Number.POSITIVE_INFINITY;
            jumpsLeft = RUNNER.maxJumps;
        };

        const setMode = (next: State) => {
            mode = next;
            setState(next);
        };

        // Jump(): a press is remembered for the jump buffer; the update decides.
        const press = () => {
            if (!running) {
                running = true;
                setStill(false);
                last = performance.now();
                frame = requestAnimationFrame(loop);
            }
            if (mode === "over") {
                resetWorld();
                setMode("play");
                publish();
                return;
            }
            if (mode === "intro") {
                resetWorld();
                setMode("play");
                publish();
            }
            sinceJumpPressed = 0;
        };
        pressRef.current = press;

        const tryJump = () => {
            const onGroundOrCoyote = player.grounded || sinceGrounded <= RUNNER.coyoteTime;
            if (sinceJumpPressed > RUNNER.jumpBuffer) return;
            if (onGroundOrCoyote && jumpsLeft === RUNNER.maxJumps) {
                player.vy = -RUNNER.jumpSpeed;
                jumpsLeft -= 1;
                emit("jump");
            } else if (jumpsLeft > 0 && !player.grounded) {
                player.vy = -RUNNER.doubleJumpSpeed;
                jumpsLeft = 0;
                emit("doubleJump");
                burst(player.x + player.size / 2, player.y + player.size, alpha(paletteNow().runner, 0.9), 8);
            } else {
                return;
            }
            sinceJumpPressed = Number.POSITIVE_INFINITY;
            player.grounded = false;
            player.squash = -0.25;
        };

        const hit = (obstacle: Obstacle) => {
            obstacle.x = -100;
            shake = 0.35;
            burst(player.x + player.size / 2, player.y + player.size / 2, "rgba(244,63,94,1)", 16);
            if (shield) {
                shield = false;
                emit("shield");
                publish();
                return;
            }
            streak = 0;
            emit("hit");
            if (mode === "play") {
                if (score > best) {
                    best = score;
                    writeBest(best);
                }
                overFor = 0;
                setMode("over");
            } else {
                score = 0;
            }
            publish();
        };

        const update = (dt: number) => {
            if (mode === "over") {
                overFor += dt;
                if (overFor > OVER_TIMEOUT) {
                    resetWorld();
                    setMode("intro");
                    publish();
                }
                return;
            }
            elapsed += dt;
            const speed = 250 + Math.min(elapsed * 4, 140);
            // The intro plays itself.
            if (mode === "intro") {
                const next = obstacles.find((obstacle) => obstacle.x + obstacle.w > player.x);
                if (next && next.x > player.x && next.x - (player.x + player.size) < speed * 0.2 && player.grounded) sinceJumpPressed = 0;
            }
            sinceGrounded = player.grounded ? 0 : sinceGrounded + dt;
            sinceJumpPressed += dt;
            tryJump();

            spawnObstacle -= dt;
            spawnCoin -= dt;
            spawnPower -= dt;
            if (spawnObstacle <= 0) {
                obstacles.push({ x: width + 20, w: 18 + Math.random() * 18, h: 22 + Math.random() * 26 });
                spawnObstacle = 1.1 + Math.random() * 1.1;
            }
            if (spawnCoin <= 0) {
                coins.push({ x: width + 20, y: ground - 60 - Math.random() * 80, taken: false, spin: Math.random() * Math.PI });
                spawnCoin = 0.5 + Math.random() * 0.8;
            }
            if (spawnPower <= 0) {
                powers.push({ x: width + 20, y: ground - 70 - Math.random() * 50, kind: Math.random() < 0.5 ? "shield" : "magnet" });
                spawnPower = 12 + Math.random() * 8;
            }

            player.vy += RUNNER.gravity * dt;
            player.y += player.vy * dt;
            if (player.y >= ground - player.size) {
                if (!player.grounded) player.squash = 0.3;
                player.y = ground - player.size;
                player.vy = 0;
                player.grounded = true;
                jumpsLeft = RUNNER.maxJumps;
            }
            player.squash *= Math.pow(0.001, dt);
            magnetFor = Math.max(0, magnetFor - dt);

            const cx = player.x + player.size / 2, cy = player.y + player.size / 2;
            for (const obstacle of obstacles) obstacle.x -= speed * dt;
            for (const power of powers) power.x -= speed * dt;
            for (const coin of coins) {
                coin.x -= speed * dt;
                coin.spin += dt * 6;
                if (magnetFor > 0 && coin.x - cx < 220 && coin.x > cx - 30) {
                    coin.x += (cx - coin.x) * Math.min(1, dt * 7);
                    coin.y += (cy - coin.y) * Math.min(1, dt * 7);
                }
            }
            obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -10);
            powers = powers.filter((power) => power.x > -20);

            for (const coin of coins) {
                if (Math.abs(coin.x - cx) < 20 && Math.abs(coin.y - cy) < 24) {
                    coin.taken = true;
                    // OnCoin(): the streak raises the multiplier.
                    streak += 1;
                    score += multiplier();
                    if (mode === "intro" && score > 99) score = 0;
                    emit("coin");
                    burst(coin.x, coin.y, alpha(paletteNow().coin, 1), 12);
                    publish();
                }
            }
            coins = coins.filter((coin) => coin.x > -20 && !coin.taken);
            for (const power of powers) {
                if (Math.abs(power.x - cx) < 22 && Math.abs(power.y - cy) < 26) {
                    power.x = -100;
                    if (power.kind === "shield") shield = true;
                    else magnetFor = RUNNER.magnetSeconds;
                    emit(power.kind);
                    burst(power.x, power.y, alpha(power.kind === "shield" ? paletteNow().shield : paletteNow().magnet, 1), 12);
                    publish();
                }
            }
            for (const obstacle of obstacles) {
                if (player.x + player.size - 4 > obstacle.x && player.x + 4 < obstacle.x + obstacle.w && player.y + player.size > ground - obstacle.h + 4) hit(obstacle);
            }
            for (const particle of particles) {
                particle.life -= dt;
                particle.vy += 900 * dt;
                particle.x += particle.vx * dt;
                particle.y += particle.vy * dt;
            }
            particles = particles.filter((particle) => particle.life > 0);
            shake = Math.max(0, shake - dt);
        };

        const layer = (color: string, factor: number, base: number, step: number, heights: number[]) => {
            context.fillStyle = color;
            const offset = (elapsed * 250 * factor) % (step * heights.length);
            for (let index = 0, x = -offset; x < width + step; index += 1, x += step) {
                const h = heights[index % heights.length];
                context.beginPath();
                context.roundRect(x, base - h, step - 6, h + 4, 6);
                context.fill();
            }
        };

        function draw() {
            const colors = paletteNow();
            context!.save();
            if (shake > 0) context!.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
            const sky = context!.createLinearGradient(0, 0, 0, ground);
            sky.addColorStop(0, colors.skyTop);
            sky.addColorStop(1, colors.skyBottom);
            context!.fillStyle = sky;
            context!.fillRect(-20, -20, width + 40, height + 40);
            // Parallax: far blocks drift slowly, near ones faster.
            layer(colors.far, 0.15, ground, 70, [46, 70, 38, 88, 56, 64]);
            layer(colors.near, 0.4, ground, 54, [22, 34, 18, 40, 28]);
            context!.fillStyle = colors.ground;
            context!.fillRect(0, ground, width, height - ground);
            // The ground line in the accent gradient, like the headings.
            const line = context!.createLinearGradient(0, 0, width, 0);
            colors.line.forEach((color, index) => line.addColorStop(index / (colors.line.length - 1), color));
            context!.fillStyle = line;
            context!.fillRect(0, ground, width, 2.5);

            for (const coin of coins) {
                const squeeze = Math.abs(Math.cos(coin.spin));
                context!.fillStyle = colors.coin;
                context!.strokeStyle = colors.ink;
                context!.lineWidth = 1.5;
                context!.beginPath();
                context!.ellipse(coin.x, coin.y, 8 * squeeze + 1, 8, 0, 0, Math.PI * 2);
                context!.fill();
                context!.stroke();
            }
            for (const power of powers) {
                context!.fillStyle = power.kind === "shield" ? colors.shield : colors.magnet;
                context!.strokeStyle = colors.ink;
                context!.lineWidth = 2;
                context!.beginPath();
                context!.arc(power.x, power.y, 11, 0, Math.PI * 2);
                context!.fill();
                context!.stroke();
                context!.fillStyle = "#ffffff";
                context!.font = "bold 11px ui-sans-serif, system-ui";
                context!.textAlign = "center";
                context!.textBaseline = "middle";
                context!.fillText(power.kind === "shield" ? "S" : "M", power.x, power.y + 0.5);
            }
            for (const obstacle of obstacles) {
                const top = ground - obstacle.h;
                const fill = context!.createLinearGradient(0, top, 0, ground);
                fill.addColorStop(0, colors.obstacle[1]);
                fill.addColorStop(1, colors.obstacle[0]);
                context!.fillStyle = fill;
                context!.beginPath();
                context!.roundRect(obstacle.x, top, obstacle.w, obstacle.h, 5);
                context!.fill();
            }
            // The runner: a pink sticker block with an ink outline, squashed on landing.
            const size = player.size;
            const sx = size * (1 + player.squash * 0.6);
            const sy = size * (1 - player.squash * 0.6);
            const bx = player.x + (size - sx) / 2;
            const by = player.y + (size - sy);
            if (shield) {
                context!.strokeStyle = alpha(colors.shield, 0.85);
                context!.lineWidth = 3;
                context!.beginPath();
                context!.arc(bx + sx / 2, by + sy / 2, size * 0.9, 0, Math.PI * 2);
                context!.stroke();
            }
            context!.fillStyle = colors.runner;
            context!.strokeStyle = colors.ink;
            context!.lineWidth = 2.5;
            context!.beginPath();
            context!.roundRect(bx, by, sx, sy, 7);
            context!.fill();
            context!.stroke();
            context!.fillStyle = colors.eye;
            context!.fillRect(bx + sx * 0.55, by + sy * 0.28, 4, 6);
            context!.fillRect(bx + sx * 0.76, by + sy * 0.28, 4, 6);
            for (const particle of particles) {
                context!.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
                context!.fillStyle = particle.color;
                context!.fillRect(particle.x - 2, particle.y - 2, 4, 4);
            }
            context!.globalAlpha = 1;
            context!.restore();
        }

        function loop(now: number) {
            const dt = Math.min(0.033, (now - last) / 1000);
            last = now;
            if (visible && !document.hidden) {
                update(dt);
                draw();
            }
            frame = requestAnimationFrame(loop);
        }

        resize();
        publish();
        if (running) frame = requestAnimationFrame(loop);
        else {
            // Reduced motion: a still frame and a Play button; it moves only once asked to.
            setStill(true);
            draw();
        }
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            visibility.disconnect();
            pressRef.current = null;
        };
    }, []);

    const hintText = state === "intro" ? labels.tap : state === "over" ? labels.again : labels.hint;

    return (
        <div className="relative select-none" data-game-state={state}>
            <canvas
                ref={canvasRef}
                tabIndex={0}
                role="button"
                aria-label={`${labels.hint}. ${labels.tap}`}
                onPointerDown={() => pressRef.current?.()}
                onKeyDown={(event) => {
                    if (event.code === "Space" || event.key === "Enter" || event.key === "ArrowUp" || event.key === "w") {
                        event.preventDefault();
                        pressRef.current?.();
                    }
                }}
                // pan-y: a vertical swipe on the game still scrolls the page on phones.
                style={{ touchAction: "pan-y" }}
                className="block h-[210px] w-full cursor-pointer rounded-b-2xl outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-pink-500"
            />
            <div className="pointer-events-none absolute inset-x-3 top-2.5 flex items-center justify-between gap-2 text-[11px] font-bold">
                <span className="inline-flex items-center gap-2 rounded-md bg-zinc-900/80 px-2 py-1 text-white tabular-nums">
                    <span>{labels.score} {hud.score}</span>
                    {hud.multiplier > 1 ? <span className="rounded bg-amber-400 px-1 text-zinc-900">×{hud.multiplier}</span> : null}
                    <span className="inline-flex items-center gap-1 text-white/70"><Trophy className="h-3 w-3" aria-hidden="true" />{labels.best} {hud.best}</span>
                    {hud.shield ? <Shield className="h-3.5 w-3.5 text-indigo-300" aria-hidden="true" /> : null}
                    {hud.magnet ? <Magnet className="h-3.5 w-3.5 text-purple-300" aria-hidden="true" /> : null}
                </span>
                {still ? null : <span className="truncate rounded-md bg-zinc-900/80 px-2 py-1 text-white/85">{hintText}</span>}
            </div>
            {state === "over" ? (
                <div className="pointer-events-none absolute inset-0 grid place-items-center rounded-b-2xl bg-zinc-950/45">
                    <div className="rounded-xl bg-white px-4 py-3 text-center text-zinc-900 shadow-lg dark:bg-zinc-900 dark:text-white">
                        <p className="text-[13px] font-black">{labels.over}</p>
                        <p className="mt-0.5 text-[12px] tabular-nums text-zinc-600 dark:text-zinc-300">{labels.score} {hud.score} · {labels.best} {hud.best}</p>
                        <p className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-pink-600 dark:text-pink-400"><RotateCcw className="h-3 w-3" aria-hidden="true" />{labels.again}</p>
                    </div>
                </div>
            ) : null}
            {still ? (
                <button
                    type="button"
                    onClick={() => pressRef.current?.()}
                    className="absolute inset-0 m-auto inline-flex h-11 w-fit items-center gap-2 rounded-xl bg-zinc-900 px-4 text-[14px] font-bold text-white shadow-lg dark:bg-white dark:text-zinc-900"
                >
                    <Play className="h-4 w-4" aria-hidden="true" />{labels.play}
                </button>
            ) : null}
        </div>
    );
}
