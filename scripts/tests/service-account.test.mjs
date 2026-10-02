// Reading the Firebase service account from the environment: every common way
// of pasting it works, and wrong pastes get a short, precise reason that fits
// on the sign-in page. Run: node --test scripts/tests/
import assert from "node:assert/strict";
import { createPrivateKey, createSign, generateKeyPairSync } from "node:crypto";
import test from "node:test";
import { load } from "./setup.mjs";

const { credentialSources, normalizePrivateKey, projectFromServiceEmail, resolveServiceAccount, CREDENTIAL_VARIABLES } = await load("lib/server/service-account.ts");
const firebaseRest = await load("lib/server/firebase-rest.ts");
const { authRequestContext, recordAuthError } = await load("lib/server/auth-diagnostics.ts");

const PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const EMAIL = "firebase-adminsdk-ab12c@hanogt-codev.iam.gserviceaccount.com";
const KEY_FILE = {
    type: "service_account",
    project_id: "hanogt-codev",
    private_key_id: "0123456789abcdef",
    private_key: PEM,
    client_email: EMAIL,
    client_id: "123456789012345678901",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
};
const JSON_TEXT = JSON.stringify(KEY_FILE, null, 2);

/** The key still signs what Google's token endpoint verifies. */
function signs(pem) {
    const signer = createSign("RSA-SHA256");
    signer.update("hanogt");
    return signer.sign(pem).length === 256;
}

function resolved(env) {
    const result = resolveServiceAccount(env);
    assert.ok(result.account, `no account: ${JSON.stringify(result.tried)}`);
    assert.equal(result.account.client_email, EMAIL);
    assert.equal(result.account.project_id, "hanogt-codev");
    assert.ok(signs(result.account.private_key));
    return result;
}

function failure(env) {
    const result = resolveServiceAccount(env);
    assert.equal(result.account, null);
    return result.tried[0].error;
}

test("the downloaded JSON works however it was pasted", () => {
    const shapes = {
        "as downloaded": JSON_TEXT,
        "on one line": JSON.stringify(KEY_FILE),
        "in single quotes": `'${JSON_TEXT}'`,
        "encoded twice": JSON.stringify(JSON.stringify(KEY_FILE)),
        "with escaped quotes": JSON.stringify(JSON.stringify(KEY_FILE)).slice(1, -1),
        "as a .env line": `FIREBASE_SERVICE_ACCOUNT_JSON=${JSON.stringify(KEY_FILE)}`,
        "base64 in the JSON variable": Buffer.from(JSON_TEXT).toString("base64"),
        "with camelCase names": JSON.stringify({ projectId: "hanogt-codev", clientEmail: EMAIL, privateKey: PEM }),
        "nested one level": JSON.stringify({ serviceAccount: KEY_FILE }),
        "nested as a JSON string": JSON.stringify({ credentials: JSON.stringify(KEY_FILE) }),
    };
    for (const [name, value] of Object.entries(shapes)) {
        const result = resolved({ FIREBASE_SERVICE_ACCOUNT_JSON: value });
        assert.equal(result.source.variable, "FIREBASE_SERVICE_ACCOUNT_JSON", name);
    }
});

test("base64 and the other common variable names are read", () => {
    const base64 = Buffer.from(JSON_TEXT).toString("base64");
    assert.equal(resolved({ FIREBASE_SERVICE_ACCOUNT_BASE64: base64 }).source.layout, "base64");
    assert.equal(resolved({ FIREBASE_SERVICE_ACCOUNT_BASE64: JSON_TEXT }).source.variable, "FIREBASE_SERVICE_ACCOUNT_BASE64", "plain JSON in the base64 variable");
    assert.equal(resolved({ FIREBASE_SERVICE_ACCOUNT_BASE: base64.replace(/(.{76})/g, "$1\n") }).source.variable, "FIREBASE_SERVICE_ACCOUNT_BASE", "wrapped base64");
    for (const variable of ["FIREBASE_SERVICE_ACCOUNT", "FIREBASE_SERVICE_ACCOUNT_KEY", "GOOGLE_APPLICATION_CREDENTIALS_JSON", "GOOGLE_CREDENTIALS", "GOOGLE_APPLICATION_CREDENTIALS"]) {
        assert.equal(resolved({ [variable]: JSON_TEXT }).source.variable, variable);
    }
    // A file path in GOOGLE_APPLICATION_CREDENTIALS can't be read on Vercel and is not a source.
    assert.deepEqual(credentialSources({ GOOGLE_APPLICATION_CREDENTIALS: "/secrets/key.json" }), []);
    for (const name of ["FIREBASE_SERVICE_ACCOUNT_JSON", "FIREBASE_PRIVATE_KEY", "FIREBASE_ADMIN_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_PROJECT_ID"]) assert.ok(CREDENTIAL_VARIABLES.includes(name));
});

