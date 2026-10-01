/**
 * Offline code examples for Hanogt AI Core: common programming tasks in five
 * languages and Hanogt Engine (Unity-style C#) game scripts. Retrieval picks
 * the task; the language comes from the question or the open editor file.
 */
import type { Copy } from "@/lib/i18n";

export type SnippetLanguage = "python" | "javascript" | "csharp" | "cpp" | "java";

export interface CodeSnippet {
    id: string;
    title: Copy;
    /** Search words in Turkish and English. */
    keywords: string;
    note?: Copy;
    code: Partial<Record<SnippetLanguage, string>>;
}

export interface EngineSnippet {
    id: string;
    title: Copy;
    keywords: string;
    note?: Copy;
    code: string;
}

export const SNIPPET_LANGUAGES: Array<{ id: SnippetLanguage; name: string; aliases: string[] }> = [
    { id: "python", name: "Python", aliases: ["python", "py", "pyton", "piton"] },
    { id: "javascript", name: "JavaScript", aliases: ["javascript", "js", "node", "nodejs", "typescript", "ts"] },
    { id: "csharp", name: "C#", aliases: ["c#", "csharp", "c sharp", "cs", ".net", "dotnet", "unity"] },
    { id: "cpp", name: "C++", aliases: ["c++", "cpp", "cplusplus"] },
    { id: "java", name: "Java", aliases: ["java"] },
];

