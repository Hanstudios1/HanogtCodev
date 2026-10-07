// Run: npm run test:rules  (starts the Firestore emulator; needs Java 17+)
// Firestore rules regression tests for Hanogt Codev (run inside the emulator).
import fs from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, deleteDoc, collection, query, where, serverTimestamp, deleteField } from "firebase/firestore";

const rules = fs.readFileSync(process.env.RULES_FILE || new URL("../firestore.rules", import.meta.url), "utf8");
const env = await initializeTestEnvironment({ projectId: "hanogt-rules-test", firestore: { rules, host: "127.0.0.1", port: 8080 } });
const A = "alice@example.com", B = "bob@example.com", C = "carol@example.com";
// Signed in, but without a users document (e.g. a tab left open after the account was deleted).
const D = "dave@example.com";
const as = (email) => env.authenticatedContext(email.replace(/[^a-z]/g, ""), { email, app: "hanogt-codev" }).firestore();
const chatId = [A, B].sort().join("_");

await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "users", A), { email: A, username: "alice", friends: [B], blockedUsers: [], role: "user" });
    await setDoc(doc(db, "users", B), { email: B, username: "bob", friends: [A] });
    await setDoc(doc(db, "users", C), { email: C, username: "carol", friends: [] });
    await setDoc(doc(db, "public_profiles", A), {
        email: A, username: "alice", badges: ["verified"], nicknameTag: "1234",
        // The Plus / Pro badge as the server writes it.
        planBadge: { plan: "plus", until: new Date(Date.now() + 86_400_000).toISOString() },
        // Presence as /api/presence writes it.
        isOnline: true, lastSeenAt: new Date().toISOString(), dndMode: false, presence: { status: "online", updatedAt: new Date().toISOString() },
    });
    await setDoc(doc(db, "groups", "g1"), { name: "G1", ownerEmail: A, members: [A, B], admins: [] });
    await setDoc(doc(db, "groups", "g2"), { name: "G2", ownerEmail: C, members: [C], admins: [] });
});

let passed = 0, failed = 0;
async function check(name, promise) {
    try { await promise; passed += 1; console.log(`  ✓ ${name}`); }
    catch (error) { failed += 1; console.log(`  ✗ ${name}\n      ${String(error?.message || error).split("\n")[0]}`); }
}

console.log("users/");
await check("presence is server-only (users)", assertFails(setDoc(doc(as(A), "users", A), { isOnline: true, lastSeenAt: new Date().toISOString() }, { merge: true })));
await check("status preference is server-only", assertFails(updateDoc(doc(as(A), "users", A), { statusPreference: "invisible" })));
await check("owner reads their own user doc", assertSucceeds(getDoc(doc(as(A), "users", A))));
// Account Settings saves through /api/account/profile (moderation, unique nickname#tag).
await check("profile fields are written through the API only", assertFails(setDoc(doc(as(A), "users", A), { email: A, username: "Alice", bio: "hi", avatarUrl: "https://example.com/a.png", accentColor: "#10b981", nicknameTag: "1234", typingIndicator: true, whoCanAdd: "everyone" }, { merge: true })));
await check("owner cannot self-grant friends", assertFails(setDoc(doc(as(C), "users", C), { friends: [A] }, { merge: true })));
await check("owner cannot edit blockedUsers", assertFails(updateDoc(doc(as(A), "users", A), { blockedUsers: [C] })));
await check("owner cannot set role", assertFails(updateDoc(doc(as(A), "users", A), { role: "admin" })));
await check("owner cannot unsuspend", assertFails(updateDoc(doc(as(A), "users", A), { suspended: false })));
await check("javascript: avatar rejected", assertFails(updateDoc(doc(as(A), "users", A), { avatarUrl: "javascript:alert(1)" })));
await check("cannot read someone else's user doc", assertFails(getDoc(doc(as(C), "users", A))));
await check("cannot write another user's doc", assertFails(setDoc(doc(as(C), "users", A), { bio: "x" }, { merge: true })));
await check("users doc cannot be created by a client", assertFails(setDoc(doc(as(D), "users", D), { email: D, username: "dave" })));
await check("deleted account's presence heartbeat cannot recreate users doc", assertFails(setDoc(doc(as(D), "users", D), { isOnline: true, lastSeenAt: new Date().toISOString() }, { merge: true })));

