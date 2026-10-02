/**
 * Small complete programs that Hanogt AI Core can write offline and open in
 * the Code Editor ("Python ile hesap makinesi yaz ve editörde aç"). Loaded on
 * demand by local-engine.ts, so the chat bundle doesn't carry them.
 *
 * Every program runs as is in the Hanogt editor: console programs read the
 * **Input** tab (stdin) and stop at the end of it, HTML programs are single
 * files with inline CSS and JavaScript for the live preview. The code is kept
 * in String.raw literals so backslashes stay exactly as written.
 */
import type { Copy } from "@/lib/i18n";
import { Bm25Index } from "./nlp.mjs";

export type ProgramLanguage = "python" | "javascript" | "csharp" | "cpp" | "java" | "html";

export interface ProgramSnippet {
    id: string;
    title: Copy;
    /** Search words in Turkish, English and a few other languages. */
    keywords: string;
    /** File name without extension. */
    file: string;
    code: Partial<Record<ProgramLanguage, string>>;
    note?: Copy;
}

/** Registry id, file extension and display name of each program language. */
export const PROGRAM_LANGUAGES: Readonly<Record<ProgramLanguage, { id: string; extension: string; name: string }>> = {
    python: { id: "python", extension: "py", name: "Python" },
    javascript: { id: "javascript", extension: "js", name: "JavaScript" },
    csharp: { id: "csharp", extension: "cs", name: "C#" },
    cpp: { id: "cpp", extension: "cpp", name: "C++" },
    java: { id: "java", extension: "java", name: "Java" },
    html: { id: "html", extension: "html", name: "HTML" },
};

const INPUT_NOTE: Copy = { TR: "Girdileri editördeki **Girdi** sekmesine, her satıra bir tane yaz.", EN: "Type the inputs in the editor's **Input** tab, one per line." };
const PREVIEW_NOTE: Copy = { TR: "HTML dosyası editörde canlı önizlemeyle açılır; kodu değiştirdikçe sonucu görürsün.", EN: "The HTML file opens with a live preview in the editor; you see the result as you change the code." };

