/** Billboard icons of the editor's Scene view, drawn on a canvas (no image files needed). */
import * as THREE from "three";

export type EditorIconKind = "camera" | "light" | "audio" | "particles" | "empty" | "text" | "ui";

export function editorIcon(kind: EditorIconKind): THREE.Texture {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
    const palette: Record<string, string> = { camera: "#60a5fa", light: "#fbbf24", audio: "#34d399", particles: "#f472b6", empty: "#a1a1aa", text: "#c084fc", ui: "#c084fc" };
    ctx.fillStyle = "rgba(9,9,11,0.78)";
    ctx.beginPath();
    ctx.arc(32, 32, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = palette[kind];
    ctx.fillStyle = palette[kind];
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    switch (kind) {
        case "camera":
            ctx.fillRect(14, 22, 26, 20);
            ctx.beginPath();
            ctx.moveTo(40, 32);
            ctx.lineTo(51, 23);
            ctx.lineTo(51, 41);
            ctx.closePath();
            ctx.fill();
            break;
        case "light":
            ctx.beginPath();
            ctx.arc(32, 32, 8, 0, Math.PI * 2);
            ctx.fill();
            for (let index = 0; index < 8; index += 1) {
                const angle = (index / 8) * Math.PI * 2;
                ctx.beginPath();
                ctx.moveTo(32 + Math.cos(angle) * 13, 32 + Math.sin(angle) * 13);
                ctx.lineTo(32 + Math.cos(angle) * 20, 32 + Math.sin(angle) * 20);
                ctx.stroke();
            }
            break;
        case "audio":
            ctx.fillRect(16, 26, 8, 12);
            ctx.beginPath();
            ctx.moveTo(24, 26);
            ctx.lineTo(34, 18);
            ctx.lineTo(34, 46);
            ctx.lineTo(24, 38);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(36, 32, 10, -0.8, 0.8);
            ctx.stroke();
            break;
        case "particles":
            for (const [x, y, r] of [[24, 24, 5], [40, 22, 4], [32, 38, 6], [44, 40, 3], [20, 40, 3]]) {
                ctx.beginPath();
                ctx.arc(x, y, r, 0, Math.PI * 2);
                ctx.fill();
            }
            break;
        case "text":
            ctx.font = "bold 34px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("T", 32, 34);
            break;
        case "ui":
            ctx.strokeRect(15, 21, 34, 22);
            ctx.fillRect(21, 29, 22, 6);
            break;
        default:
            ctx.beginPath();
            ctx.moveTo(32, 16);
            ctx.lineTo(48, 32);
            ctx.lineTo(32, 48);
            ctx.lineTo(16, 32);
            ctx.closePath();
            ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
