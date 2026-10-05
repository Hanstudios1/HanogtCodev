// Builds the logos the site serves from the owner's sources:
//   brand/source/{ai,engine,security,news,social}.png  (product logos)
//   brand/source/hanogt-{light,dark}.png               (the main mark)
// Each drawing is cleaned (small stray marks near the edges, such as an image
// generator's watermark star, are removed), trimmed, centred on a square
// transparent canvas with even padding and written to
//   public/brand/<name>-<size>.{png,webp}   sizes 64, 128, 256, 512
// The main mark also becomes the favicon (src/app/icon.png), the Apple touch
// icon (src/app/apple-icon.png), the install icons (public/brand/hanogt-app-*,
// hanogt-maskable-512.png), the social preview (public/brand/hanogt-og.png)
// and the older public/logo-{light,dark}.png paths.
//
// Run: node scripts/brand-assets.mjs   (needs sharp, a Next.js dependency)
import { mkdirSync } from "node:fs";
import sharp from "sharp";

const ROOT = new URL("../", import.meta.url);
const path = (relative) => new URL(relative, ROOT).pathname;

const SOURCES = ["hanogt-light", "hanogt-dark", "ai", "engine", "security", "news", "social"];
const SIZES = [64, 128, 256, 512];
/** Share of the square left empty on each side. */
const PADDING = 0.06;
/** Background of the app icons: the site's dark surface (--background in globals.css). */
const APP_BACKGROUND = "#07070b";

/** RGBA pixels of an image. */
async function pixels(file) {
    const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
}

/**
 * Removes connected marks that are tiny next to the drawing and sit in the
 * outer band of the image (a watermark star in a corner); everything else is
 * kept, including small parts inside the drawing.
 */
function removeStrayMarks({ data, width, height }) {
    const visible = (index) => data[index * 4 + 3] > 24;
    const label = new Int32Array(width * height).fill(-1);
    const components = [];
    for (let start = 0; start < width * height; start += 1) {
        if (label[start] !== -1 || !visible(start)) continue;
        const id = components.length;
        const stack = [start];
        label[start] = id;
        let area = 0, minX = width, minY = height, maxX = 0, maxY = 0;
        const members = [];
        while (stack.length) {
            const index = stack.pop();
            members.push(index);
            area += 1;
            const x = index % width, y = (index / width) | 0;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const next = ny * width + nx;
                if (label[next] === -1 && visible(next)) {
                    label[next] = id;
                    stack.push(next);
                }
            }
        }
        components.push({ area, minX, minY, maxX, maxY, members });
    }
    const total = components.reduce((sum, component) => sum + component.area, 0);
    const band = 0.14;
    let removed = 0;
    for (const component of components) {
        const inBand = component.minX > width * (1 - band) || component.maxX < width * band || component.minY > height * (1 - band) || component.maxY < height * band;
        if (component.area < total * 0.02 && inBand) {
            for (const index of component.members) data[index * 4 + 3] = 0;
            removed += component.area;
        }
    }
    return removed;
}

/** The drawing's bounding box (visible pixels). */
function boundingBox({ data, width, height }) {
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            if (data[(y * width + x) * 4 + 3] <= 24) continue;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
        }
    }
    if (maxX < 0) throw new Error("empty image");
    return { left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/** The cleaned drawing on a transparent square of `size` pixels, `fill` of it used. */
async function squareMark(image, size, fill = 1 - PADDING * 2) {
    const box = boundingBox(image);
    const trimmed = sharp(image.data, { raw: { width: image.width, height: image.height, channels: 4 } }).extract(box);
    const scale = (size * fill) / Math.max(box.width, box.height);
    const width = Math.max(1, Math.round(box.width * scale));
    const height = Math.max(1, Math.round(box.height * scale));
    const resized = await trimmed.resize(width, height, { kernel: "lanczos3" }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: resized, left: Math.round((size - width) / 2), top: Math.round((size - height) / 2) }])
        .png()
        .toBuffer();
}

/** A rounded (or full-bleed) dark square with the mark in the middle. */
async function appIcon(image, size, { radius, fill }) {
    const mark = await squareMark(image, size, fill);
    const corner = Math.round(size * radius);
    const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${corner}" ry="${corner}" fill="${APP_BACKGROUND}"/></svg>`);
    return sharp(background).composite([{ input: mark }]).png().toBuffer();
}

mkdirSync(path("public/brand"), { recursive: true });
const cleaned = {};
for (const name of SOURCES) {
    const image = await pixels(path(`brand/source/${name}.png`));
    const removed = removeStrayMarks(image);
    cleaned[name] = image;
    for (const size of SIZES) {
        const png = await squareMark(image, size);
        await sharp(png).png({ compressionLevel: 9 }).toFile(path(`public/brand/${name}-${size}.png`));
        await sharp(png).webp({ quality: 90, alphaQuality: 100 }).toFile(path(`public/brand/${name}-${size}.webp`));
    }
    console.log(`${name}: ${SIZES.length * 2} files${removed ? ` (${removed} stray pixels removed)` : ""}`);
}

// The older paths keep working, without the star.
await sharp(await squareMark(cleaned["hanogt-light"], 512)).png({ compressionLevel: 9 }).toFile(path("public/logo-light.png"));
await sharp(await squareMark(cleaned["hanogt-dark"], 512)).png({ compressionLevel: 9 }).toFile(path("public/logo-dark.png"));

// Favicon and touch icon: the light mark is invisible on a light tab bar, so they sit on the dark surface.
await sharp(await appIcon(cleaned["hanogt-dark"], 512, { radius: 0.22, fill: 0.72 })).toFile(path("src/app/icon.png"));
await sharp(await appIcon(cleaned["hanogt-dark"], 180, { radius: 0, fill: 0.66 })).toFile(path("src/app/apple-icon.png"));
for (const size of [192, 512]) {
    await sharp(await appIcon(cleaned["hanogt-dark"], size, { radius: 0.22, fill: 0.72 })).toFile(path(`public/brand/hanogt-app-${size}.png`));
}
// Maskable: launchers crop to a circle inside the middle 80%.
await sharp(await appIcon(cleaned["hanogt-dark"], 512, { radius: 0, fill: 0.56 })).toFile(path("public/brand/hanogt-maskable-512.png"));

// Social preview (1200×630): the mark on the dark surface.
const ogMark = await squareMark(cleaned["hanogt-dark"], 420);
await sharp({ create: { width: 1200, height: 630, channels: 4, background: APP_BACKGROUND } })
    .composite([{ input: ogMark, left: 390, top: 105 }])
    .png({ compressionLevel: 9 })
    .toFile(path("public/brand/hanogt-og.png"));

console.log("app icons, social preview and public/logo-{light,dark}.png written");
