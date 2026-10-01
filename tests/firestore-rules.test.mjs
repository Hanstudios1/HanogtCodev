// Run: npm run test:rules  (starts the Firestore emulator; needs Java 17+)
// Firestore rules regression tests for Hanogt Codev (run inside the emulator).
import fs from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, deleteField } from "firebase/firestore";

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
    await setDoc(doc(db, "public_profiles", A), { email: A, username: "alice", badges: ["verified"], nicknameTag: "1234" });
    await setDoc(doc(db, "groups", "g1"), { name: "G1", ownerEmail: A, members: [A, B], admins: [] });
    await setDoc(doc(db, "groups", "g2"), { name: "G2", ownerEmail: C, members: [C], admins: [] });
});

let passed = 0, failed = 0;
async function check(name, promise) {
    try { await promise; passed += 1; console.log(`  ✓ ${name}`); }
    catch (error) { failed += 1; console.log(`  ✗ ${name}\n      ${String(error?.message || error).split("\n")[0]}`); }
}

console.log("users/");
await check("owner can write presence", assertSucceeds(setDoc(doc(as(A), "users", A), { isOnline: true, lastSeenAt: new Date().toISOString() }, { merge: true })));
await check("owner can edit profile fields (account settings)", assertSucceeds(setDoc(doc(as(A), "users", A), { email: A, username: "Alice", bio: "hi", avatarUrl: "https://example.com/a.png", accentColor: "#10b981", nicknameTag: "1234", typingIndicator: true, whoCanAdd: "everyone" }, { merge: true })));
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
await check("owner can update presence despite server badges", assertSucceeds(setDoc(doc(as(A), "public_profiles", A), { isOnline: true, email: A }, { merge: true })));
await check("owner cannot grant badges", assertFails(setDoc(doc(as(A), "public_profiles", A), { badges: ["verified", "developer"] }, { merge: true })));
await check("CSS injection accent rejected", assertFails(updateDoc(doc(as(A), "public_profiles", A), { accentColor: "red;background:url(//x)" })));
await check("banner must be https", assertFails(updateDoc(doc(as(A), "public_profiles", A), { bannerUrl: "http://x.com/a.png" })));
await check("valid banner accepted", assertSucceeds(updateDoc(doc(as(A), "public_profiles", A), { bannerUrl: "https://x.com/a.png" })));
await check("tag must be 4 digits", assertFails(updateDoc(doc(as(A), "public_profiles", A), { nicknameTag: "0001x" })));
await check("new profile create by owner", assertSucceeds(setDoc(doc(as(C), "public_profiles", C), { email: C, username: "carol", nicknameTag: "4321", isOnline: true })));
await check("profile cannot be created without a users doc", assertFails(setDoc(doc(as(D), "public_profiles", D), { email: D, isOnline: true, lastSeenAt: new Date().toISOString() }, { merge: true })));
await check("owner can hide presence (offline, last seen removed)", assertSucceeds(setDoc(doc(as(A), "public_profiles", A), { email: A, isOnline: false, lastSeenAt: deleteField() }, { merge: true })));

console.log("chats/");
await check("friend can open chat", assertSucceeds(setDoc(doc(as(A), "chats", chatId), { participants: [A, B].sort(), updatedAt: serverTimestamp() }, { merge: true })));
await check("non-friend cannot open chat", assertFails(setDoc(doc(as(C), "chats", [A, C].sort().join("_")), { participants: [A, C].sort(), updatedAt: serverTimestamp() })));
await check("sender updates lastMessage + lastSender", assertSucceeds(setDoc(doc(as(A), "chats", chatId), { participants: [A, B].sort(), lastMessage: "hi", lastMessageAt: serverTimestamp(), lastSender: A }, { merge: true })));
await check("cannot spoof lastSender", assertFails(setDoc(doc(as(A), "chats", chatId), { participants: [A, B].sort(), lastSender: B }, { merge: true })));
await check("text message", assertSucceeds(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: A, text: "hello", type: "text", createdAt: serverTimestamp(), read: false })));
await check("reply message", assertSucceeds(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: A, text: "re", type: "text", createdAt: serverTimestamp(), read: false, replyTo: { id: "x", text: "hello", fromEmail: B } })));
await check("voice message in own chat folder", assertSucceeds(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: A, text: "", type: "voice", voicePath: `voice-messages/${chatId}/abc.webm`, voiceDuration: 3, createdAt: serverTimestamp(), read: false })));
await check("voice path outside chat rejected", assertFails(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: A, text: "", type: "voice", voicePath: "group-voice-messages/g2/victim.webm", createdAt: serverTimestamp(), read: false })));
await check("extra fields rejected", assertFails(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: A, text: "x", type: "text", createdAt: serverTimestamp(), read: false, admin: true })));
await check("pre-read message rejected", assertFails(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: A, text: "x", type: "text", createdAt: serverTimestamp(), read: true })));
await check("spoofed sender rejected", assertFails(addDoc(collection(as(A), "chats", chatId, "messages"), { fromEmail: B, text: "x", type: "text", createdAt: serverTimestamp(), read: false })));

console.log("groups/");
await check("member posts text", assertSucceeds(addDoc(collection(as(B), "groups", "g1", "messages"), { fromEmail: B, author: "bob", type: "text", text: "yo", createdAt: serverTimestamp() })));
await check("member posts voice in own group folder", assertSucceeds(addDoc(collection(as(B), "groups", "g1", "messages"), { fromEmail: B, author: "bob", type: "voice", text: "", voicePath: "group-voice-messages/g1/v.webm", voiceDuration: 2, createdAt: serverTimestamp() })));
await check("voice path of another group rejected", assertFails(addDoc(collection(as(B), "groups", "g1", "messages"), { fromEmail: B, author: "bob", type: "voice", text: "", voicePath: "group-voice-messages/g2/v.webm", createdAt: serverTimestamp() })));
await check("non-member cannot read group", assertFails(getDoc(doc(as(C), "groups", "g1"))));

console.log("server-only collections/");
for (const path of ["credentials/" + A, "security_rate_limits/x", "media_posts/x", "arcade_games/x", "admin_audit_log/x", "site_announcements/x", "group_invite_links/x", "friendRequests_x/y", "feedback/x", "support_tickets/x"]) {
    const [collectionName, id] = path.split("/");
    await check(`${collectionName} is closed`, assertFails(getDoc(doc(as(A), collectionName, id))));
}

await env.cleanup();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
