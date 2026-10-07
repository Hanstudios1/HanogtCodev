// Run: node --test scripts/tests/
// Hanogt Media (src/lib/server/media.ts, components/Editor/media-publish.ts):
// tag rules, the paged gallery (sorts, language and tag filters, likes read for
// the page only), download counts with the one-time backfill, and comments
// (moderation, length and per-post caps, who may delete them).
import assert from "node:assert/strict";
import test from "node:test";
import { setFakeEmulatorEnv, withBackend } from "./fake-backend.mjs";
import { load } from "./setup.mjs";

setFakeEmulatorEnv();

const publish = await load("components/Editor/media-publish.ts");
const media = await load("lib/server/media.ts");
const { forgetBackfills } = await load("lib/server/backfill.ts");
const { MEDIA_LIMITS, checkMediaTags, isValidMediaTag, mediaTagSuggestions, normalizeMediaTag } = publish;
const {
    MEDIA_PAGE_SIZE, MediaRequestError, addMediaComment, canDeleteMediaComment, countMediaDownload, deleteMediaComment, emailId,
    ensureMediaBackfill, listMediaComments, listMediaPage, readMediaListQuery,
} = media;

const ALI = "ali@example.com";
const BERK = "berk@example.com";
const CEM = "cem@example.com";

function post(index, extra = {}) {
    return {
        title: `Proje ${index}`,
        description: index % 5 === 0 ? "Hesap makinesi aracı" : "Bir örnek",
        language: index % 2 ? "python" : "javascript",
        languages: index % 2 ? ["python"] : ["javascript", "html"],
        tags: index % 3 === 0 ? ["oyun", "web"] : ["araç"],
        ownerEmail: index % 4 === 0 ? ALI : BERK,
        ownerName: index % 4 === 0 ? "ali" : "berk",
        showAuthor: true,
        fileCount: 1,
        likeCount: index % 7,
        commentCount: 0,
        downloadCount: (index * 3) % 11,
        status: "published",
        createdAt: new Date(Date.UTC(2026, 8, 1) + index * 3_600_000),
        ...extra,
    };
}

function seedPosts(count, extra = () => ({})) {
    const seed = {};
    for (let index = 0; index < count; index += 1) seed[`media_posts/post-${String(index).padStart(4, "0")}`] = post(index, extra(index));
    return seed;
}

const params = (value) => new URLSearchParams(value);

async function readAll(query, email = "") {
    const ids = [];
    let cursor = null;
    for (let guard = 0; guard < 30; guard += 1) {
        const page = await listMediaPage({ ...query, cursor }, email);
        ids.push(...page.posts.map((item) => item.id));
        if (!page.nextCursor) break;
        cursor = readMediaListQuery(params({ sort: query.sort, cursor: page.nextCursor })).cursor;
    }
    return ids;
}

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

test("tags: normalized, lower case, a strict pattern, at most five", () => {
    assert.equal(normalizeMediaTag("  #Game   Dev "), "game-dev");
    assert.equal(normalizeMediaTag("İSTANBUL"), "istanbul");
    assert.equal(normalizeMediaTag("snake_case--tag-"), "snake-case-tag");
    assert.equal(normalizeMediaTag(42), "");
    for (const tag of ["web", "2d", "araç", "oyun-motoru", "objective-c", "x"]) assert.equal(isValidMediaTag(tag), true, tag);
    for (const tag of ["", "Web", "c++", "node.js", "工具", "a--b", "-web", "web-", "x".repeat(25), "with space", "<script>"]) assert.equal(isValidMediaTag(tag), false, tag);

    assert.deepEqual(checkMediaTags("Web, #Araç, web, game dev"), { ok: true, tags: ["web", "araç", "game-dev"] });
    assert.deepEqual(checkMediaTags(["a", "b", "c", "d", "e"]), { ok: true, tags: ["a", "b", "c", "d", "e"] });
    assert.deepEqual(checkMediaTags(["a", "b", "c", "d", "e", "f"]), { ok: false, error: "too_many_tags" });
    assert.deepEqual(checkMediaTags(["a", "A", "#a", "b"]), { ok: true, tags: ["a", "b"] }, "repeats count once");
    assert.deepEqual(checkMediaTags(["web", "c++"]), { ok: false, error: "invalid_tag", tag: "c++" });
    assert.deepEqual(checkMediaTags(["web", 5]), { ok: false, error: "invalid_tag", tag: "" });
    assert.deepEqual(checkMediaTags(["x".repeat(30)]).ok, false);
    assert.deepEqual(checkMediaTags(Array.from({ length: 80 }, (_, index) => `t${index}`)), { ok: false, error: "too_many_tags" });
    assert.deepEqual(checkMediaTags(undefined), { ok: true, tags: [] });
    assert.deepEqual(checkMediaTags(""), { ok: true, tags: [] });
    // The post's languages are offered as tags.
    assert.deepEqual(mediaTagSuggestions(["python", "objective-c", "python", "Bad Id!"]), ["python", "objective-c"]);
    assert.deepEqual(checkMediaTags(["python", "web"], ["python"]), { ok: true, tags: ["python", "web"] });
});