console.log("public_profiles/");
await check("a profile is read by its address", assertSucceeds(getDoc(doc(as(B), "public_profiles", A))));
await check("a missing profile reads as missing", assertSucceeds(getDoc(doc(as(B), "public_profiles", D))));
await check("profiles can't be listed (every member's address)", assertFails(getDocs(collection(as(B), "public_profiles"))));
await check("profiles can't be searched", assertFails(getDocs(query(collection(as(B), "public_profiles"), where("nicknameTag", "==", "1234")))));
await check("signed-out visitors can't read profiles", assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "public_profiles", A))));
await check("own public profile is written through the API only", assertFails(setDoc(doc(as(A), "public_profiles", A), { customStatus: "coding", email: A }, { merge: true })));
// A copied nickname#tag would catch friend requests meant for someone else.
await check("nickname and tag can't be set from the browser", assertFails(updateDoc(doc(as(C), "public_profiles", A), { nickname: "alice", nicknameTag: "1234" })));
await check("presence is server-only (public profile)", assertFails(setDoc(doc(as(A), "public_profiles", A), { isOnline: false, email: A }, { merge: true })));
await check("status can't be set from the browser", assertFails(setDoc(doc(as(A), "public_profiles", A), { presence: { status: "dnd", updatedAt: new Date().toISOString() }, email: A }, { merge: true })));
await check("Do Not Disturb can't be set from the browser", assertFails(setDoc(doc(as(A), "public_profiles", A), { dndMode: true, email: A }, { merge: true })));
await check("last-seen time can't be removed from the browser", assertFails(setDoc(doc(as(A), "public_profiles", A), { email: A, lastSeenAt: deleteField() }, { merge: true })));
await check("owner cannot grant badges", assertFails(setDoc(doc(as(A), "public_profiles", A), { badges: ["verified", "developer"] }, { merge: true })));
await check("owner cannot raise or extend their plan badge", assertFails(updateDoc(doc(as(A), "public_profiles", A), { planBadge: { plan: "pro", until: null } })));
await check("owner cannot give themselves a plan badge", assertFails(setDoc(doc(as(B), "public_profiles", B), { email: B, username: "bob", planBadge: { plan: "pro", until: null } })));
await check("CSS injection accent rejected", assertFails(updateDoc(doc(as(A), "public_profiles", A), { accentColor: "red;background:url(//x)" })));
await check("banner must be https", assertFails(updateDoc(doc(as(A), "public_profiles", A), { bannerUrl: "http://x.com/a.png" })));
await check("even a valid banner goes through the API", assertFails(updateDoc(doc(as(A), "public_profiles", A), { bannerUrl: "https://x.com/a.png" })));
await check("tag must be 4 digits", assertFails(updateDoc(doc(as(A), "public_profiles", A), { nicknameTag: "0001x" })));
await check("a profile can't be created from the browser", assertFails(setDoc(doc(as(C), "public_profiles", C), { email: C, username: "carol", nicknameTag: "4321" })));
await check("a profile can't be deleted from the browser", assertFails(deleteDoc(doc(as(A), "public_profiles", A))));
await check("new profile can't carry presence", assertFails(setDoc(doc(as(B), "public_profiles", B), { email: B, username: "bob", isOnline: true })));
await check("profile cannot be created without a users doc", assertFails(setDoc(doc(as(D), "public_profiles", D), { email: D, username: "dave" }, { merge: true })));

console.log("friendRequests/");
await env.withSecurityRulesDisabled(async (ctx) => {
    // As POST /api/friends writes it.
    await setDoc(doc(ctx.firestore(), "friendRequests", `${C}_${A}_1`), { fromEmail: C, toEmail: A, status: "pending", createdAt: new Date() });
});
await check("the recipient watches incoming requests", assertSucceeds(getDocs(query(collection(as(A), "friendRequests"), where("toEmail", "==", A), where("status", "==", "pending")))));
await check("the sender watches outgoing requests", assertSucceeds(getDocs(query(collection(as(C), "friendRequests"), where("fromEmail", "==", C), where("status", "==", "pending")))));
await check("others can't read them", assertFails(getDoc(doc(as(B), "friendRequests", `${C}_${A}_1`))));
// /api/friends checks blocks, "who can add me" and the limits.
await check("a request can't be sent from the browser", assertFails(setDoc(doc(as(C), "friendRequests", `${C}_${B}_2`), { fromEmail: C, toEmail: B, status: "pending", createdAt: serverTimestamp() })));
await check("a request can't be accepted from the browser", assertFails(updateDoc(doc(as(A), "friendRequests", `${C}_${A}_1`), { status: "accepted" })));