export const SNIPPETS: CodeSnippet[] = [
    {
        id: "hello",
        title: { TR: "Merhaba Dünya", EN: "Hello world" },
        keywords: "merhaba dünya hello world yazdır ekrana print console output çıktı ilk program first program",
        code: {
            python: 'print("Merhaba Dünya!")',
            javascript: 'console.log("Merhaba Dünya!");',
            csharp: 'using System;\n\nclass Program\n{\n    static void Main()\n    {\n        Console.WriteLine("Merhaba Dünya!");\n    }\n}',
            cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Merhaba Dünya!" << std::endl;\n    return 0;\n}',
            java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Merhaba Dünya!");\n    }\n}',
        },
    },
    {
        id: "input",
        title: { TR: "Kullanıcıdan girdi alma", EN: "Reading user input" },
        keywords: "girdi input kullanıcıdan al oku read stdin scanner cin readline sayı al number klavye keyboard",
        note: { TR: "Hanogt editöründe girdiyi **Girdi** sekmesine yaz.", EN: "In the Hanogt editor, type the input in the **Input** tab." },
        code: {
            python: 'name = input("Adın? ")\nage = int(input("Yaşın? "))\nprint(f"Merhaba {name}, {age + 1} yaşına girmene az kaldı!")',
            javascript: '// Node.js: tüm girdiyi okuyup satırlara böl\nconst lines = require("fs").readFileSync(0, "utf8").trim().split("\\n");\nconst name = lines[0];\nconst age = Number(lines[1]);\nconsole.log(`Merhaba ${name}, ${age + 1} yaşına girmene az kaldı!`);',
            csharp: 'using System;\n\nclass Program\n{\n    static void Main()\n    {\n        string name = Console.ReadLine();\n        int age = int.Parse(Console.ReadLine());\n        Console.WriteLine($"Merhaba {name}, {age + 1} yaşına girmene az kaldı!");\n    }\n}',
            cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    int age;\n    std::getline(std::cin, name);\n    std::cin >> age;\n    std::cout << "Merhaba " << name << ", " << age + 1 << " yaşına girmene az kaldı!\\n";\n}',
            java: 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        String name = in.nextLine();\n        int age = in.nextInt();\n        System.out.println("Merhaba " + name + ", " + (age + 1) + " yaşına girmene az kaldı!");\n    }\n}',
        },
    },
    {
        id: "if-else",
        title: { TR: "Koşullar (if / else)", EN: "Conditions (if / else)" },
        keywords: "if else koşul condition eğer karşılaştır compare çift tek even odd not grade",
        code: {
            python: 'score = 72\nif score >= 85:\n    print("Pekiyi")\nelif score >= 50:\n    print("Geçti")\nelse:\n    print("Kaldı")',
            javascript: 'const score = 72;\nif (score >= 85) {\n    console.log("Pekiyi");\n} else if (score >= 50) {\n    console.log("Geçti");\n} else {\n    console.log("Kaldı");\n}',
            csharp: 'int score = 72;\nif (score >= 85) Console.WriteLine("Pekiyi");\nelse if (score >= 50) Console.WriteLine("Geçti");\nelse Console.WriteLine("Kaldı");',
            cpp: 'int score = 72;\nif (score >= 85) std::cout << "Pekiyi\\n";\nelse if (score >= 50) std::cout << "Geçti\\n";\nelse std::cout << "Kaldı\\n";',
            java: 'int score = 72;\nif (score >= 85) System.out.println("Pekiyi");\nelse if (score >= 50) System.out.println("Geçti");\nelse System.out.println("Kaldı");',
        },
    },
    {
        id: "for-loop",
        title: { TR: "For döngüsü", EN: "For loop" },
        keywords: "for döngü loop tekrar repeat iterate range 1 den 10 a kadar say count",
        code: {
            python: 'for i in range(1, 6):\n    print(i, "x", i, "=", i * i)\n\nfor fruit in ["elma", "armut", "kiraz"]:\n    print(fruit)',
            javascript: 'for (let i = 1; i <= 5; i++) {\n    console.log(`${i} x ${i} = ${i * i}`);\n}\n\nfor (const fruit of ["elma", "armut", "kiraz"]) {\n    console.log(fruit);\n}',
            csharp: 'for (int i = 1; i <= 5; i++)\n{\n    Console.WriteLine($"{i} x {i} = {i * i}");\n}\n\nforeach (var fruit in new[] { "elma", "armut", "kiraz" })\n{\n    Console.WriteLine(fruit);\n}',
            cpp: 'for (int i = 1; i <= 5; i++) {\n    std::cout << i << " x " << i << " = " << i * i << "\\n";\n}\n\nstd::vector<std::string> fruits = {"elma", "armut", "kiraz"};\nfor (const auto& fruit : fruits) std::cout << fruit << "\\n";',
            java: 'for (int i = 1; i <= 5; i++) {\n    System.out.println(i + " x " + i + " = " + i * i);\n}\n\nfor (String fruit : new String[] {"elma", "armut", "kiraz"}) {\n    System.out.println(fruit);\n}',
        },
    },
    {
        id: "while-loop",
        title: { TR: "While döngüsü", EN: "While loop" },
        keywords: "while döngü loop koşul sürece until break continue sayaç counter",
        code: {
            python: 'count = 10\nwhile count > 0:\n    print(count)\n    count -= 1\nprint("Kalkış! 🚀")',
            javascript: 'let count = 10;\nwhile (count > 0) {\n    console.log(count);\n    count--;\n}\nconsole.log("Kalkış! 🚀");',
            csharp: 'int count = 10;\nwhile (count > 0)\n{\n    Console.WriteLine(count);\n    count--;\n}\nConsole.WriteLine("Kalkış!");',
            cpp: 'int count = 10;\nwhile (count > 0) {\n    std::cout << count << "\\n";\n    count--;\n}\nstd::cout << "Kalkış!\\n";',
            java: 'int count = 10;\nwhile (count > 0) {\n    System.out.println(count);\n    count--;\n}\nSystem.out.println("Kalkış!");',
        },
    },
    {
        id: "function",
        title: { TR: "Fonksiyon tanımlama", EN: "Defining a function" },
        keywords: "fonksiyon function metot method def tanımla define parametre parameter return döndür",
        code: {
            python: 'def area(width: float, height: float = 1.0) -> float:\n    """Dikdörtgenin alanını döndürür."""\n    return width * height\n\nprint(area(3, 4))  # 12',
            javascript: 'function area(width, height = 1) {\n    return width * height;\n}\n\nconst double = (x) => x * 2;\nconsole.log(area(3, 4), double(21));',
            csharp: 'static double Area(double width, double height = 1)\n{\n    return width * height;\n}\n\nConsole.WriteLine(Area(3, 4)); // 12',
            cpp: 'double area(double width, double height = 1) {\n    return width * height;\n}\n\nint main() {\n    std::cout << area(3, 4) << "\\n"; // 12\n}',
            java: 'static double area(double width, double height) {\n    return width * height;\n}\n\npublic static void main(String[] args) {\n    System.out.println(area(3, 4)); // 12.0\n}',
        },
    },
    {
        id: "list",
        title: { TR: "Liste / dizi işlemleri", EN: "Lists and arrays" },
        keywords: "liste list dizi array ekle append push çıkar remove uzunluk length eleman element index vector arraylist",
        code: {
            python: 'numbers = [5, 3, 8]\nnumbers.append(1)\nnumbers.remove(3)\nprint(numbers, len(numbers), numbers[0], numbers[-1])',
            javascript: 'const numbers = [5, 3, 8];\nnumbers.push(1);\nnumbers.splice(numbers.indexOf(3), 1);\nconsole.log(numbers, numbers.length, numbers[0], numbers.at(-1));',
            csharp: 'var numbers = new List<int> { 5, 3, 8 };\nnumbers.Add(1);\nnumbers.Remove(3);\nConsole.WriteLine(string.Join(", ", numbers) + $" ({numbers.Count})");',
            cpp: '#include <vector>\n#include <algorithm>\n\nstd::vector<int> numbers = {5, 3, 8};\nnumbers.push_back(1);\nnumbers.erase(std::remove(numbers.begin(), numbers.end(), 3), numbers.end());\nfor (int n : numbers) std::cout << n << " ";',
            java: 'import java.util.*;\n\nList<Integer> numbers = new ArrayList<>(List.of(5, 3, 8));\nnumbers.add(1);\nnumbers.remove(Integer.valueOf(3));\nSystem.out.println(numbers + " " + numbers.size());',
        },
    },
    {
        id: "dictionary",
        title: { TR: "Sözlük / map", EN: "Dictionary / map" },
        keywords: "sözlük dictionary dict map hashmap anahtar key değer value object nesne",
        code: {
            python: 'ages = {"Ali": 21, "Ayşe": 25}\nages["Can"] = 19\nfor name, age in ages.items():\n    print(name, age)\nprint(ages.get("Zeynep", "yok"))',
            javascript: 'const ages = new Map([["Ali", 21], ["Ayşe", 25]]);\nages.set("Can", 19);\nfor (const [name, age] of ages) console.log(name, age);\nconsole.log(ages.get("Zeynep") ?? "yok");',
            csharp: 'var ages = new Dictionary<string, int> { ["Ali"] = 21, ["Ayşe"] = 25 };\nages["Can"] = 19;\nforeach (var (name, age) in ages) Console.WriteLine($"{name} {age}");\nConsole.WriteLine(ages.TryGetValue("Zeynep", out var a) ? a.ToString() : "yok");',
            cpp: '#include <map>\n\nstd::map<std::string, int> ages = {{"Ali", 21}, {"Ayşe", 25}};\nages["Can"] = 19;\nfor (const auto& [name, age] : ages) std::cout << name << " " << age << "\\n";\nstd::cout << (ages.count("Zeynep") ? "var" : "yok") << "\\n";',
            java: 'import java.util.*;\n\nMap<String, Integer> ages = new HashMap<>(Map.of("Ali", 21, "Ayşe", 25));\nages.put("Can", 19);\nages.forEach((name, age) -> System.out.println(name + " " + age));\nSystem.out.println(ages.getOrDefault("Zeynep", -1));',
        },
    },
    {
        id: "reverse-string",
        title: { TR: "Metni / listeyi ters çevirme", EN: "Reversing a string or list" },
        keywords: "ters çevir reverse string metin yazı liste list dizi array tersine",
        code: {
            python: 'text = "Hanogt"\nprint(text[::-1])          # tgonaH\nitems = [1, 2, 3]\nprint(list(reversed(items)))  # [3, 2, 1]',
            javascript: 'const text = "Hanogt";\nconsole.log([...text].reverse().join("")); // tgonaH\nconsole.log([1, 2, 3].toReversed());       // [3, 2, 1]',
            csharp: 'string text = "Hanogt";\nchar[] chars = text.ToCharArray();\nArray.Reverse(chars);\nConsole.WriteLine(new string(chars)); // tgonaH',
            cpp: '#include <algorithm>\n\nstd::string text = "Hanogt";\nstd::reverse(text.begin(), text.end());\nstd::cout << text << "\\n"; // tgonaH',
            java: 'String text = "Hanogt";\nSystem.out.println(new StringBuilder(text).reverse()); // tgonaH',
        },
    },
    {
        id: "sort",
        title: { TR: "Sıralama", EN: "Sorting" },
        keywords: "sırala sort sıralama sıralamak diziyi listeyi dizi liste array list küçükten büyüğe büyükten küçüğe ascending descending order",
        code: {
            python: 'numbers = [5, 2, 9, 1]\nprint(sorted(numbers))                 # [1, 2, 5, 9]\nprint(sorted(numbers, reverse=True))   # [9, 5, 2, 1]\nwords = ["kiraz", "elma", "armut"]\nwords.sort(key=len)',
            javascript: 'const numbers = [5, 2, 9, 1];\nconsole.log(numbers.toSorted((a, b) => a - b)); // [1, 2, 5, 9]\nconsole.log(numbers.toSorted((a, b) => b - a)); // [9, 5, 2, 1]\n// Not: sort() sayıları varsayılan olarak metin gibi sıralar.',
            csharp: 'var numbers = new List<int> { 5, 2, 9, 1 };\nnumbers.Sort();\nvar descending = numbers.OrderByDescending(n => n).ToList();\nConsole.WriteLine(string.Join(", ", numbers));',
            cpp: '#include <algorithm>\n\nstd::vector<int> numbers = {5, 2, 9, 1};\nstd::sort(numbers.begin(), numbers.end());                       // artan\nstd::sort(numbers.begin(), numbers.end(), std::greater<int>());  // azalan',
            java: 'import java.util.*;\n\nList<Integer> numbers = new ArrayList<>(List.of(5, 2, 9, 1));\nCollections.sort(numbers);                         // [1, 2, 5, 9]\nnumbers.sort(Comparator.reverseOrder());           // [9, 5, 2, 1]',
        },
    },
    {
        id: "sum-max",
        title: { TR: "Toplam, en büyük, en küçük, ortalama", EN: "Sum, max, min, average" },
        keywords: "toplam sum en büyük max maksimum en küçük min minimum ortalama average mean topla",
        code: {
            python: 'numbers = [4, 8, 15, 16, 23, 42]\nprint(sum(numbers), max(numbers), min(numbers), sum(numbers) / len(numbers))',
            javascript: 'const numbers = [4, 8, 15, 16, 23, 42];\nconst sum = numbers.reduce((a, b) => a + b, 0);\nconsole.log(sum, Math.max(...numbers), Math.min(...numbers), sum / numbers.length);',
            csharp: 'int[] numbers = { 4, 8, 15, 16, 23, 42 };\nConsole.WriteLine($"{numbers.Sum()} {numbers.Max()} {numbers.Min()} {numbers.Average()}");',
            cpp: '#include <numeric>\n#include <algorithm>\n\nstd::vector<int> v = {4, 8, 15, 16, 23, 42};\nint sum = std::accumulate(v.begin(), v.end(), 0);\nstd::cout << sum << " " << *std::max_element(v.begin(), v.end()) << " " << (double)sum / v.size();',
            java: 'import java.util.stream.IntStream;\n\nint[] numbers = {4, 8, 15, 16, 23, 42};\nSystem.out.println(IntStream.of(numbers).sum() + " " + IntStream.of(numbers).max().getAsInt() + " " + IntStream.of(numbers).average().getAsDouble());',
        },
    },
    {
        id: "class",
        title: { TR: "Sınıf ve nesne", EN: "Class and object" },
        keywords: "sınıf class nesne object oop constructor yapıcı metot method özellik property inheritance kalıtım",
        code: {
            python: 'class Animal:\n    def __init__(self, name: str):\n        self.name = name\n\n    def speak(self) -> str:\n        return "..."\n\nclass Dog(Animal):\n    def speak(self) -> str:\n        return f"{self.name}: Hav!"\n\nprint(Dog("Karabaş").speak())',
            javascript: 'class Animal {\n    constructor(name) { this.name = name; }\n    speak() { return "..."; }\n}\n\nclass Dog extends Animal {\n    speak() { return `${this.name}: Hav!`; }\n}\n\nconsole.log(new Dog("Karabaş").speak());',
            csharp: 'class Animal\n{\n    public string Name { get; }\n    public Animal(string name) => Name = name;\n    public virtual string Speak() => "...";\n}\n\nclass Dog : Animal\n{\n    public Dog(string name) : base(name) { }\n    public override string Speak() => $"{Name}: Hav!";\n}',
            cpp: 'class Animal {\npublic:\n    explicit Animal(std::string name) : name(std::move(name)) {}\n    virtual ~Animal() = default;\n    virtual std::string speak() const { return "..."; }\nprotected:\n    std::string name;\n};\n\nclass Dog : public Animal {\npublic:\n    using Animal::Animal;\n    std::string speak() const override { return name + ": Hav!"; }\n};',
            java: 'class Animal {\n    protected final String name;\n    Animal(String name) { this.name = name; }\n    String speak() { return "..."; }\n}\n\nclass Dog extends Animal {\n    Dog(String name) { super(name); }\n    @Override String speak() { return name + ": Hav!"; }\n}',
        },
    },
    {
        id: "exceptions",
        title: { TR: "Hata yakalama (try / catch)", EN: "Error handling (try / catch)" },
        keywords: "hata yakala try catch except exception istisna finally throw raise error handling",
        code: {
            python: 'try:\n    value = int(input())\n    print(100 / value)\nexcept ValueError:\n    print("Lütfen bir sayı girin.")\nexcept ZeroDivisionError:\n    print("Sıfıra bölünemez.")\nfinally:\n    print("Bitti.")',
            javascript: 'try {\n    const data = JSON.parse("{bozuk json}");\n} catch (error) {\n    console.error("Geçersiz JSON:", error.message);\n} finally {\n    console.log("Bitti.");\n}',
            csharp: 'try\n{\n    int value = int.Parse(Console.ReadLine());\n    Console.WriteLine(100 / value);\n}\ncatch (FormatException) { Console.WriteLine("Lütfen bir sayı girin."); }\ncatch (DivideByZeroException) { Console.WriteLine("Sıfıra bölünemez."); }\nfinally { Console.WriteLine("Bitti."); }',
            cpp: '#include <stdexcept>\n\ntry {\n    int value = std::stoi("abc");\n} catch (const std::invalid_argument& e) {\n    std::cerr << "Lütfen bir sayı girin: " << e.what() << "\\n";\n}',
            java: 'try {\n    int value = Integer.parseInt("abc");\n} catch (NumberFormatException e) {\n    System.out.println("Lütfen bir sayı girin.");\n} finally {\n    System.out.println("Bitti.");\n}',
        },
    },
    {
        id: "file-read",
        title: { TR: "Dosya okuma", EN: "Reading a file" },
        keywords: "dosya oku file read okuma satır satır line by line txt metin dosyası open",
        code: {
            python: 'with open("notlar.txt", encoding="utf-8") as file:\n    for line in file:\n        print(line.rstrip())',
            javascript: 'const fs = require("fs");\nconst text = fs.readFileSync("notlar.txt", "utf8");\nfor (const line of text.split("\\n")) console.log(line);',
            csharp: 'foreach (string line in File.ReadLines("notlar.txt"))\n{\n    Console.WriteLine(line);\n}',
            cpp: '#include <fstream>\n\nstd::ifstream file("notlar.txt");\nstd::string line;\nwhile (std::getline(file, line)) std::cout << line << "\\n";',
            java: 'import java.nio.file.*;\n\nfor (String line : Files.readAllLines(Path.of("notlar.txt"))) {\n    System.out.println(line);\n}',
        },
    },
    {
        id: "file-write",
        title: { TR: "Dosyaya yazma", EN: "Writing to a file" },
        keywords: "dosyaya yaz write file kaydet save append ekle txt",
        code: {
            python: 'with open("notlar.txt", "w", encoding="utf-8") as file:\n    file.write("Birinci satır\\n")\n    file.write("İkinci satır\\n")',
            javascript: 'const fs = require("fs");\nfs.writeFileSync("notlar.txt", "Birinci satır\\nİkinci satır\\n", "utf8");\nfs.appendFileSync("notlar.txt", "Eklenen satır\\n");',
            csharp: 'File.WriteAllText("notlar.txt", "Birinci satır\\nİkinci satır\\n");\nFile.AppendAllText("notlar.txt", "Eklenen satır\\n");',
            cpp: '#include <fstream>\n\nstd::ofstream file("notlar.txt");\nfile << "Birinci satır\\n" << "İkinci satır\\n";',
            java: 'import java.nio.file.*;\n\nFiles.writeString(Path.of("notlar.txt"), "Birinci satır\\nİkinci satır\\n");',
        },
    },
    {
        id: "random",
        title: { TR: "Rastgele sayı", EN: "Random numbers" },
        keywords: "rastgele random sayı number zar dice tahmin guess rand shuffle karıştır",
        code: {
            python: 'import random\n\nprint(random.randint(1, 6))        # zar: 1–6\nprint(random.choice(["taş", "kağıt", "makas"]))\nitems = [1, 2, 3, 4]\nrandom.shuffle(items)',
            javascript: 'const dice = Math.floor(Math.random() * 6) + 1; // 1–6\nconst pick = (list) => list[Math.floor(Math.random() * list.length)];\nconsole.log(dice, pick(["taş", "kağıt", "makas"]));',
            csharp: 'var random = new Random();\nint dice = random.Next(1, 7); // 1–6\nConsole.WriteLine(dice);',
            cpp: '#include <random>\n\nstd::mt19937 rng(std::random_device{}());\nstd::uniform_int_distribution<int> dice(1, 6);\nstd::cout << dice(rng) << "\\n";',
            java: 'import java.util.concurrent.ThreadLocalRandom;\n\nint dice = ThreadLocalRandom.current().nextInt(1, 7); // 1–6\nSystem.out.println(dice);',
        },
    },
    {
        id: "datetime",
        title: { TR: "Tarih ve saat", EN: "Date and time" },
        keywords: "tarih date saat time şimdi now bugün today zaman timestamp format biçimlendir",
        code: {
            python: 'from datetime import datetime, timedelta\n\nnow = datetime.now()\nprint(now.strftime("%d.%m.%Y %H:%M"))\nprint((now + timedelta(days=7)).date())',
            javascript: 'const now = new Date();\nconsole.log(now.toLocaleString("tr-TR"));\nconst nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);\nconsole.log(nextWeek.toISOString().slice(0, 10));',
            csharp: 'DateTime now = DateTime.Now;\nConsole.WriteLine(now.ToString("dd.MM.yyyy HH:mm"));\nConsole.WriteLine(now.AddDays(7).ToShortDateString());',
            cpp: '#include <chrono>\n#include <ctime>\n\nstd::time_t now = std::time(nullptr);\nstd::cout << std::ctime(&now);',
            java: 'import java.time.*;\nimport java.time.format.DateTimeFormatter;\n\nLocalDateTime now = LocalDateTime.now();\nSystem.out.println(now.format(DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm")));\nSystem.out.println(LocalDate.now().plusDays(7));',
        },
    },
    {
        id: "factorial",
        title: { TR: "Faktöriyel (özyineleme)", EN: "Factorial (recursion)" },
        keywords: "faktöriyel factorial özyineleme recursion recursive n!",
        code: {
            python: 'def factorial(n: int) -> int:\n    return 1 if n <= 1 else n * factorial(n - 1)\n\nprint(factorial(10))  # 3628800',
            javascript: 'const factorial = (n) => (n <= 1n ? 1n : n * factorial(n - 1n));\nconsole.log(factorial(20n).toString()); // BigInt ile taşma olmaz',
            csharp: 'static long Factorial(int n) => n <= 1 ? 1 : n * Factorial(n - 1);\n\nConsole.WriteLine(Factorial(10)); // 3628800',
            cpp: 'unsigned long long factorial(int n) {\n    return n <= 1 ? 1 : n * factorial(n - 1);\n}',
            java: 'static long factorial(int n) {\n    return n <= 1 ? 1 : n * factorial(n - 1);\n}',
        },
    },
    {
        id: "fibonacci",
        title: { TR: "Fibonacci dizisi", EN: "Fibonacci sequence" },
        keywords: "fibonacci fib dizi sequence seri",
        code: {
            python: 'def fibonacci(count: int) -> list[int]:\n    a, b = 0, 1\n    result = []\n    for _ in range(count):\n        result.append(a)\n        a, b = b, a + b\n    return result\n\nprint(fibonacci(10))',
            javascript: 'function fibonacci(count) {\n    const result = [];\n    let [a, b] = [0, 1];\n    for (let i = 0; i < count; i++) {\n        result.push(a);\n        [a, b] = [b, a + b];\n    }\n    return result;\n}\nconsole.log(fibonacci(10));',
            csharp: 'static IEnumerable<long> Fibonacci(int count)\n{\n    long a = 0, b = 1;\n    for (int i = 0; i < count; i++)\n    {\n        yield return a;\n        (a, b) = (b, a + b);\n    }\n}\n\nConsole.WriteLine(string.Join(", ", Fibonacci(10)));',
            cpp: 'long long a = 0, b = 1;\nfor (int i = 0; i < 10; i++) {\n    std::cout << a << " ";\n    long long next = a + b;\n    a = b;\n    b = next;\n}',
            java: 'long a = 0, b = 1;\nfor (int i = 0; i < 10; i++) {\n    System.out.print(a + " ");\n    long next = a + b;\n    a = b;\n    b = next;\n}',
        },
    },
    {
        id: "prime",
        title: { TR: "Asal sayı kontrolü", EN: "Prime number check" },
        keywords: "asal prime sayı number kontrol check bölen divisor",
        code: {
            python: 'def is_prime(n: int) -> bool:\n    if n < 2:\n        return False\n    i = 2\n    while i * i <= n:\n        if n % i == 0:\n            return False\n        i += 1\n    return True\n\nprint([n for n in range(30) if is_prime(n)])',
            javascript: 'function isPrime(n) {\n    if (n < 2) return false;\n    for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;\n    return true;\n}\nconsole.log([...Array(30).keys()].filter(isPrime));',
            csharp: 'static bool IsPrime(int n)\n{\n    if (n < 2) return false;\n    for (int i = 2; i * i <= n; i++) if (n % i == 0) return false;\n    return true;\n}',
            cpp: 'bool isPrime(int n) {\n    if (n < 2) return false;\n    for (int i = 2; i * i <= n; i++) if (n % i == 0) return false;\n    return true;\n}',
            java: 'static boolean isPrime(int n) {\n    if (n < 2) return false;\n    for (int i = 2; i * i <= n; i++) if (n % i == 0) return false;\n    return true;\n}',
        },
    },
    {
        id: "palindrome",
        title: { TR: "Palindrom kontrolü", EN: "Palindrome check" },
        keywords: "palindrom palindrome tersten aynı kelime word",
        code: {
            python: 'def is_palindrome(text: str) -> bool:\n    clean = "".join(ch.lower() for ch in text if ch.isalnum())\n    return clean == clean[::-1]\n\nprint(is_palindrome("Ey Edip Adana\'da pide ye"))  # True',
            javascript: 'const isPalindrome = (text) => {\n    const clean = text.toLocaleLowerCase("tr").replace(/[^\\p{L}\\p{N}]/gu, "");\n    return clean === [...clean].reverse().join("");\n};\nconsole.log(isPalindrome("Ey Edip Adana\'da pide ye")); // true',
            csharp: 'static bool IsPalindrome(string text)\n{\n    var clean = new string(text.Where(char.IsLetterOrDigit).Select(char.ToLower).ToArray());\n    return clean.SequenceEqual(clean.Reverse());\n}',
            cpp: 'bool isPalindrome(const std::string& s) {\n    int i = 0, j = (int)s.size() - 1;\n    while (i < j) if (s[i++] != s[j--]) return false;\n    return true;\n}',
            java: 'static boolean isPalindrome(String text) {\n    String clean = text.toLowerCase().replaceAll("[^\\\\p{L}\\\\p{N}]", "");\n    return new StringBuilder(clean).reverse().toString().equals(clean);\n}',
        },
    },
    {
        id: "json",
        title: { TR: "JSON okuma ve yazma", EN: "Parsing and writing JSON" },
        keywords: "json parse stringify serialize deserialize nesne object dönüştür convert",
        code: {
            python: 'import json\n\ndata = json.loads(\'{"name": "Ali", "skills": ["python"]}\')\ndata["skills"].append("c#")\nprint(json.dumps(data, ensure_ascii=False, indent=2))',
            javascript: 'const data = JSON.parse(\'{"name": "Ali", "skills": ["python"]}\');\ndata.skills.push("c#");\nconsole.log(JSON.stringify(data, null, 2));',
            csharp: 'using System.Text.Json;\n\nrecord Person(string Name, List<string> Skills);\n\nvar person = JsonSerializer.Deserialize<Person>("{\\"Name\\":\\"Ali\\",\\"Skills\\":[\\"python\\"]}");\nConsole.WriteLine(JsonSerializer.Serialize(person));',
            cpp: '// C++ standart kütüphanesinde JSON yok; popüler seçim nlohmann/json:\n#include <nlohmann/json.hpp>\n\nauto data = nlohmann::json::parse(R"({"name": "Ali", "skills": ["python"]})");\ndata["skills"].push_back("c#");\nstd::cout << data.dump(2);',
            java: '// Java standart kütüphanesinde JSON yok; yaygın seçim Jackson:\nObjectMapper mapper = new ObjectMapper();\nMap<?, ?> data = mapper.readValue("{\\"name\\":\\"Ali\\"}", Map.class);\nSystem.out.println(mapper.writeValueAsString(data));',
        },
    },
    {
        id: "http",
        title: { TR: "HTTP isteği (GET)", EN: "HTTP request (GET)" },
        keywords: "http istek request get fetch api rest web url indir download axios requests",
        note: { TR: "Hanogt çalıştırıcılarında ağ erişimi kapalıdır; bu örnekleri kendi bilgisayarında dene.", EN: "Network access is disabled in the Hanogt runners; try these on your own machine." },
        code: {
            python: 'import json\nimport urllib.request\n\nwith urllib.request.urlopen("https://api.github.com/repos/python/cpython") as response:\n    data = json.load(response)\nprint(data["stargazers_count"])',
            javascript: 'const response = await fetch("https://api.github.com/repos/nodejs/node");\nif (!response.ok) throw new Error(`HTTP ${response.status}`);\nconst data = await response.json();\nconsole.log(data.stargazers_count);',
            csharp: 'using var client = new HttpClient();\nclient.DefaultRequestHeaders.UserAgent.ParseAdd("hanogt-example");\nstring json = await client.GetStringAsync("https://api.github.com/repos/dotnet/runtime");\nConsole.WriteLine(json.Length);',
            cpp: '// Standart C++\'ta HTTP yok; libcurl ile:\n#include <curl/curl.h>\n\nCURL* curl = curl_easy_init();\ncurl_easy_setopt(curl, CURLOPT_URL, "https://example.com");\ncurl_easy_perform(curl);\ncurl_easy_cleanup(curl);',
            java: 'import java.net.URI;\nimport java.net.http.*;\n\nHttpClient client = HttpClient.newHttpClient();\nHttpRequest request = HttpRequest.newBuilder(URI.create("https://example.com")).build();\nHttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());\nSystem.out.println(response.statusCode());',
        },
    },
    {
        id: "split-join",
        title: { TR: "Metni bölme ve birleştirme", EN: "Splitting and joining strings" },
        keywords: "böl bölme bölünür ayır parçala split join birleştir string metin kelimelere virgül comma separator ayraç",
        code: {
            python: 'text = "elma,armut,kiraz"\nparts = text.split(",")        # [\'elma\', \'armut\', \'kiraz\']\nprint(" | ".join(parts))     # elma | armut | kiraz\nwords = "merhaba dünya".split()  # boşluklara göre',
            javascript: 'const text = "elma,armut,kiraz";\nconst parts = text.split(",");      // ["elma", "armut", "kiraz"]\nconsole.log(parts.join(" | "));     // elma | armut | kiraz\nconst words = "merhaba  dünya".split(/\\s+/);',
            csharp: 'string text = "elma,armut,kiraz";\nstring[] parts = text.Split(\',\');\nConsole.WriteLine(string.Join(" | ", parts));\nstring[] words = "merhaba dünya".Split(\' \', StringSplitOptions.RemoveEmptyEntries);',
            cpp: '#include <sstream>\n\nstd::string text = "elma,armut,kiraz", part;\nstd::vector<std::string> parts;\nstd::istringstream in(text);\nwhile (std::getline(in, part, \',\')) parts.push_back(part);',
            java: 'String text = "elma,armut,kiraz";\nString[] parts = text.split(",");\nSystem.out.println(String.join(" | ", parts));\nString[] words = "merhaba  dünya".split("\\\\s+");',
        },
    },
    {
        id: "convert",
        title: { TR: "Metin ↔ sayı dönüşümü", EN: "String ↔ number conversion" },
        keywords: "dönüştür convert string int sayı number parse tostring metin çevir cast",
        code: {
            python: 'number = int("42")\nprice = float("3.14")\ntext = str(99)\nprint(number + 1, price * 2, text + "!")',
            javascript: 'const number = Number("42");\nconst price = parseFloat("3.14");\nconst text = String(99);\nconsole.log(number + 1, price * 2, text + "!", Number.isNaN(Number("abc")));',
            csharp: 'int number = int.Parse("42");\nbool ok = double.TryParse("3,14", out double price);\nstring text = 99.ToString();',
            cpp: 'int number = std::stoi("42");\ndouble price = std::stod("3.14");\nstd::string text = std::to_string(99);',
            java: 'int number = Integer.parseInt("42");\ndouble price = Double.parseDouble("3.14");\nString text = String.valueOf(99);',
        },
    },
    {
        id: "remove-duplicates",
        title: { TR: "Tekrar edenleri silme", EN: "Removing duplicates" },
        keywords: "tekrar eden duplicate benzersiz unique set sil remove distinct kopya",
        code: {
            python: 'items = [3, 1, 3, 2, 1]\nprint(list(dict.fromkeys(items)))  # sırayı korur: [3, 1, 2]\nprint(set(items))',
            javascript: 'const items = [3, 1, 3, 2, 1];\nconsole.log([...new Set(items)]); // [3, 1, 2]',
            csharp: 'var items = new List<int> { 3, 1, 3, 2, 1 };\nvar unique = items.Distinct().ToList(); // 3, 1, 2',
            cpp: '#include <set>\n\nstd::vector<int> items = {3, 1, 3, 2, 1};\nstd::set<int> unique(items.begin(), items.end()); // 1, 2, 3 (sıralı)',
            java: 'List<Integer> items = List.of(3, 1, 3, 2, 1);\nList<Integer> unique = items.stream().distinct().toList(); // [3, 1, 2]',
        },
    },
    {
        id: "fizzbuzz",
        title: { TR: "FizzBuzz", EN: "FizzBuzz" },
        keywords: "fizzbuzz fizz buzz mülakat interview 3 ve 5",
        code: {
            python: 'for i in range(1, 16):\n    print("Fizz" * (i % 3 == 0) + "Buzz" * (i % 5 == 0) or i)',
            javascript: 'for (let i = 1; i <= 15; i++) {\n    console.log((i % 3 ? "" : "Fizz") + (i % 5 ? "" : "Buzz") || i);\n}',
            csharp: 'for (int i = 1; i <= 15; i++)\n{\n    string s = (i % 3 == 0 ? "Fizz" : "") + (i % 5 == 0 ? "Buzz" : "");\n    Console.WriteLine(s == "" ? i.ToString() : s);\n}',
            cpp: 'for (int i = 1; i <= 15; i++) {\n    if (i % 15 == 0) std::cout << "FizzBuzz\\n";\n    else if (i % 3 == 0) std::cout << "Fizz\\n";\n    else if (i % 5 == 0) std::cout << "Buzz\\n";\n    else std::cout << i << "\\n";\n}',
            java: 'for (int i = 1; i <= 15; i++) {\n    String s = (i % 3 == 0 ? "Fizz" : "") + (i % 5 == 0 ? "Buzz" : "");\n    System.out.println(s.isEmpty() ? String.valueOf(i) : s);\n}',
        },
    },
    {
        id: "binary-search",
        title: { TR: "İkili arama", EN: "Binary search" },
        keywords: "ikili arama binary search algoritma algorithm sıralı dizide arama sorted bsearch",
        code: {
            python: 'def binary_search(items: list[int], target: int) -> int:\n    low, high = 0, len(items) - 1\n    while low <= high:\n        mid = (low + high) // 2\n        if items[mid] == target:\n            return mid\n        if items[mid] < target:\n            low = mid + 1\n        else:\n            high = mid - 1\n    return -1',
            javascript: 'function binarySearch(items, target) {\n    let low = 0, high = items.length - 1;\n    while (low <= high) {\n        const mid = (low + high) >> 1;\n        if (items[mid] === target) return mid;\n        if (items[mid] < target) low = mid + 1; else high = mid - 1;\n    }\n    return -1;\n}',
            csharp: 'int[] items = { 1, 3, 5, 7, 9 };\nint index = Array.BinarySearch(items, 7); // 3',
            cpp: '#include <algorithm>\n\nstd::vector<int> items = {1, 3, 5, 7, 9};\nbool found = std::binary_search(items.begin(), items.end(), 7);\nauto it = std::lower_bound(items.begin(), items.end(), 7); // konum',
            java: 'import java.util.Arrays;\n\nint[] items = {1, 3, 5, 7, 9};\nint index = Arrays.binarySearch(items, 7); // 3',
        },
    },
    {
        id: "bubble-sort",
        title: { TR: "Kabarcık sıralaması", EN: "Bubble sort" },
        keywords: "kabarcık bubble sort sıralama algoritması sorting algorithm",
        code: {
            python: 'def bubble_sort(items: list[int]) -> list[int]:\n    items = items[:]\n    for end in range(len(items) - 1, 0, -1):\n        for i in range(end):\n            if items[i] > items[i + 1]:\n                items[i], items[i + 1] = items[i + 1], items[i]\n    return items',
            javascript: 'function bubbleSort(input) {\n    const items = [...input];\n    for (let end = items.length - 1; end > 0; end--) {\n        for (let i = 0; i < end; i++) {\n            if (items[i] > items[i + 1]) [items[i], items[i + 1]] = [items[i + 1], items[i]];\n        }\n    }\n    return items;\n}',
            csharp: 'static void BubbleSort(int[] items)\n{\n    for (int end = items.Length - 1; end > 0; end--)\n        for (int i = 0; i < end; i++)\n            if (items[i] > items[i + 1]) (items[i], items[i + 1]) = (items[i + 1], items[i]);\n}',
            cpp: 'void bubbleSort(std::vector<int>& items) {\n    for (size_t end = items.size(); end > 1; end--)\n        for (size_t i = 0; i + 1 < end; i++)\n            if (items[i] > items[i + 1]) std::swap(items[i], items[i + 1]);\n}',
            java: 'static void bubbleSort(int[] items) {\n    for (int end = items.length - 1; end > 0; end--)\n        for (int i = 0; i < end; i++)\n            if (items[i] > items[i + 1]) { int t = items[i]; items[i] = items[i + 1]; items[i + 1] = t; }\n}',
        },
    },
    {
        id: "count-words",
        title: { TR: "Kelime sayma", EN: "Counting words" },
        keywords: "kelime say count words frekans frequency harf letter karakter character split böl",
        code: {
            python: 'from collections import Counter\n\ntext = "elma armut elma kiraz elma"\ncounts = Counter(text.split())\nprint(len(text.split()), counts.most_common(2))',
            javascript: 'const text = "elma armut elma kiraz elma";\nconst counts = {};\nfor (const word of text.split(/\\s+/)) counts[word] = (counts[word] ?? 0) + 1;\nconsole.log(counts);',
            csharp: 'string text = "elma armut elma kiraz elma";\nvar counts = text.Split(\' \', StringSplitOptions.RemoveEmptyEntries)\n    .GroupBy(w => w)\n    .ToDictionary(g => g.Key, g => g.Count());',
            cpp: '#include <sstream>\n#include <map>\n\nstd::istringstream in("elma armut elma kiraz elma");\nstd::map<std::string, int> counts;\nstd::string word;\nwhile (in >> word) counts[word]++;',
            java: 'String text = "elma armut elma kiraz elma";\nMap<String, Long> counts = Arrays.stream(text.split("\\\\s+"))\n    .collect(Collectors.groupingBy(w -> w, Collectors.counting()));',
        },
    },
    {
        id: "swap",
        title: { TR: "İki değişkeni takas etme", EN: "Swapping two variables" },
        keywords: "takas swap değiştir değişken variable yer değiştir",
        code: {
            python: 'a, b = 1, 2\na, b = b, a\nprint(a, b)  # 2 1',
            javascript: 'let a = 1, b = 2;\n[a, b] = [b, a];\nconsole.log(a, b); // 2 1',
            csharp: 'int a = 1, b = 2;\n(a, b) = (b, a);',
            cpp: 'int a = 1, b = 2;\nstd::swap(a, b);',
            java: 'int a = 1, b = 2;\nint temp = a;\na = b;\nb = temp;',
        },
    },
];