// ---------------------------------------------------------------------------
// The gallery
// ---------------------------------------------------------------------------

test("the list query: sorts, filters and cursors are checked", () => {
    assert.equal(readMediaListQuery(params("")).sort, "likes");
    assert.equal(readMediaListQuery(params("sort=downloads")).sort, "downloads");
    assert.equal(readMediaListQuery(params("sort=evil")).sort, "likes");
    assert.equal(readMediaListQuery(params("language=all")).language, null);
    assert.equal(readMediaListQuery(params("language=Python")).language, "python");
    assert.equal(readMediaListQuery(params("tag=%23Game%20Dev")).tag, "game-dev");
    assert.equal(readMediaListQuery(params("q=%20Araç%20")).q, "arac", "searches ignore accents and case");
    const refused = (value) => assert.throws(() => readMediaListQuery(params(value)), (error) => error instanceof MediaRequestError && error.status === 400, value);
    refused("language=" + encodeURIComponent("../users"));
    refused("tag=c%2B%2B");
    refused("q=" + "x".repeat(81));
    refused("cursor=nope");
    assert.throws(() => readMediaListQuery(params("cursor=" + Buffer.from(JSON.stringify([1, "users/x"])).toString("base64url"))), (error) => error.code === "invalid_cursor");
});

test("pages of 24 follow each other for every sort without repeats", async () => {
    forgetBackfills();
    await withBackend(seedPosts(60), {}, async () => {
        for (const sort of ["likes", "newest", "downloads"]) {
            const first = await listMediaPage(readMediaListQuery(params(`sort=${sort}`)));
            assert.equal(first.posts.length, MEDIA_PAGE_SIZE);
            assert.ok(first.nextCursor, sort);
            const ids = await readAll({ sort, language: null, tag: null, q: null });
            assert.equal(ids.length, 60, sort);
            assert.equal(new Set(ids).size, 60, sort);
        }
        const newest = await listMediaPage(readMediaListQuery(params("sort=newest")));
        assert.equal(newest.posts[0].id, "post-0059");
        const liked = await listMediaPage(readMediaListQuery(params("sort=likes")));
        assert.ok(liked.posts.every((item, index, list) => index === 0 || list[index - 1].likeCount >= item.likeCount));
        const downloads = await listMediaPage(readMediaListQuery(params("sort=downloads")));
        assert.ok(downloads.posts.every((item, index, list) => index === 0 || list[index - 1].downloadCount >= item.downloadCount));
        assert.equal(liked.top.length, 3, "the most liked row leads the unfiltered first page");
        assert.equal(liked.posts[0].owned, false);
        assert.equal("ownerEmail" in liked.posts[0], false, "never the owner's address");
    });
});

test("language and tag filters, alone and together, and a text search", async () => {
    forgetBackfills();
    await withBackend(seedPosts(40, (index) => (index === 3 ? { status: "hidden" } : {})), {}, async () => {
        const all = Object.entries(seedPosts(40)).map(([path, data]) => ({ id: path.split("/")[1], ...data }));
        const python = await readAll({ sort: "newest", language: "python", tag: null, q: null });
        assert.equal(python.length, all.filter((item) => item.languages.includes("python")).length - 1, "the hidden post is left out");
        assert.ok(!python.includes("post-0003"));
        const web = await readAll({ sort: "likes", language: null, tag: "web", q: null });
        assert.deepEqual(new Set(web), new Set(all.filter((item) => item.tags.includes("web") && item.id !== "post-0003").map((item) => item.id)));
        const both = await readAll({ sort: "downloads", language: "html", tag: "web", q: null });
        assert.deepEqual(new Set(both), new Set(all.filter((item) => item.tags.includes("web") && item.languages.includes("html")).map((item) => item.id)));
        const search = await readAll({ sort: "newest", language: null, tag: null, q: "hesap" });
        assert.deepEqual(new Set(search), new Set(all.filter((item) => item.description.startsWith("Hesap")).map((item) => item.id)));
        const filtered = await listMediaPage({ sort: "likes", language: "python", tag: null, q: null, cursor: null });
        assert.equal(filtered.top, undefined, "no most liked row on a filtered list");
    });
});

