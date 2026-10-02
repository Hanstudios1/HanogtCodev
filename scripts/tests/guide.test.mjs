// The Minecraft-style guide (/guide): structure, copy and links stay valid as
// the site changes. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { load, ROOT } from "./setup.mjs";

const { CHAPTERS, CHAPTER_ALIASES, PAGES, blockCopies, chapterStartPage } = await load("components/Guide/book-content.ts");
const { GUIDE_PAGE_COUNT } = await load("components/Guide/book-meta.ts");

const read = (path) => fs.readFileSync(new URL(path, ROOT), "utf8");

/** Whether src/app has a page for the path; route groups such as (app) don't add a segment. */
function routeExists(path) {
    const search = (directory, rest) => {
        const folders = fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
        if (!rest.length && fs.existsSync(new URL("page.tsx", directory))) return true;
        if (rest.length && folders.includes(rest[0]) && search(new URL(`${rest[0]}/`, directory), rest.slice(1))) return true;
        return folders.filter((name) => /^\(.+\)$/.test(name)).some((name) => search(new URL(`${name}/`, directory), rest));
    };
    return search(new URL("src/app/", ROOT), path.split("/").filter(Boolean));
}

/** Every Copy on a page, with the page index for messages. */
function pageCopies() {
    return PAGES.flatMap((page, index) => [page.title, ...page.blocks.flatMap(blockCopies)].filter(Boolean).map((copy) => ({ copy, index })));
}

test("the landing teaser knows the page count, and News is chapter 5", () => {
    assert.equal(GUIDE_PAGE_COUNT, PAGES.length, "update GUIDE_PAGE_COUNT in src/components/Guide/book-meta.ts");
    // GuideTeaser shows "Chapter 5: Hanogt News" (gt_ch5) in every language.
    assert.equal(CHAPTERS[4].id, "news");
    for (const file of fs.readdirSync(new URL("src/locales/", ROOT)).filter((name) => name.endsWith(".json"))) {
        const dictionary = JSON.parse(read(`src/locales/${file}`));
        assert.ok(dictionary.gt_page.includes("{total}"), `${file}: gt_page has the {total} placeholder`);
    }
});

test("chapters are contiguous, reachable from the hotbar and open with the cover", () => {
    assert.ok(CHAPTERS.length <= 10, "the hotbar keys are 1–9 and 0");
    assert.equal(new Set(CHAPTERS.map((chapter) => chapter.id)).size, CHAPTERS.length);
    assert.equal(PAGES[0].blocks[0].type, "cover");
    assert.equal(PAGES[1].blocks[0].type, "toc");
    let previous = -1;
    for (const chapter of CHAPTERS) {
        const pages = PAGES.map((page, index) => (page.chapter === chapter.id ? index : -1)).filter((index) => index >= 0);
        assert.ok(pages.length > 0, `${chapter.id} has pages`);
        assert.equal(pages[0], chapterStartPage(chapter.id));
        assert.deepEqual(pages, pages.map((_, offset) => pages[0] + offset), `${chapter.id} pages are contiguous`);
        assert.ok(pages[0] > previous, `${chapter.id} follows the chapter order`);
        previous = pages[0];
    }
    for (const [alias, target] of Object.entries(CHAPTER_ALIASES)) {
        assert.ok(CHAPTERS.some((chapter) => chapter.id === target), `#${alias} opens an existing chapter`);
        assert.ok(!CHAPTERS.some((chapter) => chapter.id === alias), `#${alias} is not a chapter itself`);
    }
    for (const page of PAGES.slice(2)) assert.ok(page.title, "every content page has a title (search and Hanogt AI index titles)");
});

test("every text has Turkish and English with matching placeholders", () => {
    const names = (text) => [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((match) => match[1]).sort();
    for (const { copy, index } of [...pageCopies(), ...CHAPTERS.flatMap((chapter) => [{ copy: chapter.title, index: -1 }, { copy: chapter.item, index: -1 }])]) {
        assert.ok(copy.TR.trim() && copy.EN.trim(), `page ${index + 1}: empty text`);
        assert.deepEqual(names(copy.TR), names(copy.EN), `page ${index + 1}: placeholders differ in "${copy.EN}"`);
        for (const name of names(copy.EN)) {
            assert.ok(copy.vars && name in copy.vars, `page ${index + 1}: {${name}} has a value in "${copy.EN}"`);
            assert.ok(Number(copy.vars[name]) > 0, `page ${index + 1}: {${name}} is a positive count`);
        }
    }
});

test("links point at real pages and real sections", () => {
    const docs = read("src/components/GameEngine/docs/EngineDocs.tsx");
    const links = PAGES.flatMap((page) => page.blocks.filter((block) => block.type === "link"));
    assert.ok(links.length >= 10);
    for (const { href } of links) {
        const [path, hash] = href.split("#");
        assert.ok(path.startsWith("/"), `${href} is an internal link`);
        assert.ok(routeExists(path), `${href}: the page exists`);
        if (hash && path === "/game-engine/docs") assert.ok(docs.includes(`{ id: "${hash}"`), `${href}: the docs section exists`);
    }
});