test("split variables, with the key pasted in every usual way", () => {
    const keys = {
        "real line breaks": PEM,
        "literal \\n": PEM.replace(/\n/g, "\\n"),
        "quoted literal \\n": `"${PEM.replace(/\n/g, "\\n")}"`,
        "spaces instead of line breaks": PEM.replace(/\n/g, " "),
        "Windows line ends": PEM.replace(/\n/g, "\r\n"),
        "no PEM header": PEM.replace(/-----[A-Z ]+-----/g, ""),
    };
    for (const [name, key] of Object.entries(keys)) {
        const result = resolved({ FIREBASE_PROJECT_ID: "hanogt-codev", FIREBASE_CLIENT_EMAIL: EMAIL, FIREBASE_PRIVATE_KEY: key });
        assert.equal(result.source.layout, "split", name);
    }
    // The project comes from the service-account e-mail when FIREBASE_PROJECT_ID is missing.
    resolved({ FIREBASE_CLIENT_EMAIL: EMAIL, FIREBASE_PRIVATE_KEY: PEM });
    resolved({ FIREBASE_ADMIN_CLIENT_EMAIL: EMAIL, FIREBASE_ADMIN_PRIVATE_KEY: PEM });
    // The whole JSON pasted into the private key variable.
    assert.equal(resolved({ FIREBASE_PRIVATE_KEY: JSON_TEXT }).source.variable, "FIREBASE_PRIVATE_KEY");
});

test("keys and projects are repaired, not guessed", () => {
    assert.equal(projectFromServiceEmail(EMAIL), "hanogt-codev");
    assert.equal(projectFromServiceEmail("someone@gmail.com"), "");
    assert.equal(normalizePrivateKey("not a key"), "");
    assert.equal(normalizePrivateKey("-----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY-----"), "", "too short to be a key");
    assert.equal(normalizePrivateKey(PEM.replace(/\n/g, "\\n")), PEM);
    createPrivateKey(normalizePrivateKey(PEM.replace(/\n/g, " ")));
    // A project id from the JSON wins over the e-mail; without either, FIREBASE_PROJECT_ID is used.
    const other = { ...KEY_FILE, client_email: "robot@example.com" };
    delete other.project_id;
    assert.equal(resolveServiceAccount({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(other), FIREBASE_PROJECT_ID: "from-env" }).account.project_id, "from-env");
    assert.match(failure({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(other) }), /project_id bulunamadı/);
});

test("wrong pastes say what they are, briefly enough for the sign-in page", () => {
    const cases = [
        [{ apiKey: "AIzaSyA1234567890abcdefghijklmnopqrstuv", authDomain: "hanogt-codev.firebaseapp.com", projectId: "hanogt-codev", appId: "1:1:web:1" }, /web uygulaması yapılandırması \(apiKey\)/],
        [{ project_info: { project_id: "hanogt-codev" }, client: [{ api_key: [] }] }, /google-services\.json/],
        [{ web: { client_id: "x.apps.googleusercontent.com", project_id: "hanogt-codev", client_secret: "secret" } }, /OAuth istemci dosyası/],
        [{ type: "authorized_user", client_id: "x", refresh_token: "y" }, /refresh_token/],
        [{ ...KEY_FILE, private_key: "" }, /eksik alan: private_key/],
        [{ type: "service_account", project_id: "hanogt-codev" }, /eksik alan: client_email, private_key/],
    ];
    for (const [value, reason] of cases) {
        const message = failure({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(value) });
        assert.match(message, /^FIREBASE_SERVICE_ACCOUNT_JSON: /);
        assert.match(message, reason);
        assert.ok(`SIGNIN_CALLBACK_ERROR: ${message}`.length <= 180, `fits the sign-in page: ${message}`);
        assert.equal(/AIza|secret|BEGIN/.test(message), false, "no secret values in the message");
    }
    assert.match(failure({ FIREBASE_SERVICE_ACCOUNT_JSON: "const firebaseConfig = { apiKey: 'x' };" }), /geçerli bir JSON değil/);
    assert.match(failure({ FIREBASE_SERVICE_ACCOUNT_JSON: "\"just text\"" }), /JSON nesnesi değil/);
    assert.match(failure({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ ...KEY_FILE, private_key: PEM.slice(0, 400) }) }), /private_key okunamadı/);
});