test("likes are read for the posts on the page only", async () => {
    forgetBackfills();
    const seed = seedPosts(30);
    seed[`media_likes/post-0029_${emailId(CEM)}`] = { postId: "post-0029", userEmail: CEM };
    seed[`media_likes/post-0000_${emailId(CEM)}`] = { postId: "post-0000", userEmail: CEM };
    await withBackend(seed, {}, async () => {
        const original = globalThis.fetch;
        const queried = [];
        globalThis.fetch = async (input, init = {}) => {
            if (String(input).endsWith(":runQuery") && String(init.body).includes("media_likes")) queried.push(init.body);
            return original(input, init);
        };
        try {
            const page = await listMediaPage(readMediaListQuery(params("sort=newest")), CEM);
            assert.equal(page.posts.find((item) => item.id === "post-0029").liked, true);
            assert.equal(page.posts.filter((item) => item.liked).length, 1, "post-0000 isn't on the first page");
            assert.deepEqual(queried, [], "no query over the viewer's likes");
            const anonymous = await listMediaPage(readMediaListQuery(params("sort=newest")));
            assert.equal(anonymous.posts.some((item) => item.liked), false);
        } finally {
            globalThis.fetch = original;
        }
    });
});

test("downloads are counted, and older posts get a counter once so they still sort", async () => {
    forgetBackfills();
    const seed = seedPosts(3);
    delete seed["media_posts/post-0001"].downloadCount;
    await withBackend(seed, {}, async (db) => {
        const before = await readAll({ sort: "downloads", language: null, tag: null, q: null });
        assert.equal(before.includes("post-0001"), false, "a query ordered by the counter leaves the old post out");
        assert.equal(await ensureMediaBackfill(), true);
        assert.equal(db.get("media_posts/post-0001").downloadCount, 0);
        assert.equal(db.get("media_posts/post-0002").downloadCount, 6, "existing counts stay");
        await countMediaDownload("post-0001");
        await countMediaDownload("post-0001");
        assert.equal(db.get("media_posts/post-0001").downloadCount, 2);
        const after = await readAll({ sort: "downloads", language: null, tag: null, q: null });
        assert.equal(after.length, 3);
        await assert.rejects(countMediaDownload("missing-post"), "a deleted post isn't brought back");
        assert.equal(db.has("media_posts/missing-post"), false);
    });
    forgetBackfills();
});

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

const POST_ID = "post-0001";
const stored = (db) => ({ ...db.get(`media_posts/${POST_ID}`), _id: POST_ID });

test("comments are moderated, at most 500 characters and capped per post", async () => {
    await withBackend({ [`media_posts/${POST_ID}`]: post(1, { ownerEmail: ALI }) }, {}, async (db) => {
        const add = (text, email = BERK) => addMediaComment({ post: stored(db), email, authorName: "berk", authorAvatar: null, text });
        const comment = await add("  Güzel bir proje, teşekkürler!  ");
        assert.equal(comment.text, "Güzel bir proje, teşekkürler!");
        assert.equal(comment.mine, true);
        assert.equal(comment.canDelete, true);
        assert.equal(db.get(`media_posts/${POST_ID}`).commentCount, 1);
        assert.equal(db.get(`media_comments/${comment.id}`).authorEmail, BERK);

        const rejected = async (text, code, reason) => {
            await assert.rejects(add(text), (error) => {
                assert.ok(error instanceof MediaRequestError);
                assert.equal(error.code, code);
                if (reason) assert.equal(error.reason, reason);
                return true;
            });
        };
        await rejected("x", "empty_comment");
        await rejected("a".repeat(MEDIA_LIMITS.comment + 1), "comment_rejected", "too-long");
        await rejected("bu ne biçim kod, siktir", "comment_rejected", "profanity");
        await rejected("Bana yaz: berk@example.com", "comment_rejected", "personal-data");
        await rejected("https://a.example https://b.example https://c.example", "comment_rejected", "links");
        await assert.rejects(addMediaComment({ post: stored(db), email: BERK, authorName: "berk", authorAvatar: null, text: 42 }), (error) => error.code === "empty_comment");
        assert.ok(await add("Güzel iş, devam! ".repeat(40).slice(0, MEDIA_LIMITS.comment)), "exactly 500 characters is fine");
        assert.equal(db.get(`media_posts/${POST_ID}`).commentCount, 2, "refused comments aren't counted");

        db.get(`media_posts/${POST_ID}`).commentCount = MEDIA_LIMITS.commentsPerPost;
        await assert.rejects(add("Bir yorum daha"), (error) => error.code === "comment_limit" && error.status === 409);
    });
});