export const PROGRAM_SNIPPETS: ProgramSnippet[] = [
    {
        id: "calculator",
        title: { TR: "Hesap makinesi", EN: "Calculator" },
        keywords: "hesap makinesi hesapmakinesi calculator calc dört işlem toplama çıkarma çarpma bölme taschenrechner calculadora calculatrice калькулятор",
        file: "hesap_makinesi",
        note: INPUT_NOTE,
        code: {
            python: String.raw`# Hesap makinesi: "Girdi" sekmesine her satıra bir işlem yaz, ör. 12 * 3
def hesapla(a, op, b):
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op in ("*", "x"):
        return a * b
    if op == "/":
        if b == 0:
            raise ZeroDivisionError("sıfıra bölünemez")
        return a / b
    if op == "%":
        return a % b
    if op == "^":
        return a ** b
    raise ValueError("bilinmeyen işlem: " + op)


print("Hesap makinesi (ör. 7 + 5, çıkmak için q)")
while True:
    try:
        satir = input().strip()
    except EOFError:
        break
    if not satir:
        continue
    if satir.lower() == "q":
        break
    parcalar = satir.split()
    if len(parcalar) != 3:
        print(satir, "→ biçim: sayı işlem sayı")
        continue
    try:
        sonuc = hesapla(float(parcalar[0]), parcalar[1], float(parcalar[2]))
        print(f"{satir} = {sonuc:g}")
    except (ValueError, ZeroDivisionError) as hata:
        print(satir, "→ hata:", hata)
`,
            javascript: String.raw`// Hesap makinesi: "Girdi" sekmesine her satıra bir işlem yaz, ör. 12 * 3
const lines = require("fs").readFileSync(0, "utf8").split("\n");

function calculate(a, op, b) {
    switch (op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*":
        case "x": return a * b;
        case "/":
            if (b === 0) throw new Error("sıfıra bölünemez");
            return a / b;
        case "%": return a % b;
        case "^": return a ** b;
        default: throw new Error("bilinmeyen işlem: " + op);
    }
}

for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length !== 3) {
        console.log(line + " → biçim: sayı işlem sayı");
        continue;
    }
    try {
        console.log(line + " = " + calculate(Number(parts[0]), parts[1], Number(parts[2])));
    } catch (error) {
        console.log(line + " → hata: " + error.message);
    }
}
`,
            cpp: String.raw`// Hesap makinesi: "Girdi" sekmesine her satıra bir işlem yaz, ör. 12 * 3
#include <cmath>
#include <iostream>

int main() {
    double a, b;
    char op;
    while (std::cin >> a >> op >> b) {
        std::cout << a << ' ' << op << ' ' << b << " = ";
        switch (op) {
            case '+': std::cout << a + b; break;
            case '-': std::cout << a - b; break;
            case '*': case 'x': std::cout << a * b; break;
            case '/':
                if (b == 0) std::cout << "hata: sıfıra bölünemez";
                else std::cout << a / b;
                break;
            case '^': std::cout << std::pow(a, b); break;
            default: std::cout << "hata: bilinmeyen işlem";
        }
        std::cout << '\n';
    }
    return 0;
}
`,
            java: String.raw`// Hesap makinesi: "Girdi" sekmesine her satıra bir işlem yaz, ör. 12 * 3
import java.util.Scanner;

public class Main {
    static double calculate(double a, String op, double b) {
        switch (op) {
            case "+": return a + b;
            case "-": return a - b;
            case "*": case "x": return a * b;
            case "/":
                if (b == 0) throw new ArithmeticException("sıfıra bölünemez");
                return a / b;
            case "^": return Math.pow(a, b);
            default: throw new IllegalArgumentException("bilinmeyen işlem: " + op);
        }
    }

    public static void main(String[] args) {
        Scanner in = new Scanner(System.in);
        while (in.hasNextLine()) {
            String line = in.nextLine().trim();
            String[] parts = line.split("\\s+");
            if (parts.length != 3) continue;
            try {
                double result = calculate(Double.parseDouble(parts[0]), parts[1], Double.parseDouble(parts[2]));
                System.out.println(line + " = " + result);
            } catch (RuntimeException error) {
                System.out.println(line + " → hata: " + error.getMessage());
            }
        }
    }
}
`,
            csharp: String.raw`// Hesap makinesi: "Girdi" sekmesine her satıra bir işlem yaz, ör. 12 * 3
using System;
using System.Globalization;

class Program
{
    static double Calculate(double a, string op, double b) => op switch
    {
        "+" => a + b,
        "-" => a - b,
        "*" or "x" => a * b,
        "/" => b == 0 ? throw new DivideByZeroException("sıfıra bölünemez") : a / b,
        "^" => Math.Pow(a, b),
        _ => throw new ArgumentException("bilinmeyen işlem: " + op),
    };

    static void Main()
    {
        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length != 3) continue;
            try
            {
                double a = double.Parse(parts[0], CultureInfo.InvariantCulture);
                double b = double.Parse(parts[2], CultureInfo.InvariantCulture);
                Console.WriteLine($"{line.Trim()} = {Calculate(a, parts[1], b)}");
            }
            catch (Exception error)
            {
                Console.WriteLine($"{line.Trim()} → hata: {error.Message}");
            }
        }
    }
}
`,
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Hesap Makinesi</title>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #0f172a; }
  .calc { width: 260px; padding: 16px; border-radius: 20px; background: #1e293b; box-shadow: 0 20px 40px #0006; }
  .screen { height: 56px; margin-bottom: 12px; padding: 0 12px; border-radius: 12px; background: #0b1220; color: #e2e8f0; font-size: 28px; text-align: right; line-height: 56px; overflow: hidden; }
  .keys { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  button { height: 52px; border: 0; border-radius: 12px; background: #334155; color: #f8fafc; font-size: 18px; cursor: pointer; }
  button:hover { filter: brightness(1.15); }
  .op { background: #6366f1; }
  .eq { background: #10b981; grid-column: span 2; }
</style>
</head>
<body>
<div class="calc">
  <div class="screen" id="screen">0</div>
  <div class="keys" id="keys"></div>
</div>
<script>
  const keys = ["C", "(", ")", "/", "7", "8", "9", "*", "4", "5", "6", "-", "1", "2", "3", "+", "0", ".", "="];
  const screen = document.getElementById("screen");
  let expression = "";

  function show(value) {
    screen.textContent = value || "0";
  }

  function press(key) {
    if (key === "C") {
      expression = "";
    } else if (key === "=") {
      // Only digits, operators, dots and parentheses ever reach this point.
      try {
        const result = Function("return (" + expression + ")")();
        expression = Number.isFinite(result) ? String(Math.round(result * 1e10) / 1e10) : "";
        if (!Number.isFinite(result)) return show("Hata");
      } catch {
        expression = "";
        return show("Hata");
      }
    } else {
      expression += key;
    }
    show(expression);
  }

  for (const key of keys) {
    const button = document.createElement("button");
    button.textContent = key;
    if ("/*-+".includes(key)) button.className = "op";
    if (key === "=") button.className = "eq";
    button.addEventListener("click", () => press(key));
    document.getElementById("keys").append(button);
  }
  document.addEventListener("keydown", (event) => {
    if (keys.includes(event.key)) press(event.key);
    if (event.key === "Enter") press("=");
    if (event.key === "Escape") press("C");
  });
</script>
</body>
</html>
`,
        },
    },
    {
        id: "guess-number",
        title: { TR: "Sayı tahmin oyunu", EN: "Number guessing game" },
        keywords: "sayı tahmin oyunu tahmin et guess the number guessing game rastgele sayı bul adivina el número devine le nombre угадай число",
        file: "sayi_tahmin",
        note: INPUT_NOTE,
        code: {
            python: String.raw`# Sayı tahmin oyunu: tahminlerini "Girdi" sekmesine her satıra bir tane yaz
import random

gizli = random.randint(1, 100)
deneme = 0
print("1 ile 100 arasında bir sayı tuttum. Bul bakalım!")
while True:
    try:
        tahmin = int(input())
    except EOFError:
        print("Tahminler bitti. Sayı", gizli, "idi.")
        break
    except ValueError:
        print("Lütfen bir sayı yaz.")
        continue
    deneme += 1
    if tahmin < gizli:
        print(tahmin, "→ daha büyük")
    elif tahmin > gizli:
        print(tahmin, "→ daha küçük")
    else:
        print(f"Tebrikler! {deneme} denemede buldun.")
        break
`,
            javascript: String.raw`// Sayı tahmin oyunu: tahminlerini "Girdi" sekmesine her satıra bir tane yaz
const guesses = require("fs").readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
const secret = Math.floor(Math.random() * 100) + 1;
let tries = 0;
let found = false;

console.log("1 ile 100 arasında bir sayı tuttum. Bul bakalım!");
for (const text of guesses) {
    const guess = Number(text);
    if (!Number.isInteger(guess)) {
        console.log(text + " → lütfen bir sayı yaz");
        continue;
    }
    tries += 1;
    if (guess < secret) console.log(guess + " → daha büyük");
    else if (guess > secret) console.log(guess + " → daha küçük");
    else {
        console.log("Tebrikler! " + tries + " denemede buldun.");
        found = true;
        break;
    }
}
if (!found) console.log("Tahminler bitti. Sayı " + secret + " idi.");
`,
            cpp: String.raw`// Sayı tahmin oyunu: tahminlerini "Girdi" sekmesine her satıra bir tane yaz
#include <iostream>
#include <random>

int main() {
    std::mt19937 rng(std::random_device{}());
    int secret = std::uniform_int_distribution<int>(1, 100)(rng);
    int guess, tries = 0;
    std::cout << "1 ile 100 arasında bir sayı tuttum. Bul bakalım!\n";
    while (std::cin >> guess) {
        ++tries;
        if (guess < secret) std::cout << guess << " → daha büyük\n";
        else if (guess > secret) std::cout << guess << " → daha küçük\n";
        else {
            std::cout << "Tebrikler! " << tries << " denemede buldun.\n";
            return 0;
        }
    }
    std::cout << "Tahminler bitti. Sayı " << secret << " idi.\n";
    return 0;
}
`,
            java: String.raw`// Sayı tahmin oyunu: tahminlerini "Girdi" sekmesine her satıra bir tane yaz
import java.util.Random;
import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        int secret = new Random().nextInt(100) + 1;
        int tries = 0;
        Scanner in = new Scanner(System.in);
        System.out.println("1 ile 100 arasında bir sayı tuttum. Bul bakalım!");
        while (in.hasNextInt()) {
            int guess = in.nextInt();
            tries++;
            if (guess < secret) System.out.println(guess + " → daha büyük");
            else if (guess > secret) System.out.println(guess + " → daha küçük");
            else {
                System.out.println("Tebrikler! " + tries + " denemede buldun.");
                return;
            }
        }
        System.out.println("Tahminler bitti. Sayı " + secret + " idi.");
    }
}
`,
            csharp: String.raw`// Sayı tahmin oyunu: tahminlerini "Girdi" sekmesine her satıra bir tane yaz
using System;

class Program
{
    static void Main()
    {
        int secret = new Random().Next(1, 101);
        int tries = 0;
        Console.WriteLine("1 ile 100 arasında bir sayı tuttum. Bul bakalım!");
        string? line;
        while ((line = Console.ReadLine()) != null)
        {
            if (!int.TryParse(line.Trim(), out int guess)) continue;
            tries++;
            if (guess < secret) Console.WriteLine($"{guess} → daha büyük");
            else if (guess > secret) Console.WriteLine($"{guess} → daha küçük");
            else
            {
                Console.WriteLine($"Tebrikler! {tries} denemede buldun.");
                return;
            }
        }
        Console.WriteLine($"Tahminler bitti. Sayı {secret} idi.");
    }
}
`,
        },
    },
    {
        id: "todo",
        title: { TR: "Yapılacaklar listesi", EN: "To-do list" },
        keywords: "yapılacaklar listesi yapılacak todo todos todolist to-do app uygulama uygulaması görev listesi task tasks list görev takip notlar not defteri lista de tareas liste de tâches список дел",
        file: "yapilacaklar",
        code: {
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Yapılacaklar</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 420px; margin: 40px auto; padding: 0 16px; background: #f8fafc; color: #0f172a; }
  form { display: flex; gap: 8px; }
  input { flex: 1; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 10px; font-size: 15px; }
  button { padding: 10px 14px; border: 0; border-radius: 10px; background: #6366f1; color: white; cursor: pointer; }
  ul { list-style: none; padding: 0; }
  li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; margin-top: 8px; border-radius: 10px; background: white; box-shadow: 0 1px 3px #0001; }
  li.done span { text-decoration: line-through; color: #94a3b8; }
  li span { flex: 1; }
  li button { background: #ef4444; padding: 4px 10px; }
</style>
</head>
<body>
<h1>Yapılacaklar</h1>
<form id="form">
  <input id="text" placeholder="Yeni görev…" autocomplete="off">
  <button>Ekle</button>
</form>
<ul id="list"></ul>
<script>
  // Sandboxed previews have no localStorage: fall back to memory so the page still runs.
  const store = (() => {
    try {
      window.localStorage.getItem("test");
      return window.localStorage;
    } catch {
      const memory = {};
      return { getItem: (key) => (key in memory ? memory[key] : null), setItem: (key, value) => { memory[key] = String(value); } };
    }
  })();
  const KEY = "todo-items";
  let items = JSON.parse(store.getItem(KEY) || "[]");

  function save() {
    store.setItem(KEY, JSON.stringify(items));
  }

  function render() {
    const list = document.getElementById("list");
    list.innerHTML = "";
    items.forEach((item, index) => {
      const li = document.createElement("li");
      if (item.done) li.className = "done";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = item.done;
      box.addEventListener("change", () => { item.done = box.checked; save(); render(); });
      const text = document.createElement("span");
      text.textContent = item.text;
      const remove = document.createElement("button");
      remove.textContent = "Sil";
      remove.addEventListener("click", () => { items.splice(index, 1); save(); render(); });
      li.append(box, text, remove);
      list.append(li);
    });
  }

  document.getElementById("form").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.getElementById("text");
    const text = input.value.trim();
    if (!text) return;
    items.push({ text, done: false });
    input.value = "";
    save();
    render();
  });
  render();
</script>
</body>
</html>
`,
            python: String.raw`# Yapılacaklar listesi: "Girdi" sekmesine komutlar yaz
#   ekle Süt al      → görev ekler
#   bitti 1          → 1. görevi tamamlar
#   sil 2            → 2. görevi siler
#   liste            → görevleri gösterir
gorevler = []


def listele():
    if not gorevler:
        print("Liste boş.")
    for sira, (metin, bitti) in enumerate(gorevler, start=1):
        print(f"{sira}. [{'x' if bitti else ' '}] {metin}")


while True:
    try:
        komut = input().strip()
    except EOFError:
        break
    if komut.startswith("ekle "):
        gorevler.append((komut[5:].strip(), False))
        print("Eklendi:", komut[5:].strip())
    elif komut.startswith(("bitti ", "sil ")):
        ad, _, numara = komut.partition(" ")
        if not numara.isdigit() or not 1 <= int(numara) <= len(gorevler):
            print("Böyle bir görev yok:", numara)
            continue
        sira = int(numara) - 1
        if ad == "bitti":
            gorevler[sira] = (gorevler[sira][0], True)
            print("Tamamlandı:", gorevler[sira][0])
        else:
            print("Silindi:", gorevler.pop(sira)[0])
    elif komut == "liste":
        listele()
print("--- Son durum ---")
listele()
`,
        },
    },
    {
        id: "temperature",
        title: { TR: "Sıcaklık dönüştürücü", EN: "Temperature converter" },
        keywords: "sıcaklık dönüştürücü santigrat fahrenhayt celsius fahrenheit kelvin derece çevir temperature converter convert degrees conversor de temperatura",
        file: "sicaklik",
        note: INPUT_NOTE,
        code: {
            python: String.raw`# Sıcaklık dönüştürücü: "Girdi" sekmesine ör. "36.6 C" veya "100 F" yaz
def donustur(deger, birim):
    birim = birim.upper()
    if birim == "C":
        return f"{deger:g} °C = {deger * 9 / 5 + 32:.1f} °F = {deger + 273.15:.2f} K"
    if birim == "F":
        c = (deger - 32) * 5 / 9
        return f"{deger:g} °F = {c:.1f} °C = {c + 273.15:.2f} K"
    if birim == "K":
        c = deger - 273.15
        return f"{deger:g} K = {c:.2f} °C = {c * 9 / 5 + 32:.1f} °F"
    return "Birim C, F ya da K olmalı."


while True:
    try:
        satir = input().split()
    except EOFError:
        break
    if len(satir) != 2:
        continue
    try:
        print(donustur(float(satir[0].replace(",", ".")), satir[1]))
    except ValueError:
        print("Geçersiz sayı:", satir[0])
`,
            javascript: String.raw`// Sıcaklık dönüştürücü: "Girdi" sekmesine ör. "36.6 C" veya "100 F" yaz
const lines = require("fs").readFileSync(0, "utf8").split("\n");

function convert(value, unit) {
    const c = unit === "C" ? value : unit === "F" ? (value - 32) * 5 / 9 : unit === "K" ? value - 273.15 : NaN;
    if (Number.isNaN(c)) return "Birim C, F ya da K olmalı.";
    return value + " " + unit + " = " + c.toFixed(1) + " °C = " + (c * 9 / 5 + 32).toFixed(1) + " °F = " + (c + 273.15).toFixed(2) + " K";
}

for (const line of lines) {
    const [number, unit] = line.trim().split(/\s+/);
    if (!number || !unit) continue;
    const value = Number(number.replace(",", "."));
    console.log(Number.isFinite(value) ? convert(value, unit.toUpperCase()) : "Geçersiz sayı: " + number);
}
`,
        },
    },
    {
        id: "rock-paper-scissors",
        title: { TR: "Taş, kağıt, makas", EN: "Rock, paper, scissors" },
        keywords: "taş kağıt makas tas kagit makas rock paper scissors oyunu game piedra papel tijera schere stein papier камень ножницы бумага",
        file: "tas_kagit_makas",
        note: INPUT_NOTE,
        code: {
            python: String.raw`# Taş, kağıt, makas: "Girdi" sekmesine her satıra taş, kağıt ya da makas yaz
import random

SECENEKLER = ["taş", "kağıt", "makas"]
YENER = {"taş": "makas", "kağıt": "taş", "makas": "kağıt"}
skor = {"sen": 0, "bilgisayar": 0}

while True:
    try:
        secim = input().strip().lower()
    except EOFError:
        break
    if secim not in SECENEKLER:
        continue
    rakip = random.choice(SECENEKLER)
    if secim == rakip:
        sonuc = "berabere"
    elif YENER[secim] == rakip:
        sonuc = "kazandın"
        skor["sen"] += 1
    else:
        sonuc = "kaybettin"
        skor["bilgisayar"] += 1
    print(f"Sen: {secim}, bilgisayar: {rakip} → {sonuc}")

print(f"Skor: sen {skor['sen']} - {skor['bilgisayar']} bilgisayar")
`,
            javascript: String.raw`// Taş, kağıt, makas: "Girdi" sekmesine her satıra taş, kağıt ya da makas yaz
const choices = ["taş", "kağıt", "makas"];
const beats = { "taş": "makas", "kağıt": "taş", "makas": "kağıt" };
const score = { you: 0, computer: 0 };
const moves = require("fs").readFileSync(0, "utf8").split("\n").map((line) => line.trim().toLowerCase());

for (const move of moves) {
    if (!choices.includes(move)) continue;
    const computer = choices[Math.floor(Math.random() * choices.length)];
    let result = "berabere";
    if (beats[move] === computer) {
        result = "kazandın";
        score.you += 1;
    } else if (move !== computer) {
        result = "kaybettin";
        score.computer += 1;
    }
    console.log("Sen: " + move + ", bilgisayar: " + computer + " → " + result);
}
console.log("Skor: sen " + score.you + " - " + score.computer + " bilgisayar");
`,
        },
    },
    {
        id: "multiplication-table",
        title: { TR: "Çarpım tablosu", EN: "Multiplication table" },
        keywords: "çarpım tablosu carpim tablosu multiplication table times table çarpma tablosu tabla de multiplicar einmaleins таблица умножения",
        file: "carpim_tablosu",
        code: {
            python: String.raw`# 1'den 10'a çarpım tablosu
for satir in range(1, 11):
    print(" ".join(f"{satir * sutun:4}" for sutun in range(1, 11)))
`,
            javascript: String.raw`// 1'den 10'a çarpım tablosu
for (let row = 1; row <= 10; row += 1) {
    const cells = [];
    for (let column = 1; column <= 10; column += 1) cells.push(String(row * column).padStart(4));
    console.log(cells.join(" "));
}
`,
            cpp: String.raw`// 1'den 10'a çarpım tablosu
#include <iomanip>
#include <iostream>

int main() {
    for (int row = 1; row <= 10; ++row) {
        for (int column = 1; column <= 10; ++column) std::cout << std::setw(5) << row * column;
        std::cout << '\n';
    }
}
`,
            java: String.raw`// 1'den 10'a çarpım tablosu
public class Main {
    public static void main(String[] args) {
        for (int row = 1; row <= 10; row++) {
            StringBuilder line = new StringBuilder();
            for (int column = 1; column <= 10; column++) line.append(String.format("%5d", row * column));
            System.out.println(line);
        }
    }
}
`,
            csharp: String.raw`// 1'den 10'a çarpım tablosu
using System;

class Program
{
    static void Main()
    {
        for (int row = 1; row <= 10; row++)
        {
            for (int column = 1; column <= 10; column++) Console.Write($"{row * column,5}");
            Console.WriteLine();
        }
    }
}
`,
        },
    },
    {
        id: "countdown",
        title: { TR: "Geri sayım sayacı", EN: "Countdown timer" },
        keywords: "geri sayım sayacı zamanlayıcı timer countdown kronometre stopwatch pomodoro alarm cuenta atrás compte à rebours таймер",
        file: "geri_sayim",
        code: {
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Geri Sayım</title>
<style>
  body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #312e81, #0f172a); color: white; text-align: center; }
  .time { font-size: 72px; font-weight: 800; font-variant-numeric: tabular-nums; }
  input { width: 80px; padding: 8px; border-radius: 10px; border: 0; font-size: 18px; text-align: center; }
  button { margin: 6px; padding: 10px 18px; border: 0; border-radius: 10px; background: #a855f7; color: white; font-size: 16px; cursor: pointer; }
</style>
</head>
<body>
<main>
  <div class="time" id="time">05:00</div>
  <p><input id="minutes" type="number" min="1" max="180" value="5"> dakika</p>
  <button id="start">Başlat</button>
  <button id="pause">Duraklat</button>
  <button id="reset">Sıfırla</button>
</main>
<script>
  let left = 300;
  let timer = null;
  const time = document.getElementById("time");

  function show() {
    const minutes = String(Math.floor(left / 60)).padStart(2, "0");
    const seconds = String(left % 60).padStart(2, "0");
    time.textContent = minutes + ":" + seconds;
    document.title = left ? minutes + ":" + seconds : "Süre doldu!";
  }

  function stop() {
    clearInterval(timer);
    timer = null;
  }

  document.getElementById("start").onclick = () => {
    if (timer) return;
    if (!left) left = Number(document.getElementById("minutes").value) * 60;
    timer = setInterval(() => {
      left -= 1;
      show();
      if (left <= 0) {
        stop();
        time.textContent = "Süre doldu! ⏰";
      }
    }, 1000);
  };
  document.getElementById("pause").onclick = stop;
  document.getElementById("reset").onclick = () => {
    stop();
    left = Number(document.getElementById("minutes").value) * 60;
    show();
  };
  show();
</script>
</body>
</html>
`,
            python: String.raw`# Geri sayım: "Girdi" sekmesine saniye sayısını yaz (varsayılan 10)
import time

try:
    saniye = int(input())
except (EOFError, ValueError):
    saniye = 10

for kalan in range(saniye, 0, -1):
    print(kalan)
    time.sleep(1)
print("Süre doldu!")
`,
        },
    },
    {
        id: "password-generator",
        title: { TR: "Güçlü parola üretici", EN: "Strong password generator" },
        keywords: "parola üretici üreten üret üretme şifre üretici oluşturan oluşturucu rastgele parola password generator generate random password güçlü şifre generador de contraseñas générateur de mot de passe генератор паролей",
        file: "parola_uretici",
        note: { TR: "Parolalar senin cihazında üretilir; güçlü bir parolayı bir parola yöneticisinde sakla.", EN: "Passwords are generated on your device; keep a strong password in a password manager." },
        code: {
            python: String.raw`# Güçlü parola üretici (kriptografik rastgelelik: secrets modülü)
import secrets
import string

HARFLER = string.ascii_letters + string.digits + "!@#$%^&*-_=+?"


def parola(uzunluk=16):
    while True:
        aday = "".join(secrets.choice(HARFLER) for _ in range(uzunluk))
        # Her türden en az bir karakter olsun.
        if (any(c.islower() for c in aday) and any(c.isupper() for c in aday)
                and any(c.isdigit() for c in aday) and any(not c.isalnum() for c in aday)):
            return aday


for _ in range(5):
    print(parola(16))
`,
            javascript: String.raw`// Güçlü parola üretici (kriptografik rastgelelik: crypto.getRandomValues)
const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*-_=+?";

function password(length = 16) {
    const bytes = new Uint32Array(length);
    for (;;) {
        crypto.getRandomValues(bytes);
        const value = Array.from(bytes, (byte) => CHARS[byte % CHARS.length]).join("");
        if (/[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value)) return value;
    }
}

for (let index = 0; index < 5; index += 1) console.log(password(16));
`,
        },
    },
    {
        id: "dice",
        title: { TR: "Zar atma", EN: "Dice roller" },
        keywords: "zar at zar atma dice roller roll dice zar oyunu würfel dados dés кубик",
        file: "zar",
        code: {
            python: String.raw`# İki zar at ve sonuçları say
import random
from collections import Counter

atislar = [random.randint(1, 6) + random.randint(1, 6) for _ in range(1000)]
sayim = Counter(atislar)
print("1000 atışta iki zarın toplamı:")
for toplam in range(2, 13):
    print(f"{toplam:2}: {'#' * (sayim[toplam] // 5)} {sayim[toplam]}")
`,
            javascript: String.raw`// İki zar at ve sonuçları say
const counts = new Array(13).fill(0);
for (let roll = 0; roll < 1000; roll += 1) {
    const total = Math.ceil(Math.random() * 6) + Math.ceil(Math.random() * 6);
    counts[total] += 1;
}
console.log("1000 atışta iki zarın toplamı:");
for (let total = 2; total <= 12; total += 1) {
    console.log(String(total).padStart(2) + ": " + "#".repeat(Math.floor(counts[total] / 5)) + " " + counts[total]);
}
`,
        },
    },
    {
        id: "bmi",
        title: { TR: "Vücut kitle indeksi hesaplayıcı", EN: "BMI calculator" },
        keywords: "vücut kitle indeksi vki bmi body mass index boy kilo hesapla calculator índice de masa corporal",
        file: "vki",
        note: INPUT_NOTE,
        code: {
            python: String.raw`# Vücut kitle indeksi: "Girdi" sekmesine boyu (cm) ve kiloyu (kg) ayrı satırlara yaz
try:
    boy = float(input()) / 100
    kilo = float(input())
except (EOFError, ValueError):
    boy, kilo = 1.75, 70
    print("Girdi yok, örnek değerler kullanıldı: 175 cm, 70 kg")

vki = kilo / boy ** 2
if vki < 18.5:
    durum = "zayıf"
elif vki < 25:
    durum = "normal"
elif vki < 30:
    durum = "fazla kilolu"
else:
    durum = "obez"
print(f"VKİ: {vki:.1f} ({durum})")
print("Not: VKİ yalnızca kabaca bir göstergedir; sağlıkla ilgili kararlar için bir uzmana danış.")
`,
            javascript: String.raw`// Vücut kitle indeksi: "Girdi" sekmesine boyu (cm) ve kiloyu (kg) ayrı satırlara yaz
const [heightText, weightText] = require("fs").readFileSync(0, "utf8").split("\n");
const height = (Number(heightText) || 175) / 100;
const weight = Number(weightText) || 70;
const bmi = weight / (height * height);
const status = bmi < 18.5 ? "zayıf" : bmi < 25 ? "normal" : bmi < 30 ? "fazla kilolu" : "obez";
console.log("VKİ: " + bmi.toFixed(1) + " (" + status + ")");
`,
        },
    },
    {
        id: "quiz",
        title: { TR: "Bilgi yarışması", EN: "Quiz game" },
        keywords: "bilgi yarışması quiz soru cevap test yarışma trivia question answer cuestionario questionnaire викторина",
        file: "bilgi_yarismasi",
        note: INPUT_NOTE,
        code: {
            python: String.raw`# Bilgi yarışması: cevapları "Girdi" sekmesine sırayla, her satıra bir tane yaz
SORULAR = [
    ("Python'da listeye eleman ekleyen metot hangisi?", "append"),
    ("HTML'de en büyük başlık etiketi hangisi?", "h1"),
    ("2 üzeri 10 kaçtır?", "1024"),
    ("JavaScript'te sabit tanımlamak için hangi kelime kullanılır?", "const"),
]

dogru = 0
for soru, cevap in SORULAR:
    print(soru)
    try:
        yanit = input().strip().lower()
    except EOFError:
        yanit = ""
    if yanit == cevap:
        print("  ✓ Doğru!")
        dogru += 1
    else:
        print(f"  ✗ Yanlış, doğru cevap: {cevap}")
print(f"Sonuç: {dogru}/{len(SORULAR)}")
`,
        },
    },
    {
        id: "snake",
        title: { TR: "Yılan oyunu", EN: "Snake game" },
        keywords: "yılan oyunu yilan snake game klasik oyun nokia tarayıcı oyunu browser game html canvas juego de la serpiente jeu du serpent змейка",
        file: "yilan",
        note: { TR: "Ok tuşlarıyla oyna. Oyun editörün canlı önizlemesinde çalışır.", EN: "Play with the arrow keys. The game runs in the editor's live preview." },
        code: {
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Yılan</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0f172a; color: #e2e8f0; font-family: system-ui, sans-serif; }
  canvas { background: #111827; border-radius: 12px; box-shadow: 0 0 0 4px #1f2937; }
  p { text-align: center; }
</style>
</head>
<body>
<main>
  <p>Skor: <b id="score">0</b> · En iyi: <b id="best">0</b></p>
  <canvas id="game" width="400" height="400"></canvas>
  <p>Ok tuşları ile yönlendir · Boşluk: yeniden başla</p>
</main>
<script>
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const SIZE = 20;
  const CELLS = canvas.width / SIZE;
  // Sandboxed previews have no localStorage: fall back to memory so the page still runs.
  const store = (() => {
    try {
      window.localStorage.getItem("test");
      return window.localStorage;
    } catch {
      const memory = {};
      return { getItem: (key) => (key in memory ? memory[key] : null), setItem: (key, value) => { memory[key] = String(value); } };
    }
  })();
  let snake, direction, nextDirection, food, score, alive;
  let best = Number(store.getItem("snake-best") || 0);
  document.getElementById("best").textContent = best;

  function placeFood() {
    do {
      food = { x: Math.floor(Math.random() * CELLS), y: Math.floor(Math.random() * CELLS) };
    } while (snake.some((part) => part.x === food.x && part.y === food.y));
  }

  function reset() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    direction = { x: 1, y: 0 };
    nextDirection = direction;
    score = 0;
    alive = true;
    document.getElementById("score").textContent = score;
    placeFood();
  }

  function step() {
    if (!alive) return;
    direction = nextDirection;
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    const hitWall = head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS;
    if (hitWall || snake.some((part) => part.x === head.x && part.y === head.y)) {
      alive = false;
      if (score > best) {
        best = score;
        store.setItem("snake-best", best);
        document.getElementById("best").textContent = best;
      }
      return;
    }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 1;
      document.getElementById("score").textContent = score;
      placeFood();
    } else {
      snake.pop();
    }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f43f5e";
    ctx.fillRect(food.x * SIZE + 3, food.y * SIZE + 3, SIZE - 6, SIZE - 6);
    snake.forEach((part, index) => {
      ctx.fillStyle = index === 0 ? "#34d399" : "#10b981";
      ctx.fillRect(part.x * SIZE + 1, part.y * SIZE + 1, SIZE - 2, SIZE - 2);
    });
    if (!alive) {
      ctx.fillStyle = "#000a";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#fff";
      ctx.font = "bold 28px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Oyun bitti! Boşluk: yeniden", canvas.width / 2, canvas.height / 2);
    }
  }

  const KEYS = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
  document.addEventListener("keydown", (event) => {
    if (event.code === "Space" && !alive) reset();
    const wanted = KEYS[event.key];
    if (!wanted) return;
    event.preventDefault();
    // The snake can't turn straight back into itself.
    if (wanted.x !== -direction.x || wanted.y !== -direction.y) nextDirection = wanted;
  });

  reset();
  setInterval(() => {
    step();
    draw();
  }, 110);
</script>
</body>
</html>
`,
        },
    },
    {
        id: "pong",
        title: { TR: "Pong oyunu", EN: "Pong game" },
        keywords: "pong oyunu raket top oyunu ping pong tenis paddle ball game arcade html canvas",
        file: "pong",
        note: { TR: "W/S ya da ok tuşlarıyla raketi oynat. Oyun editörün canlı önizlemesinde çalışır.", EN: "Move the paddle with W/S or the arrow keys. The game runs in the editor's live preview." },
        code: {
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Pong</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #020617; font-family: system-ui, sans-serif; color: #e2e8f0; }
  canvas { background: #0f172a; border-radius: 12px; }
</style>
</head>
<body>
<canvas id="game" width="640" height="400"></canvas>
<script>
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const paddle = { w: 10, h: 80, speed: 6 };
  const player = { y: 160, score: 0 };
  const computer = { y: 160, score: 0 };
  const ball = { x: 320, y: 200, vx: 4, vy: 3, r: 7 };
  const keys = {};

  function serve(direction) {
    ball.x = canvas.width / 2;
    ball.y = canvas.height / 2;
    ball.vx = 4 * direction;
    ball.vy = (Math.random() * 4 - 2) || 2;
  }

  function update() {
    if (keys.ArrowUp || keys.w) player.y -= paddle.speed;
    if (keys.ArrowDown || keys.s) player.y += paddle.speed;
    player.y = Math.max(0, Math.min(canvas.height - paddle.h, player.y));
    // The computer follows the ball a little slower than the player can move.
    const target = ball.y - paddle.h / 2;
    computer.y += Math.sign(target - computer.y) * Math.min(4, Math.abs(target - computer.y));

    ball.x += ball.vx;
    ball.y += ball.vy;
    if (ball.y < ball.r || ball.y > canvas.height - ball.r) ball.vy *= -1;

    const hit = (x, y) => ball.x + ball.r > x && ball.x - ball.r < x + paddle.w && ball.y > y && ball.y < y + paddle.h;
    if (ball.vx < 0 && hit(20, player.y)) ball.vx = Math.abs(ball.vx) * 1.05;
    if (ball.vx > 0 && hit(canvas.width - 30, computer.y)) ball.vx = -Math.abs(ball.vx) * 1.05;

    if (ball.x < 0) { computer.score += 1; serve(1); }
    if (ball.x > canvas.width) { player.score += 1; serve(-1); }
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#334155";
    for (let y = 0; y < canvas.height; y += 24) ctx.fillRect(canvas.width / 2 - 1, y, 2, 12);
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(20, player.y, paddle.w, paddle.h);
    ctx.fillRect(canvas.width - 30, computer.y, paddle.w, paddle.h);
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "bold 32px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(player.score + "   " + computer.score, canvas.width / 2, 44);
  }

  document.addEventListener("keydown", (event) => { keys[event.key] = true; });
  document.addEventListener("keyup", (event) => { keys[event.key] = false; });
  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }
  serve(1);
  loop();
</script>
</body>
</html>
`,
        },
    },
    {
        id: "tic-tac-toe",
        title: { TR: "XOX (tic-tac-toe) oyunu", EN: "Tic-tac-toe game" },
        keywords: "xox oyunu tic tac toe tictactoe üç taş üçtaş iki kişilik oyun tres en raya morpion крестики нолики",
        file: "xox",
        note: PREVIEW_NOTE,
        code: {
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>XOX</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f1f5f9; font-family: system-ui, sans-serif; }
  .board { display: grid; grid-template-columns: repeat(3, 96px); gap: 8px; }
  button.cell { height: 96px; border: 0; border-radius: 16px; background: white; font-size: 48px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px #0002; }
  .x { color: #6366f1; }
  .o { color: #f43f5e; }
  p { text-align: center; font-size: 20px; }
</style>
</head>
<body>
<main>
  <p id="status">Sıra: X</p>
  <div class="board" id="board"></div>
  <p><button id="again">Yeni oyun</button></p>
</main>
<script>
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  let cells, turn, over;

  function winner() {
    for (const [a, b, c] of LINES) {
      if (cells[a] && cells[a] === cells[b] && cells[a] === cells[c]) return cells[a];
    }
    return cells.every(Boolean) ? "berabere" : null;
  }

  function render() {
    const board = document.getElementById("board");
    board.innerHTML = "";
    cells.forEach((value, index) => {
      const button = document.createElement("button");
      button.className = "cell " + (value === "X" ? "x" : "o");
      button.textContent = value;
      button.setAttribute("aria-label", "Kare " + (index + 1));
      button.addEventListener("click", () => play(index));
      board.append(button);
    });
  }

  function play(index) {
    if (over || cells[index]) return;
    cells[index] = turn;
    const result = winner();
    if (result) {
      over = true;
      document.getElementById("status").textContent = result === "berabere" ? "Berabere!" : result + " kazandı! 🎉";
    } else {
      turn = turn === "X" ? "O" : "X";
      document.getElementById("status").textContent = "Sıra: " + turn;
    }
    render();
  }

  function start() {
    cells = Array(9).fill("");
    turn = "X";
    over = false;
    document.getElementById("status").textContent = "Sıra: X";
    render();
  }

  document.getElementById("again").addEventListener("click", start);
  start();
</script>
</body>
</html>
`,
        },
    },
    {
        id: "clicker",
        title: { TR: "Tıklama oyunu", EN: "Clicker game" },
        keywords: "tıklama oyunu clicker game idle cookie clicker tıkla puan topla tarayıcı oyunu",
        file: "tiklama",
        note: PREVIEW_NOTE,
        code: {
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<title>Tıklama Oyunu</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: radial-gradient(circle at top, #4c1d95, #0f172a); color: white; font-family: system-ui, sans-serif; text-align: center; }
  #coin { width: 160px; height: 160px; border-radius: 50%; border: 0; font-size: 72px; background: #facc15; cursor: pointer; transition: transform 0.08s; }
  #coin:active { transform: scale(0.94); }
  .shop button { margin: 6px; padding: 10px 14px; border: 0; border-radius: 12px; background: #22c55e; color: white; cursor: pointer; }
  .shop button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
</head>
<body>
<main>
  <h1><span id="coins">0</span> altın</h1>
  <p>Saniyede <span id="rate">0</span> altın</p>
  <button id="coin" aria-label="Altın topla">🪙</button>
  <div class="shop">
    <button id="buy-click">Güçlü tık (+1/tık) — <span id="click-cost">10</span></button>
    <button id="buy-auto">Madenci (+1/sn) — <span id="auto-cost">25</span></button>
  </div>
</main>
<script>
  // Sandboxed previews have no localStorage: fall back to memory so the page still runs.
  const store = (() => {
    try {
      window.localStorage.getItem("test");
      return window.localStorage;
    } catch {
      const memory = {};
      return { getItem: (key) => (key in memory ? memory[key] : null), setItem: (key, value) => { memory[key] = String(value); } };
    }
  })();
  const state = JSON.parse(store.getItem("clicker") || '{"coins":0,"perClick":1,"perSecond":0,"clickCost":10,"autoCost":25}');
  const $ = (id) => document.getElementById(id);

  function render() {
    $("coins").textContent = Math.floor(state.coins);
    $("rate").textContent = state.perSecond;
    $("click-cost").textContent = state.clickCost;
    $("auto-cost").textContent = state.autoCost;
    $("buy-click").disabled = state.coins < state.clickCost;
    $("buy-auto").disabled = state.coins < state.autoCost;
    store.setItem("clicker", JSON.stringify(state));
  }

  $("coin").onclick = () => { state.coins += state.perClick; render(); };
  $("buy-click").onclick = () => {
    state.coins -= state.clickCost;
    state.perClick += 1;
    state.clickCost = Math.round(state.clickCost * 1.6);
    render();
  };
  $("buy-auto").onclick = () => {
    state.coins -= state.autoCost;
    state.perSecond += 1;
    state.autoCost = Math.round(state.autoCost * 1.5);
    render();
  };
  setInterval(() => { state.coins += state.perSecond / 10; render(); }, 100);
  render();
</script>
</body>
</html>
`,
        },
    },
    {
        id: "web-page",
        title: { TR: "Kişisel web sayfası", EN: "Personal web page" },
        keywords: "web sayfası kişisel site portfolyo portfolio landing page tanıtım sayfası html css sayfa yap website homepage página web site personnel",
        file: "index",
        note: PREVIEW_NOTE,
        code: {
            html: String.raw`<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Adın Soyadın</title>
<style>
  :root { --accent: #6366f1; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #0f172a; background: #f8fafc; line-height: 1.6; }
  header { padding: 72px 20px 48px; text-align: center; background: linear-gradient(135deg, var(--accent), #a855f7); color: white; }
  header img { width: 112px; height: 112px; border-radius: 50%; border: 4px solid #fff8; }
  section { max-width: 720px; margin: 0 auto; padding: 32px 20px; }
  .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
  .card { padding: 18px; border-radius: 16px; background: white; box-shadow: 0 2px 10px #0001; }
  a.button { display: inline-block; padding: 10px 18px; border-radius: 999px; background: white; color: var(--accent); font-weight: 700; text-decoration: none; }
  footer { padding: 24px; text-align: center; color: #64748b; }
</style>
</head>
<body>
<header>
  <img src="https://api.dicebear.com/9.x/thumbs/svg?seed=hanogt" alt="">
  <h1>Merhaba, ben Adın 👋</h1>
  <p>Yazılım geliştirmeyi ve oyun yapmayı seven bir öğrenciyim.</p>
  <a class="button" href="#projeler">Projelerimi gör</a>
</header>
<section>
  <h2>Hakkımda</h2>
  <p>Python, JavaScript ve C# ile küçük projeler geliştiriyorum. Şu sıralar Hanogt Engine ile 2D oyunlar yapıyorum.</p>
</section>
<section id="projeler">
  <h2>Projeler</h2>
  <div class="cards">
    <div class="card"><h3>🎮 Platform Oyunu</h3><p>Hanogt Engine ile yaptığım zıplamalı bir oyun.</p></div>
    <div class="card"><h3>🧮 Hesap Makinesi</h3><p>HTML, CSS ve JavaScript ile yazdığım hesap makinesi.</p></div>
    <div class="card"><h3>✅ Yapılacaklar</h3><p>Görevlerimi tarayıcıda saklayan küçük bir uygulama.</p></div>
  </div>
</section>
<footer>© 2026 Adın Soyadın · Hanogt ile yapıldı</footer>
</body>
</html>
`,
        },
    },
];

let programIndex: InstanceType<typeof Bm25Index> | null = null;

/** The program that best matches a request ("Python ile hesap makinesi yaz"), or null. */
export function findProgram(query: string): ProgramSnippet | null {
    if (!programIndex) {
        programIndex = new Bm25Index(PROGRAM_SNIPPETS.map((program) => ({
            id: program.id,
            text: `${program.title.TR} ${program.title.EN} ${program.keywords} ${program.keywords}`,
        })));
    }
    const hit = programIndex.search(query, 1).find((entry) => entry.coverage >= 0.34 && entry.matched >= 1);
    return hit ? PROGRAM_SNIPPETS.find((program) => program.id === hit.id) ?? null : null;
}

/** Which of a program's languages to use: the requested one if it exists, else HTML for web programs, else Python. */
export function pickProgramLanguage(program: ProgramSnippet, wanted: ProgramLanguage | null): ProgramLanguage {
    if (wanted && program.code[wanted]) return wanted;
    const order: ProgramLanguage[] = ["python", "html", "javascript", "csharp", "cpp", "java"];
    return order.find((language) => program.code[language]) ?? "python";
}
