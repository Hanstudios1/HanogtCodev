"use client";

import { useEffect, useRef, useState } from "react";

interface Obstacle { x: number; w: number; h: number }
interface Coin { x: number; y: number; taken: boolean; spin: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; color: string }

const GRAVITY = 2300;
const JUMP = 760;

/**
 * A tiny endless runner drawn on a canvas: the same game the C# snippet next to it describes.
 * It plays itself until the visitor presses Space / taps, then hands over control.
 */
export default function MiniGame({ hint }: { hint: string }) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const jumpRef = useRef<(() => void) | null>(null);
    const [score, setScore] = useState(0);
    const [best, setBest] = useState(0);
    const [manual, setManual] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d");
        if (!canvas || !context) return;
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        let width = 0;
        let height = 0;
        let ground = 0;
        let frame = 0;
        let last = performance.now();
        let visible = true;
        let spawnObstacle = 1.2;
        let spawnCoin = 0.6;
        let shake = 0;
        let lastInput = -Infinity;
        let elapsed = 0;
        let currentScore = 0;
        let bestScore = 0;
        const player = { x: 56, y: 0, vy: 0, size: 26, grounded: true, squash: 0 };
        let obstacles: Obstacle[] = [];
        let coins: Coin[] = [];
        let particles: Particle[] = [];

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
        };
        resize();
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

        const jump = () => {
            if (!player.grounded) return;
            player.vy = -JUMP;
            player.grounded = false;
            player.squash = -0.25;
            burst(player.x + player.size / 2, ground, "rgba(148,163,184,0.9)", 6);
        };
        jumpRef.current = () => {
            lastInput = elapsed;
            setManual(true);
            jump();
        };

        const update = (dt: number) => {
            elapsed += dt;
            const speed = 250 + Math.min(elapsed * 4, 140);
            const autopilot = elapsed - lastInput > 6;
            if (autopilot) {
                const next = obstacles.find((obstacle) => obstacle.x + obstacle.w > player.x);
                if (next && next.x - (player.x + player.size) < speed * 0.2 && next.x > player.x) jump();
            }
            spawnObstacle -= dt;
            spawnCoin -= dt;
            if (spawnObstacle <= 0) {
                obstacles.push({ x: width + 20, w: 18 + Math.random() * 18, h: 22 + Math.random() * 26 });
                spawnObstacle = 1.1 + Math.random() * 1.1;
            }
            if (spawnCoin <= 0) {
                coins.push({ x: width + 20, y: ground - 60 - Math.random() * 70, taken: false, spin: Math.random() * Math.PI });
                spawnCoin = 0.5 + Math.random() * 0.8;
            }
            player.vy += GRAVITY * dt;
            player.y += player.vy * dt;
            if (player.y >= ground - player.size) {
                if (!player.grounded) player.squash = 0.3;
                player.y = ground - player.size;
                player.vy = 0;
                player.grounded = true;
            }
            player.squash *= Math.pow(0.001, dt);
            for (const obstacle of obstacles) obstacle.x -= speed * dt;
            for (const coin of coins) {
                coin.x -= speed * dt;
                coin.spin += dt * 6;
            }
            obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.w > -10);
            coins = coins.filter((coin) => coin.x > -20 && !coin.taken);
            const px = player.x;
            const py = player.y;
            const ps = player.size;
            for (const coin of coins) {
                if (Math.abs(coin.x - (px + ps / 2)) < 20 && Math.abs(coin.y - (py + ps / 2)) < 24) {
                    coin.taken = true;
                    currentScore += 1;
                    if (currentScore > bestScore) bestScore = currentScore;
                    setScore(currentScore);
                    setBest(bestScore);
                    burst(coin.x, coin.y, "rgba(250,204,21,1)", 12);
                }
            }
            for (const obstacle of obstacles) {
                if (px + ps - 4 > obstacle.x && px + 4 < obstacle.x + obstacle.w && py + ps > ground - obstacle.h + 4) {
                    burst(px + ps / 2, py + ps / 2, "rgba(244,63,94,1)", 16);
                    obstacle.x = -100;
                    shake = 0.35;
                    currentScore = 0;
                    setScore(0);
                }
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

        const draw = () => {
            const dark = document.documentElement.classList.contains("dark");
            context.save();
            if (shake > 0) context.translate((Math.random() - 0.5) * shake * 18, (Math.random() - 0.5) * shake * 18);
            const sky = context.createLinearGradient(0, 0, 0, height);
            sky.addColorStop(0, dark ? "#0b1020" : "#eef2ff");
            sky.addColorStop(1, dark ? "#1e1b4b" : "#fdf4ff");
            context.fillStyle = sky;
            context.fillRect(-20, -20, width + 40, height + 40);
            // Parallax grid
            context.strokeStyle = dark ? "rgba(129,140,248,0.10)" : "rgba(99,102,241,0.10)";
            context.lineWidth = 1;
            const offset = (elapsed * 60) % 32;
            for (let x = -offset; x < width; x += 32) {
                context.beginPath();
                context.moveTo(x, 0);
                context.lineTo(x, ground);
                context.stroke();
            }
            // Ground
            context.fillStyle = dark ? "#312e81" : "#c7d2fe";
            context.fillRect(0, ground, width, height - ground);
            context.fillStyle = dark ? "#6366f1" : "#6366f1";
            context.fillRect(0, ground, width, 3);
            // Coins
            for (const coin of coins) {
                const squeeze = Math.abs(Math.cos(coin.spin));
                context.fillStyle = "#facc15";
                context.beginPath();
                context.ellipse(coin.x, coin.y, 8 * squeeze + 1, 8, 0, 0, Math.PI * 2);
                context.fill();
                context.fillStyle = "rgba(255,255,255,0.7)";
                context.fillRect(coin.x - 1, coin.y - 5, 2, 4);
            }
            // Obstacles
            for (const obstacle of obstacles) {
                const gradient = context.createLinearGradient(0, ground - obstacle.h, 0, ground);
                gradient.addColorStop(0, "#fb7185");
                gradient.addColorStop(1, "#e11d48");
                context.fillStyle = gradient;
                context.beginPath();
                context.roundRect(obstacle.x, ground - obstacle.h, obstacle.w, obstacle.h, 5);
                context.fill();
            }
            // Player (squash & stretch)
            const size = player.size;
            const sx = size * (1 + player.squash * 0.6);
            const sy = size * (1 - player.squash * 0.6);
            const bx = player.x + (size - sx) / 2;
            const by = player.y + (size - sy);
            const body = context.createLinearGradient(bx, by, bx + sx, by + sy);
            body.addColorStop(0, "#818cf8");
            body.addColorStop(1, "#d946ef");
            context.fillStyle = body;
            context.beginPath();
            context.roundRect(bx, by, sx, sy, 7);
            context.fill();
            context.fillStyle = "#fff";
            context.fillRect(bx + sx * 0.55, by + sy * 0.28, 5, 6);
            context.fillRect(bx + sx * 0.78, by + sy * 0.28, 4, 6);
            // Particles
            for (const particle of particles) {
                context.globalAlpha = Math.max(0, Math.min(1, particle.life * 2));
                context.fillStyle = particle.color;
                context.fillRect(particle.x - 2, particle.y - 2, 4, 4);
            }
            context.globalAlpha = 1;
            context.restore();
        };

        const loop = (now: number) => {
            const dt = Math.min(0.033, (now - last) / 1000);
            last = now;
            if (visible && !document.hidden) {
                update(dt);
                draw();
            }
            frame = requestAnimationFrame(loop);
        };
        if (reduceMotion) {
            draw();
        } else {
            frame = requestAnimationFrame(loop);
        }
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            visibility.disconnect();
            jumpRef.current = null;
        };
    }, []);

    return (
        <div className="relative">
            <canvas
                ref={canvasRef}
                tabIndex={0}
                role="img"
                aria-label={hint}
                onPointerDown={(event) => { event.preventDefault(); jumpRef.current?.(); }}
                onKeyDown={(event) => {
                    if (event.code === "Space" || event.key === "ArrowUp" || event.key === "w") {
                        event.preventDefault();
                        jumpRef.current?.();
                    }
                }}
                className="block h-[210px] w-full cursor-pointer touch-none rounded-b-2xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            />
            <div className="pointer-events-none absolute inset-x-3 top-2.5 flex items-center justify-between text-[11px] font-black uppercase tracking-wider">
                <span className="rounded-md bg-black/40 px-2 py-1 text-amber-300 backdrop-blur">🪙 {score} <span className="text-white/60">· {best}</span></span>
                <span className="rounded-md bg-black/40 px-2 py-1 text-white/80 backdrop-blur">{manual ? "🎮" : "🤖"} {hint}</span>
            </div>
        </div>
    );
}