test("a comment on a deleted post fails without leaving a stray counter", async () => {
    await withBackend({}, {}, async (db) => {
        const gone = { ...post(1), _id: "gone-post" };
        await assert.rejects(addMediaComment({ post: gone, email: BERK, authorName: "berk", authorAvatar: null, text: "Merhaba dünya" }), (error) => error.code === "not_found");
        assert.deepEqual(db.paths(), []);
    });
});

test("the comment's author and the post's owner can delete it; nobody else", async () => {
    assert.equal(canDeleteMediaComment({ authorEmail: BERK }, { ownerEmail: ALI }, BERK), true, "author");
    assert.equal(canDeleteMediaComment({ authorEmail: BERK }, { ownerEmail: ALI }, ALI), true, "post owner");
    assert.equal(canDeleteMediaComment({ authorEmail: BERK }, { ownerEmail: ALI }, CEM), false);
    assert.equal(canDeleteMediaComment({ authorEmail: BERK }, null, ALI), false, "a missing post gives its owner no rights");
    assert.equal(canDeleteMediaComment({ authorEmail: BERK }, { ownerEmail: ALI }, ""), false);
    assert.equal(canDeleteMediaComment({}, { ownerEmail: undefined }, ""), false);

    await withBackend({
        [`media_posts/${POST_ID}`]: post(1, { ownerEmail: ALI, commentCount: 3 }),
        "media_posts/other-post": post(2, { ownerEmail: CEM, commentCount: 1 }),
        "media_comments/c1": { postId: POST_ID, authorEmail: BERK, authorName: "berk", text: "bir", createdAt: "2026-10-01T10:00:00.000Z" },
        "media_comments/c2": { postId: POST_ID, authorEmail: CEM, authorName: "cem", text: "iki", createdAt: "2026-10-01T11:00:00.000Z" },
        "media_comments/c3": { postId: POST_ID, authorEmail: CEM, authorName: "cem", text: "üç", createdAt: "2026-10-01T12:00:00.000Z" },
        "media_comments/c4": { postId: "other-post", authorEmail: BERK, authorName: "berk", text: "dört", createdAt: "2026-10-01T12:00:00.000Z" },
    }, {}, async (db) => {
        const listed = await listMediaComments(stored(db), BERK);
        assert.deepEqual(listed.map((item) => [item.id, item.mine, item.canDelete]), [["c1", true, true], ["c2", false, false], ["c3", false, false]]);
        assert.deepEqual((await listMediaComments(stored(db), ALI)).map((item) => item.canDelete), [true, true, true], "the owner may delete every comment");
        assert.equal("authorEmail" in listed[0], false, "never an address");

        const refused = (input, code) => assert.rejects(deleteMediaComment(input), (error) => error.code === code);
        await refused({ postId: POST_ID, commentId: "c2", email: BERK }, "comment_forbidden");
        await refused({ postId: POST_ID, commentId: "c4", email: BERK }, "comment_not_found");
        await refused({ postId: POST_ID, commentId: "missing", email: ALI }, "comment_not_found");
        assert.equal(db.has("media_comments/c2"), true);

        await deleteMediaComment({ postId: POST_ID, commentId: "c1", email: BERK });
        assert.equal(db.has("media_comments/c1"), false, "the author deleted their comment");
        await deleteMediaComment({ postId: POST_ID, commentId: "c2", email: ALI });
        assert.equal(db.has("media_comments/c2"), false, "the post's owner deleted someone else's comment");
        assert.equal(db.get(`media_posts/${POST_ID}`).commentCount, 1);
        await deleteMediaComment({ postId: "other-post", commentId: "c4", email: BERK });
        assert.equal(db.get("media_posts/other-post").commentCount, 0);
    });
});