console.log("chats/");
// Direct messages are written by /api/social/dm and /api/social/voice (friendship, blocks, limits).
await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "chats", chatId), { participants: [A, B].sort(), updatedAt: new Date(), lastMessage: "hi", lastSender: A });
    await setDoc(doc(ctx.firestore(), "chats", chatId, "messages", "m1"), { fromEmail: A, text: "hello", type: "text", createdAt: new Date(), read: false });
});
await check("participants read the chat", assertSucceeds(getDoc(doc(as(B), "chats", chatId))));
await check("participants read its messages", assertSucceeds(getDocs(collection(as(B), "chats", chatId, "messages"))));
await check("others can't read the chat", assertFails(getDoc(doc(as(C), "chats", chatId))));
await check("others can't read its messages", assertFails(getDocs(collection(as(C), "chats", chatId, "messages"))));
await check("a chat can't be opened from the browser", assertFails(setDoc(doc(as(A), "chats", [A, C].sort().join("_")), { participants: [A, C].sort(), updatedAt: serverTimestamp() })));
await check("typing can't be written from the browser", assertFails(updateDoc(doc(as(A), "chats", chatId), { typingUser: A, updatedAt: serverTimestamp() })));
await check("a message can't be sent from the browser", assertFails(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: A, text: "hello", type: "text", createdAt: serverTimestamp(), read: false })));
await check("read receipts can't be written from the browser", assertFails(updateDoc(doc(as(B), "chats", chatId, "messages", "m1"), { read: true })));
await check("an edit can't be written from the browser", assertFails(updateDoc(doc(as(A), "chats", chatId, "messages", "m1"), { text: "edited", edited: true })));
await check("a message can't be deleted from the browser", assertFails(deleteDoc(doc(as(A), "chats", chatId, "messages", "m1"))));

console.log("groups/");
// Group messages are written by /api/groups/chat (mutes, AutoMod, slow mode, the bots).
await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "groups", "g1", "messages", "m1"), { fromEmail: B, author: "bob", type: "text", text: "yo", createdAt: new Date() });
});
await check("members read the messages", assertSucceeds(getDocs(collection(as(B), "groups", "g1", "messages"))));
await check("a member can't post from the browser", assertFails(addDoc(collection(as(B), "groups", "g1", "messages"), { fromEmail: B, author: "bob", type: "text", text: "yo", createdAt: serverTimestamp() })));
await check("a member can't delete from the browser", assertFails(deleteDoc(doc(as(B), "groups", "g1", "messages", "m1"))));
await check("non-member cannot read group", assertFails(getDoc(doc(as(C), "groups", "g1"))));
// Accepting a group's rules goes through POST /api/groups (accept-rules): the browser can't mark itself.
await check("a member can't mark the group's rules accepted from the browser", assertFails(updateDoc(doc(as(B), "groups", "g1"), { "rulesAccepted.k0123456789abcdef0123": 99 })));
await check("non-member cannot read its messages", assertFails(getDocs(collection(as(C), "groups", "g1", "messages"))));

console.log("group_voice/");
await env.withSecurityRulesDisabled(async (ctx) => {
    // As the voice channel routes write them (lib/server/group-voice.ts).
    await setDoc(doc(ctx.firestore(), "group_voice", "g1"), { participants: { t1: { email: A, joinedAt: 1 } }, updatedAt: new Date() });
    await setDoc(doc(ctx.firestore(), "group_voice", "g1", "signals", "s1"), { toEmail: B, fromEmail: A, kind: "offer", expiresAt: new Date(Date.now() + 60_000) });
});
await check("members follow the voice channel", assertSucceeds(getDoc(doc(as(B), "group_voice", "g1"))));
await check("non-members can't see who is in it", assertFails(getDoc(doc(as(C), "group_voice", "g1"))));
await check("nobody joins from the browser", assertFails(setDoc(doc(as(A), "group_voice", "g1"), { participants: {} })));
await check("a signal is read by the person it is for", assertSucceeds(getDocs(query(collection(as(B), "group_voice", "g1", "signals"), where("toEmail", "==", B)))));
await check("nobody else reads it", assertFails(getDoc(doc(as(A), "group_voice", "g1", "signals", "s1"))));
await check("signals aren't sent from the browser", assertFails(setDoc(doc(as(A), "group_voice", "g1", "signals", "s2"), { toEmail: B, fromEmail: A })));

