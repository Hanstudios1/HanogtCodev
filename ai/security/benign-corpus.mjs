// Benign corpus for the Hanogt Security Bot guard (src/lib/security/signatures.ts).
//
// These are ordinary programs people legitimately write and share on Hanogt
// Codev. Each one deliberately resembles something the guard watches for —
// deleting files, spawning a process, fetching a URL, decoding base64, crypto —
// but is harmless. The guard MUST allow every sample here; a block is a false
// positive that would stop a real user from running or sharing their project.
//
// Fields: id, lang, near (which signature it sits close to), code.
// Consumed by scripts/eval-security.mjs together with the recall fixtures.

export const BENIGN_CORPUS = [
    // --- cleanup of a *specific* directory (guard only blocks the root / a drive root)
    { id: "rm-node-modules", lang: "shell", near: "destructive-root-delete", code: String.raw`rm -rf ./node_modules && npm install` },
    { id: "rm-build-dir", lang: "shell", near: "destructive-root-delete", code: String.raw`rm -rf build/ dist/ .cache/` },
    { id: "rm-rf-relative", lang: "shell", near: "destructive-root-delete", code: String.raw`rm -rf "$PROJECT_DIR/tmp"` },
    { id: "py-rmtree-temp", lang: "python", near: "destructive-root-delete", code: String.raw`import shutil, tempfile, os
work = tempfile.mkdtemp()
# ... use the folder ...
shutil.rmtree(work)` },
    { id: "node-rmsync-dist", lang: "javascript", near: "destructive-root-delete", code: String.raw`const fs = require("fs");
const path = require("path");
fs.rmSync(path.join(__dirname, "dist"), { recursive: true, force: true });` },
    { id: "cs-delete-temp", lang: "csharp", near: "destructive-root-delete", code: String.raw`using System.IO;
var temp = Path.Combine(Path.GetTempPath(), "report");
Directory.Delete(temp, true);` },
    { id: "del-local-logs", lang: "batch", near: "destructive-root-delete", code: String.raw`del /q logs\*.log` },

    // --- dd / disk-shaped commands that target files, not raw devices
    { id: "dd-create-file", lang: "shell", near: "disk-wipe", code: String.raw`dd if=/dev/zero of=./diskimage.img bs=1M count=100` },
    { id: "dd-backup", lang: "shell", near: "disk-wipe", code: String.raw`dd if=./input.iso of=./backup.iso bs=4M` },

    // --- legitimate recursion / loops that are not fork bombs
    { id: "recursive-fib", lang: "python", near: "fork-bomb", code: String.raw`def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)
print(fib(20))` },
    { id: "worker-pool", lang: "python", near: "fork-bomb", code: String.raw`from multiprocessing import Pool
with Pool(4) as pool:
    print(pool.map(str, range(10)))` },
    { id: "game-loop", lang: "javascript", near: "fork-bomb", code: String.raw`function loop() {
  update();
  requestAnimationFrame(loop);
}
loop();` },
    { id: "fork-once", lang: "c", near: "fork-bomb", code: String.raw`#include <unistd.h>
int main() {
    pid_t pid = fork();
    if (pid == 0) return 0;  // child does its one job
    return 0;
}` },

    // --- subprocess + network, each for a legitimate reason
    { id: "subprocess-ls", lang: "python", near: "network-process-chain", code: String.raw`import subprocess
result = subprocess.run(["ls", "-la"], capture_output=True, text=True)
print(result.stdout)` },
    { id: "fetch-weather", lang: "python", near: "network-process-chain", code: String.raw`import requests
data = requests.get("https://api.example.com/weather?city=Ankara", timeout=10).json()
print(data["temp"])` },
    { id: "download-then-convert", lang: "python", near: "network-process-chain", code: String.raw`import requests, subprocess
# download a sample video, then re-encode it with ffmpeg
open("in.mp4", "wb").write(requests.get("https://cdn.example.com/sample.mp4").content)
subprocess.run(["ffmpeg", "-i", "in.mp4", "out.webm"])` },
    { id: "git-clone", lang: "shell", near: "network-process-chain", code: String.raw`git clone https://github.com/example/repo.git && cd repo && make` },

    // --- curl / wget piped to a *data* tool, not a shell
    { id: "curl-jq", lang: "shell", near: "download-and-execute", code: String.raw`curl -s https://api.example.com/users | jq '.[].name'` },
    { id: "curl-to-file", lang: "shell", near: "download-and-execute", code: String.raw`curl -L https://example.com/data.csv -o data.csv` },
    { id: "wget-grep", lang: "shell", near: "download-and-execute", code: String.raw`wget -qO- https://example.com/log.txt | grep ERROR` },

    // --- base64 / decoding for data, without any dynamic execution
    { id: "atob-image", lang: "javascript", near: "encoded-execution", code: String.raw`const bytes = atob(dataUrl.split(",")[1]);
const buffer = Uint8Array.from(bytes, (c) => c.charCodeAt(0));
blob = new Blob([buffer], { type: "image/png" });` },
    { id: "b64decode-json", lang: "python", near: "encoded-execution", code: String.raw`import base64, json
payload = json.loads(base64.b64decode(token).decode("utf-8"))
print(payload["sub"])` },
    { id: "eval-math", lang: "python", near: "encoded-execution", code: String.raw`# a tiny calculator using ast, not exec
import ast, operator
def calc(expr):
    return eval(compile(ast.parse(expr, mode="eval"), "<calc>", "eval"))` },

    // --- crypto / hashing for legitimate purposes
    { id: "sha256-file", lang: "python", near: "cryptomining-protocol", code: String.raw`import hashlib
with open("file.bin", "rb") as f:
    print(hashlib.sha256(f.read()).hexdigest())` },
    { id: "wallet-tutorial", lang: "javascript", near: "cryptomining-protocol", code: String.raw`// Demo: show a crypto wallet balance from a public read-only API
const res = await fetch("https://api.example.com/balance/" + address);
document.getElementById("balance").textContent = (await res.json()).amount;` },

    // --- strings that merely *mention* sensitive paths/words
    { id: "ssh-config-doc", lang: "python", near: "credential-harvesting", code: String.raw`# This script reads your own ~/.ssh/config to list configured hosts.
import os
path = os.path.expanduser("~/.ssh/config")
print(open(path).read() if os.path.exists(path) else "no config")` },
    { id: "keyboard-game", lang: "python", near: "keylogger", code: String.raw`# Arrow-key control for a console game (no logging, no network)
import keyboard
while True:
    if keyboard.is_pressed("left"):
        move(-1)` },
    { id: "docker-compose-doc", lang: "yaml", near: "container-control-socket", code: String.raw`services:
  web:
    image: nginx
    ports:
      - "8080:80"` },
    { id: "metadata-string", lang: "javascript", near: "cloud-metadata-credential-access", code: String.raw`// Note: 169.254.169.254 is the cloud metadata IP; we block it in our firewall.
const BLOCKED = ["169.254.169.254"];` },

    // --- admin/windows commands that resemble defense-evasion but are routine
    { id: "clear-screen", lang: "shell", near: "defense-evasion", code: String.raw`clear; echo "starting build"` },
    { id: "view-eventlog", lang: "powershell", near: "defense-evasion", code: String.raw`Get-EventLog -LogName Application -Newest 20` },

    // --- plain application code, no resemblance at all (control group)
    { id: "hello-py", lang: "python", near: "none", code: String.raw`print("Merhaba Hanogt Codev!")` },
    { id: "sort-js", lang: "javascript", near: "none", code: String.raw`const nums = [5, 2, 9, 1];
console.log(nums.sort((a, b) => a - b));` },
    { id: "class-cs", lang: "csharp", near: "none", code: String.raw`public record Point(int X, int Y);
Console.WriteLine(new Point(3, 4));` },
];