test("a broken variable doesn't hide a working one", () => {
    const env = {
        FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ apiKey: "AIzaSyA1234567890abcdefghijklmnopqrstuv", projectId: "hanogt-codev" }),
        FIREBASE_PROJECT_ID: "hanogt-codev",
        FIREBASE_CLIENT_EMAIL: EMAIL,
        FIREBASE_PRIVATE_KEY: PEM.replace(/\n/g, "\\n"),
    };
    const result = resolved(env);
    assert.equal(result.source.layout, "split");
    assert.equal(result.tried.length, 2);
    assert.match(result.tried[0].error, /web uygulaması/);
    assert.equal(result.tried[1].error, null);
    assert.equal(resolveServiceAccount({}).account, null);
});

test("firebase-rest uses the resolved account and describes it without secrets", () => {
    const names = CREDENTIAL_VARIABLES;
    const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    const set = (values) => {
        for (const name of names) delete process.env[name];
        Object.assign(process.env, values);
    };
    try {
        set({});
        assert.equal(firebaseRest.isFirebaseServerConfigured(), false);
        assert.throws(() => firebaseRest.getFirebaseProjectId(), /FIREBASE_SERVICE_ACCOUNT_JSON ekleyin/);

        set({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(JSON.stringify(KEY_FILE)) });
        assert.equal(firebaseRest.getFirebaseProjectId(), "hanogt-codev");
        const info = firebaseRest.describeServerCredentials();
        assert.deepEqual({ layout: info.layout, variable: info.variable, projectId: info.projectId, clientEmail: info.clientEmail, privateKeyValid: info.privateKeyValid, error: info.error }, {
            layout: "json", variable: "FIREBASE_SERVICE_ACCOUNT_JSON", projectId: "hanogt-codev", clientEmail: EMAIL, privateKeyValid: true, error: null,
        });

        set({ FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify({ apiKey: "AIzaSyA1234567890abcdefghijklmnopqrstuv" }), FIREBASE_SERVICE_ACCOUNT_BASE64: "bm90IGpzb24gYXQgYWxsIHRob3VnaCBpdCBpcyBsb25n" });
        assert.equal(firebaseRest.isFirebaseServerConfigured(), false);
        assert.throws(() => firebaseRest.getFirebaseProjectId(), /^Error: FIREBASE_SERVICE_ACCOUNT_JSON: web uygulaması/);
        const broken = firebaseRest.describeServerCredentials();
        assert.equal(broken.variable, "FIREBASE_SERVICE_ACCOUNT_JSON");
        assert.deepEqual(broken.ignored, ["FIREBASE_SERVICE_ACCOUNT_BASE64"]);
        assert.match(broken.error, /^web uygulaması/, "the variable isn't repeated");
        assert.equal(broken.privateKeyValid, false);
    } finally {
        set(Object.fromEntries(Object.entries(saved).filter(([, value]) => value !== undefined)));
    }
});

test("the sign-in page keeps variable names readable and hides one-time values", () => {
    const realError = console.error;
    console.error = () => {};
    try {
        const reasonFor = (message) => {
            const state = { reason: null };
            authRequestContext.run(state, () => recordAuthError("SIGNIN_CALLBACK_ERROR", new Error(message)));
            return state.reason;
        };
        assert.equal(reasonFor("FIREBASE_SERVICE_ACCOUNT_BASE64: geçerli bir JSON değil."), "SIGNIN_CALLBACK_ERROR: FIREBASE_SERVICE_ACCOUNT_BASE64: geçerli bir JSON değil.");
        assert.equal(reasonFor("state 0AY0e-g7abcdefghijklmnopqrstuv1234 mismatch"), "SIGNIN_CALLBACK_ERROR: state [redacted] mismatch");
        assert.equal(reasonFor("code JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP2 was used"), "SIGNIN_CALLBACK_ERROR: code [redacted] was used", "base32 secrets have no underscores");
    } finally {
        console.error = realError;
    }
});