console.log("calls/");
// /api/calls writes calls with the service account; browsers with the Firebase bridge only listen.
const callId = "0b9a7c1e-3f2d-4a8b-9c6d-5e4f3a2b1c0d";
await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "calls", callId), { caller: A, callee: B, participants: [A, B], status: "ringing", offer: { type: "offer", sdp: "v=0\r\n" }, callerCandidates: [], calleeCandidates: [], createdAt: new Date() });
});
await check("incoming-call listener (participants contains me) is allowed", assertSucceeds(getDocs(query(collection(as(B), "calls"), where("participants", "array-contains", B)))));
await check("callee/status query is refused (rules are not filters)", assertFails(getDocs(query(collection(as(B), "calls"), where("callee", "==", B), where("status", "==", "ringing")))));
await check("participants can follow the call", assertSucceeds(getDoc(doc(as(A), "calls", callId))));
await check("others can't read a call", assertFails(getDoc(doc(as(C), "calls", callId))));
await check("others can't list someone's calls", assertFails(getDocs(query(collection(as(C), "calls"), where("participants", "array-contains", B)))));
await check("a non-friend can't start a call from the browser", assertFails(setDoc(doc(as(C), "calls", "1b9a7c1e-3f2d-4a8b-9c6d-5e4f3a2b1c0d"), { caller: C, callee: A, participants: [C, A], status: "ringing" })));

console.log("projects/");
await env.withSecurityRulesDisabled(async (ctx) => {
    // As POST /api/projects creates it (after checking the plan's project limit).
    await setDoc(doc(ctx.firestore(), "projects", "p1"), { id: "p1", name: "Alice's", email: A, schemaVersion: 2, fileCount: 0 });
});
await check("a browser can't create a project (the server applies the plan limit)", assertFails(setDoc(doc(as(A), "projects", "new1"), { id: "new1", name: "x", email: A })));
await check("owner saves an existing project", assertSucceeds(setDoc(doc(as(A), "projects", "p1"), { id: "p1", name: "Alice's v2", email: A, fileCount: 1, updatedAt: serverTimestamp() }, { merge: true })));
await check("owner writes the project's files", assertSucceeds(setDoc(doc(as(A), "projects", "p1", "files", "000-main.js"), { name: "main.js", lang: "javascript", code: "console.log(1)", order: 0, updatedAt: serverTimestamp() })));
await check("someone else can't change it", assertFails(setDoc(doc(as(B), "projects", "p1"), { name: "mine", email: B }, { merge: true })));
await check("owner can't hand it to someone else", assertFails(updateDoc(doc(as(A), "projects", "p1"), { email: B })));

console.log("server-only collections/");
await check("hiding the plan badge goes through the server only", assertFails(setDoc(doc(as(A), "subscriptions", A), { planBadgeHidden: true }, { merge: true })));
await check("API keys can't be made from the browser", assertFails(setDoc(doc(as(A), "ai_api_key_index", "f".repeat(64)), { email: A, id: "key_0000000000000000" })));
for (const path of ["credentials/" + A, "security_rate_limits/x", "media_posts/x", "arcade_games/x", "arcade_scores/x", "arcade_achievements/x", "admin_audit_log/x", "site_announcements/x", "group_invite_links/x", "friendRequests_x/y", "feedback/x", "support_tickets/x", "subscriptions/" + A, "paddle_customers/ctm_x", "paddle_unlinked/sub_x", "paddle_cleanup/sub_x", "site_config/paddle", "site_config/features", "ai_connections/" + A, "ai_api_keys/" + A, "ai_api_key_index/0123abcd", "voice_clips/x", "group_bans/x", "group_mutes/x", "group_warnings/x", "group_reports/x", "group_automod/x", "automod_events/x", "message_stars/x", "message_files/x", "message_file_usage/" + A, "ai_usage_daily/2026-10-06", "site_config/announcement_slots"]) {
    const [collectionName, id] = path.split("/");
    await check(`${collectionName} is closed`, assertFails(getDoc(doc(as(A), collectionName, id))));
}
await check("a file's parts are closed", assertFails(getDoc(doc(as(A), "message_files", "x", "parts", "0"))));

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