export const ENGINE_SNIPPETS: EngineSnippet[] = [
    {
        id: "engine-move-2d",
        title: { TR: "2D karakter hareketi", EN: "2D character movement" },
        keywords: "hareket move karakter character 2d yürü walk koş run ok tuşları arrow keys wasd horizontal rigidbody2d velocity",
        note: { TR: "Nesneye **Rigidbody2D** ve bir **Collider2D** ekleyip bu script'i bağla.", EN: "Add a **Rigidbody2D** and a **Collider2D** to the object and attach this script." },
        code: 'using UnityEngine;\n\npublic class PlayerMove : MonoBehaviour\n{\n    public float speed = 6f;\n    private Rigidbody2D rb;\n    private SpriteRenderer sprite;\n\n    void Start()\n    {\n        rb = GetComponent<Rigidbody2D>();\n        sprite = GetComponent<SpriteRenderer>();\n    }\n\n    void Update()\n    {\n        float h = Input.GetAxisRaw("Horizontal"); // A/D veya ←/→\n        rb.velocity = new Vector2(h * speed, rb.velocity.y);\n        if (h != 0) sprite.flipX = h < 0;\n    }\n}',
    },
    {
        id: "engine-jump",
        title: { TR: "Zıplama (yer kontrolüyle)", EN: "Jumping (with ground check)" },
        keywords: "zıpla jump zıplama jumping yer ground platform space tuşu çift zıplama double jump",
        note: { TR: "Zemin nesnelerinde de Collider2D olmalı; normal.y > 0.5 temasın alttan geldiğini gösterir.", EN: "Ground objects need a Collider2D too; normal.y > 0.5 means the contact comes from below." },
        code: 'using UnityEngine;\n\npublic class PlayerJump : MonoBehaviour\n{\n    public float jumpForce = 11f;\n    private Rigidbody2D rb;\n    private bool grounded;\n\n    void Start()\n    {\n        rb = GetComponent<Rigidbody2D>();\n    }\n\n    void Update()\n    {\n        if (grounded && (Input.GetButtonDown("Jump") || Input.GetKeyDown(KeyCode.W)))\n        {\n            rb.velocity = new Vector2(rb.velocity.x, jumpForce);\n            grounded = false;\n            Audio.Play("jump", 0.5f);\n        }\n    }\n\n    void OnCollisionStay2D(Collision2D collision)\n    {\n        if (collision.GetContact(0).normal.y > 0.5f) grounded = true;\n    }\n\n    void OnCollisionExit2D(Collision2D collision)\n    {\n        grounded = false;\n    }\n}',
    },
    {
        id: "engine-move-3d",
        title: { TR: "3D top yuvarlama (Roll-a-Ball)", EN: "3D rolling ball (Roll-a-Ball)" },
        keywords: "3d hareket move ball top yuvarla roll addforce rigidbody fizik physics",
        note: { TR: "Nesnede **Rigidbody** ve **SphereCollider** olmalı.", EN: "The object needs a **Rigidbody** and a **SphereCollider**." },
        code: 'using UnityEngine;\n\npublic class BallController : MonoBehaviour\n{\n    public float force = 12f;\n    private Rigidbody rb;\n\n    void Start()\n    {\n        rb = GetComponent<Rigidbody>();\n    }\n\n    void FixedUpdate()\n    {\n        Vector3 input = new Vector3(Input.GetAxis("Horizontal"), 0, Input.GetAxis("Vertical"));\n        rb.AddForce(input * force);\n    }\n}',
    },
    {
        id: "engine-collect",
        title: { TR: "Toplanabilir nesne (coin) ve tetikleyici", EN: "Collectible (coin) with a trigger" },
        keywords: "coin topla collect tetikleyici trigger ontriggerenter2d çarpışma collision tag player puan score destroy",
        note: { TR: "Coin'in Collider2D'sinde **Is Trigger** açık olmalı, oyuncunun etiketi **Player** olmalı.", EN: "Turn on **Is Trigger** on the coin's Collider2D and tag the player **Player**." },
        code: 'using UnityEngine;\n\npublic class Coin : MonoBehaviour\n{\n    public int value = 1;\n\n    void Update()\n    {\n        transform.Rotate(0, 180 * Time.deltaTime, 0);\n    }\n\n    void OnTriggerEnter2D(Collider2D other)\n    {\n        if (!other.CompareTag("Player")) return;\n        ScoreManager.Instance.Add(value);\n        Audio.Play("coin");\n        Destroy(gameObject);\n    }\n}',
    },
    {
        id: "engine-score",
        title: { TR: "Skor yöneticisi ve arayüz", EN: "Score manager and UI" },
        keywords: "skor score puan ui arayüz text hud singleton gamemanager instance",
        note: { TR: "Sahneye bir UI Text ekleyip **scoreText** alanına sürükle.", EN: "Add a UI Text to the scene and drag it into the **scoreText** field." },
        code: 'using UnityEngine;\nusing UnityEngine.UI;\n\npublic class ScoreManager : MonoBehaviour\n{\n    public static ScoreManager Instance;\n    public Text scoreText;\n    private int score;\n\n    void Awake()\n    {\n        Instance = this;\n    }\n\n    public void Add(int amount)\n    {\n        score += amount;\n        if (scoreText != null) scoreText.text = "Skor: " + score;\n        if (score >= 10) HUD.Show("Harika! 10 puan!", 2f);\n    }\n}',
    },
    {
        id: "engine-spawn",
        title: { TR: "Belirli aralıklarla nesne oluşturma (prefab)", EN: "Spawning objects on a timer (prefab)" },
        keywords: "spawn oluştur instantiate prefab düşman enemy aralık interval invokerepeating coroutine zamanlayıcı timer",
        note: { TR: "Hiyerarşide bir nesneye sağ tıklayıp prefab oluştur ve **prefab** alanına ata.", EN: "Right-click an object in the Hierarchy to make a prefab and assign it to the **prefab** field." },
        code: 'using UnityEngine;\n\npublic class Spawner : MonoBehaviour\n{\n    public GameObject prefab;\n    public float interval = 1.5f;\n    public float range = 6f;\n\n    void Start()\n    {\n        InvokeRepeating("Spawn", 1f, interval);\n    }\n\n    void Spawn()\n    {\n        Vector3 position = transform.position + new Vector3(Random.Range(-range, range), 0, 0);\n        GameObject clone = Instantiate(prefab, position, Quaternion.identity);\n        Destroy(clone, 8f); // 8 sn sonra temizle\n    }\n}',
    },
    {
        id: "engine-shoot",
        title: { TR: "Mermi atma", EN: "Shooting projectiles" },
        keywords: "ateş et shoot mermi bullet projectile fire instantiate hız velocity space",
        code: 'using UnityEngine;\n\npublic class Shooter : MonoBehaviour\n{\n    public GameObject bulletPrefab;\n    public float bulletSpeed = 14f;\n    public float cooldown = 0.25f;\n    private float nextShot;\n\n    void Update()\n    {\n        if (Input.GetKey(KeyCode.Space) && Time.time >= nextShot)\n        {\n            nextShot = Time.time + cooldown;\n            GameObject bullet = Instantiate(bulletPrefab, transform.position, Quaternion.identity);\n            bullet.GetComponent<Rigidbody2D>().velocity = Vector2.up * bulletSpeed;\n            Audio.Play("shoot", 0.4f);\n            Destroy(bullet, 3f);\n        }\n    }\n}',
    },
    {
        id: "engine-camera",
        title: { TR: "Kameranın oyuncuyu takip etmesi", EN: "Camera following the player" },
        keywords: "kamera camera takip follow smooth yumuşak lateupdate lerp",
        code: 'using UnityEngine;\n\npublic class CameraFollow : MonoBehaviour\n{\n    public Transform target;\n    public float smoothSpeed = 5f;\n    public Vector3 offset = new Vector3(0, 1, -10);\n\n    void LateUpdate()\n    {\n        if (target == null) return;\n        Vector3 desired = target.position + offset;\n        transform.position = Vector3.Lerp(transform.position, desired, smoothSpeed * Time.deltaTime);\n    }\n}',
    },
    {
        id: "engine-highscore",
        title: { TR: "En yüksek skoru kaydetme (PlayerPrefs)", EN: "Saving the high score (PlayerPrefs)" },
        keywords: "kaydet save en yüksek skor high score playerprefs kalıcı persist rekor record",
        note: { TR: "PlayerPrefs düz metindir; gizli bilgi saklama.", EN: "PlayerPrefs is plain text; don't store secrets in it." },
        code: 'using UnityEngine;\n\npublic class HighScore : MonoBehaviour\n{\n    public static void Submit(int score)\n    {\n        int best = PlayerPrefs.GetInt("highScore", 0);\n        if (score > best)\n        {\n            PlayerPrefs.SetInt("highScore", score);\n            HUD.Show("Yeni rekor: " + score + "!", 2.5f);\n        }\n    }\n}',
    },
    {
        id: "engine-restart",
        title: { TR: "Sahneyi yeniden başlatma / sahne değiştirme", EN: "Restarting or changing scenes" },
        keywords: "sahne scene yeniden başlat restart loadscene scenemanager seviye level game over öl die",
        code: 'using UnityEngine;\nusing UnityEngine.SceneManagement;\n\npublic class LevelControl : MonoBehaviour\n{\n    void Update()\n    {\n        if (Input.GetKeyDown(KeyCode.R)) Restart();\n        if (transform.position.y < -12f) Restart(); // düştü\n    }\n\n    public void Restart()\n    {\n        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);\n    }\n\n    public void NextLevel()\n    {\n        SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex + 1);\n    }\n}',
    },
    {
        id: "engine-coroutine",
        title: { TR: "Coroutine ile gecikmeli işlem", EN: "Delayed actions with a coroutine" },
        keywords: "coroutine ienumerator yield waitforseconds bekle wait gecikme delay zamanlama",
        code: 'using UnityEngine;\nusing System.Collections;\n\npublic class Blink : MonoBehaviour\n{\n    void Start()\n    {\n        StartCoroutine(BlinkThreeTimes());\n    }\n\n    IEnumerator BlinkThreeTimes()\n    {\n        SpriteRenderer sprite = GetComponent<SpriteRenderer>();\n        for (int i = 0; i < 3; i++)\n        {\n            sprite.enabled = false;\n            yield return new WaitForSeconds(0.15f);\n            sprite.enabled = true;\n            yield return new WaitForSeconds(0.15f);\n        }\n    }\n}',
    },
    {
        id: "engine-enemy-patrol",
        title: { TR: "Devriye gezen düşman", EN: "Patrolling enemy" },
        keywords: "düşman enemy devriye patrol yapay zeka ai git gel back and forth",
        code: 'using UnityEngine;\n\npublic class EnemyPatrol : MonoBehaviour\n{\n    public float speed = 2f;\n    public float distance = 3f;\n    private Vector3 start;\n    private int direction = 1;\n\n    void Start()\n    {\n        start = transform.position;\n    }\n\n    void Update()\n    {\n        transform.position += Vector3.right * direction * speed * Time.deltaTime;\n        if (transform.position.x > start.x + distance) direction = -1;\n        else if (transform.position.x < start.x - distance) direction = 1;\n    }\n}',
    },
];

/** Picks a snippet language from free text; null when none is mentioned. */
export function detectSnippetLanguage(text: string): SnippetLanguage | null {
    const lower = ` ${text.toLocaleLowerCase("tr")} `;
    for (const language of SNIPPET_LANGUAGES) {
        for (const alias of language.aliases) {
            const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            if (new RegExp(`(^|[^a-z0-9#+])${escaped}(?=$|[^a-z0-9#+])`, "i").test(lower)) return language.id;
        }
    }
    return null;
}

/** Maps editor language ids (e.g. "py", "cs", "ts") to snippet languages. */
export function snippetLanguageFromEditor(language: string | undefined | null): SnippetLanguage | null {
    if (!language) return null;
    const value = language.toLowerCase();
    if (["python", "py"].includes(value)) return "python";
    if (["javascript", "js", "typescript", "ts", "node"].includes(value)) return "javascript";
    if (["csharp", "cs", "c#"].includes(value)) return "csharp";
    if (["cpp", "c++", "c", "cc", "hpp"].includes(value)) return "cpp";
    if (value === "java") return "java";
    return null;
}
