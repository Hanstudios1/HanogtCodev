/**
 * Starter templates for the editor's "New file" gallery. Every language also
 * has a "Hello World" template in src/lib/runtimes/languages.ts; these are the
 * extra ones, plus multi-file project templates such as the Web project type
 * (index.html + style.css + script.js rendered together in the preview).
 */
import type { LanguageText } from "./languages";

export interface FileTemplate {
    id: string;
    language: string;
    title: LanguageText;
    description: LanguageText;
    code: string;
    /** Suggested input for the Input tab. */
    stdin?: string;
}

export interface ProjectTemplate {
    id: string;
    title: LanguageText;
    description: LanguageText;
    kind: "web" | "polyglot";
    files: ReadonlyArray<{ name: string; language: string; code: string }>;
}

export const FILE_TEMPLATES: readonly FileTemplate[] = [
    {
        id: "python-input",
        language: "python",
        title: { TR: "Girdi okuma", EN: "Reading input" },
        description: { TR: "input() ile Girdi sekmesindeki satırları okur.", EN: "Reads lines from the Input tab with input()." },
        stdin: "Ada\n20\n",
        code: "# Each input() reads one line from the Input tab.\nname = input(\"What is your name? \")\nage = int(input(\"How old are you? \"))\nprint(f\"Hello {name}! Next year you will be {age + 1}.\")\n",
    },
    {
        id: "python-classes",
        language: "python",
        title: { TR: "Sınıflar ve sıralama", EN: "Classes and sorting" },
        description: { TR: "dataclass, liste ve sıralama örneği.", EN: "A dataclass, lists and sorting." },
        code: "from dataclasses import dataclass\n\n\n@dataclass\nclass Student:\n    name: str\n    scores: list[int]\n\n    def average(self) -> float:\n        return sum(self.scores) / len(self.scores)\n\n\nstudents = [Student(\"Ada\", [90, 85, 100]), Student(\"Linus\", [70, 95, 80])]\nfor student in sorted(students, key=Student.average, reverse=True):\n    print(f\"{student.name:<6} {student.average():.1f}\")\n",
    },
    {
        id: "javascript-input",
        language: "javascript",
        title: { TR: "Girdi okuma", EN: "Reading input" },
        description: { TR: "prompt() Girdi sekmesindeki bir sonraki satırı döndürür.", EN: "prompt() returns the next line of the Input tab." },
        stdin: "Ada\n",
        code: "// prompt(), input() and readline() read lines from the Input tab.\nconst name = prompt(\"What is your name?\") ?? \"friend\";\nconsole.log(`Hello ${name}!`);\n",
    },
    {
        id: "javascript-arrays",
        language: "javascript",
        title: { TR: "Diziler ve async", EN: "Arrays and async" },
        description: { TR: "map, reduce, sıralama ve üst düzey await.", EN: "map, reduce, sorting and top-level await." },
        code: "const numbers = [5, 3, 8, 1, 9, 2];\nconst sorted = [...numbers].sort((a, b) => a - b);\nconsole.log(\"sorted:\", sorted);\nconsole.log(\"sum:\", numbers.reduce((total, n) => total + n, 0));\nconsole.log(\"squares:\", numbers.map((n) => n * n));\n\nconst wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));\nawait wait(200);\nconsole.log(\"done after 200 ms\");\n",
    },
    {
        id: "typescript-generics",
        language: "typescript",
        title: { TR: "Arayüzler ve generic'ler", EN: "Interfaces and generics" },
        description: { TR: "interface, class ve generic fonksiyon.", EN: "An interface, a class and a generic function." },
        code: "interface Shape {\n  name: string;\n  area(): number;\n}\n\nclass Circle implements Shape {\n  name = \"circle\";\n  constructor(private radius: number) {}\n  area(): number {\n    return Math.PI * this.radius ** 2;\n  }\n}\n\nfunction largest<T extends Shape>(shapes: T[]): T | undefined {\n  return shapes.reduce<T | undefined>((best, shape) => (!best || shape.area() > best.area() ? shape : best), undefined);\n}\n\nconst shapes: Shape[] = [new Circle(1), { name: \"square\", area: () => 4 }];\nconsole.log(largest(shapes)?.name);\n",
    },
    {
        id: "java-scanner",
        language: "java",
        title: { TR: "Scanner ile girdi", EN: "Input with Scanner" },
        description: { TR: "Girdi sekmesinden bir satır okur.", EN: "Reads a line from the Input tab." },
        stdin: "Ada\n",
        code: "import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner scanner = new Scanner(System.in);\n        System.out.print(\"Name: \");\n        String name = scanner.hasNextLine() ? scanner.nextLine() : \"friend\";\n        System.out.println(\"Hello, \" + name + \"!\");\n    }\n}\n",
    },
    {
        id: "cpp-vector",
        language: "cpp",
        title: { TR: "cin ve vector", EN: "cin and vector" },
        description: { TR: "Sayıları okur, sıralar ve yazdırır.", EN: "Reads numbers, sorts and prints them." },
        stdin: "5\n4 2 9 1 7\n",
        code: "#include <algorithm>\n#include <iostream>\n#include <vector>\n\nint main() {\n    int count = 0;\n    std::cin >> count;\n    std::vector<int> numbers(count);\n    for (int& number : numbers) std::cin >> number;\n    std::sort(numbers.begin(), numbers.end());\n    for (int number : numbers) std::cout << number << ' ';\n    std::cout << '\\n';\n    return 0;\n}\n",
    },
    {
        id: "c-scanf",
        language: "c",
        title: { TR: "scanf ile girdi", EN: "Input with scanf" },
        description: { TR: "İki sayı okuyup toplar.", EN: "Reads two numbers and adds them." },
        stdin: "3 4\n",
        code: "#include <stdio.h>\n\nint main(void) {\n    int a, b;\n    if (scanf(\"%d %d\", &a, &b) != 2) {\n        printf(\"Enter two numbers in the Input tab.\\n\");\n        return 1;\n    }\n    printf(\"%d + %d = %d\\n\", a, b, a + b);\n    return 0;\n}\n",
    },
    {
        id: "csharp-linq",
        language: "csharp",
        title: { TR: "ReadLine ve LINQ", EN: "ReadLine and LINQ" },
        description: { TR: "Sayıları okur, toplam ve en büyüğü hesaplar.", EN: "Reads numbers and computes the sum and maximum." },
        stdin: "4 8 15 16 23 42\n",
        code: "using System;\nusing System.Linq;\n\nclass Program\n{\n    static void Main()\n    {\n        var numbers = (Console.ReadLine() ?? \"\")\n            .Split(' ', StringSplitOptions.RemoveEmptyEntries)\n            .Select(int.Parse)\n            .ToList();\n        Console.WriteLine($\"Sum: {numbers.Sum()}, Max: {(numbers.Count > 0 ? numbers.Max() : 0)}\");\n    }\n}\n",
    },
    {
        id: "go-goroutines",
        language: "go",
        title: { TR: "Goroutine'ler", EN: "Goroutines" },
        description: { TR: "WaitGroup ile paralel hesaplama.", EN: "Parallel work with a WaitGroup." },
        code: "package main\n\nimport (\n\t\"fmt\"\n\t\"sync\"\n)\n\nfunc main() {\n\tvar wg sync.WaitGroup\n\tresults := make([]int, 5)\n\tfor i := range results {\n\t\twg.Add(1)\n\t\tgo func(i int) {\n\t\t\tdefer wg.Done()\n\t\t\tresults[i] = i * i\n\t\t}(i)\n\t}\n\twg.Wait()\n\tfmt.Println(results)\n}\n",
    },
    {
        id: "rust-traits",
        language: "rust",
        title: { TR: "Struct ve trait", EN: "Structs and traits" },
        description: { TR: "Trait nesneleriyle alan hesabı.", EN: "Computing areas with trait objects." },
        code: "trait Shape {\n    fn area(&self) -> f64;\n}\n\nstruct Circle {\n    radius: f64,\n}\n\nstruct Square {\n    side: f64,\n}\n\nimpl Shape for Circle {\n    fn area(&self) -> f64 {\n        std::f64::consts::PI * self.radius * self.radius\n    }\n}\n\nimpl Shape for Square {\n    fn area(&self) -> f64 {\n        self.side * self.side\n    }\n}\n\nfn main() {\n    let shapes: Vec<Box<dyn Shape>> = vec![Box::new(Circle { radius: 1.0 }), Box::new(Square { side: 2.0 })];\n    for shape in &shapes {\n        println!(\"{:.2}\", shape.area());\n    }\n}\n",
    },
    {
        id: "sql-joins",
        language: "sql",
        title: { TR: "JOIN ve gruplama", EN: "Joins and grouping" },
        description: { TR: "İki tabloyu birleştirip ortalama alır.", EN: "Joins two tables and computes averages." },
        code: "CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL);\nCREATE TABLE scores (student_id INTEGER, subject TEXT, score INTEGER);\n\nINSERT INTO students VALUES (1, 'Ada'), (2, 'Linus');\nINSERT INTO scores VALUES (1, 'Math', 95), (1, 'Physics', 88), (2, 'Math', 72), (2, 'Physics', 91);\n\nSELECT s.name, ROUND(AVG(sc.score), 1) AS average, COUNT(*) AS exams\nFROM students s\nJOIN scores sc ON sc.student_id = s.id\nGROUP BY s.id\nORDER BY average DESC;\n",
    },
    {
        id: "lua-tables",
        language: "lua",
        title: { TR: "Tablolar", EN: "Tables" },
        description: { TR: "Lua tabloları ve döngüler.", EN: "Lua tables and loops." },
        code: "local inventory = { apples = 3, pears = 5 }\ninventory.plums = 2\n\nlocal total = 0\nfor fruit, count in pairs(inventory) do\n  print(fruit, count)\n  total = total + count\nend\nprint(\"total\", total)\n",
    },
    {
        id: "scheme-higher-order",
        language: "scheme",
        title: { TR: "Yüksek dereceli fonksiyonlar ve akışlar", EN: "Higher-order functions and streams" },
        description: { TR: "map/filter/fold ve SICP tarzı sonsuz akış.", EN: "map/filter/fold and an infinite SICP-style stream." },
        code: ";; map, filter and folds\n(define numbers (iota 10 1))\n(display (filter odd? numbers))\n(newline)\n(display (fold-left + 0 (map square numbers)))\n(newline)\n\n;; An infinite stream of Fibonacci numbers (SICP 3.5)\n(define (fibgen a b)\n  (cons-stream a (fibgen b (+ a b))))\n\n(stream-head (fibgen 0 1) 15)\n",
    },
    {
        id: "scheme-macros",
        language: "scheme",
        title: { TR: "Makrolar ve kayıtlar", EN: "Macros and records" },
        description: { TR: "syntax-rules makrosu ve define-record-type.", EN: "A syntax-rules macro and define-record-type." },
        code: "(define-syntax swap!\n  (syntax-rules ()\n    ((_ a b) (let ((tmp a)) (set! a b) (set! b tmp)))))\n\n(define x 1)\n(define y 2)\n(swap! x y)\n(list x y)\n\n(define-record-type point\n  (make-point x y)\n  point?\n  (x point-x)\n  (y point-y))\n\n(define p (make-point 3 4))\n(sqrt (+ (square (point-x p)) (square (point-y p))))\n",
    },
    {
        id: "brainfuck-cat",
        language: "brainfuck",
        title: { TR: "Girdiyi yansıt", EN: "Echo the input" },
        description: { TR: "Girdi sekmesindeki metni aynen yazdırır.", EN: "Prints the text of the Input tab." },
        stdin: "Merhaba Hanogt\n",
        // Comments must not contain any of the eight commands.
        code: "Copies every byte of the Input tab to the output\n,[.,]\n",
    },
    {
        id: "markdown-readme",
        language: "markdown",
        title: { TR: "Proje README'si", EN: "Project README" },
        description: { TR: "Başlık, rozet, kurulum ve tablo içeren README.", EN: "A README with a title, install steps and a table." },
        code: "# My Project\n\nA short description of what the project does and who it is for.\n\n## Getting started\n\n1. Open the project in **Hanogt Codev**.\n2. Press `Ctrl+Enter` to run it.\n3. Share it with your group.\n\n## Commands\n\n| Shortcut | Action |\n| --- | --- |\n| `Ctrl+Enter` | Run |\n| `Ctrl+S` | Save |\n| `Ctrl+K` | Quick actions |\n\n## License\n\nMIT\n",
    },
];

const WEB_INDEX = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Hanogt Web</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <main class=\"card\">\n    <h1>Hello World from Hanogt!</h1>\n    <p>Edit <code>index.html</code>, <code>style.css</code> and <code>script.js</code>; the preview updates as you type.</p>\n    <button id=\"counter\" type=\"button\">Clicked 0 times</button>\n  </main>\n  <script src=\"script.js\"></script>\n</body>\n</html>\n";

const WEB_STYLE = ":root {\n  font-family: system-ui, -apple-system, \"Segoe UI\", sans-serif;\n}\n\nbody {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  background: linear-gradient(135deg, #312e81, #701a75);\n}\n\n.card {\n  max-width: 28rem;\n  margin: 1rem;\n  padding: 2rem;\n  border-radius: 1.5rem;\n  background: rgba(255, 255, 255, 0.94);\n  color: #18181b;\n  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);\n  text-align: center;\n}\n\nbutton {\n  border: 0;\n  border-radius: 999px;\n  padding: 0.75rem 1.5rem;\n  font: inherit;\n  font-weight: 600;\n  color: white;\n  background: linear-gradient(90deg, #6366f1, #d946ef);\n  cursor: pointer;\n}\n";

const WEB_SCRIPT = "const button = document.getElementById(\"counter\");\nlet clicks = 0;\n\nbutton.addEventListener(\"click\", () => {\n  clicks += 1;\n  button.textContent = `Clicked ${clicks} ${clicks === 1 ? \"time\" : \"times\"}`;\n  console.log(\"Button clicked\", clicks);\n});\n";

const TODO_INDEX = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>To-do</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <main>\n    <h1>To-do</h1>\n    <form id=\"form\">\n      <input id=\"task\" placeholder=\"Add a task\" autocomplete=\"off\" required>\n      <button type=\"submit\">Add</button>\n    </form>\n    <ul id=\"list\"></ul>\n    <p id=\"summary\"></p>\n  </main>\n  <script src=\"script.js\"></script>\n</body>\n</html>\n";

const TODO_STYLE = "body {\n  font-family: system-ui, sans-serif;\n  background: #f4f4f5;\n  color: #18181b;\n  display: flex;\n  justify-content: center;\n  padding: 2rem 1rem;\n}\n\nmain {\n  width: min(28rem, 100%);\n}\n\nform {\n  display: flex;\n  gap: 0.5rem;\n}\n\ninput {\n  flex: 1;\n  padding: 0.6rem 0.8rem;\n  border: 1px solid #d4d4d8;\n  border-radius: 0.75rem;\n  font: inherit;\n}\n\nbutton {\n  border: 0;\n  border-radius: 0.75rem;\n  padding: 0.6rem 1rem;\n  background: #4f46e5;\n  color: white;\n  font: inherit;\n  cursor: pointer;\n}\n\nli {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  padding: 0.5rem 0;\n  border-bottom: 1px solid #e4e4e7;\n}\n\nli.done span {\n  text-decoration: line-through;\n  color: #a1a1aa;\n}\n";

const TODO_SCRIPT = "const form = document.getElementById(\"form\");\nconst input = document.getElementById(\"task\");\nconst list = document.getElementById(\"list\");\nconst summary = document.getElementById(\"summary\");\nconst tasks = [];\n\nfunction render() {\n  list.replaceChildren(...tasks.map((task, index) => {\n    const item = document.createElement(\"li\");\n    item.className = task.done ? \"done\" : \"\";\n    const checkbox = document.createElement(\"input\");\n    checkbox.type = \"checkbox\";\n    checkbox.checked = task.done;\n    checkbox.addEventListener(\"change\", () => {\n      tasks[index].done = checkbox.checked;\n      render();\n    });\n    const text = document.createElement(\"span\");\n    text.textContent = task.text;\n    item.append(checkbox, text);\n    return item;\n  }));\n  const left = tasks.filter((task) => !task.done).length;\n  summary.textContent = `${left} of ${tasks.length} left`;\n}\n\nform.addEventListener(\"submit\", (event) => {\n  event.preventDefault();\n  const text = input.value.trim();\n  if (!text) return;\n  tasks.push({ text, done: false });\n  console.log(\"Added:\", text);\n  input.value = \"\";\n  render();\n});\n\nrender();\n";

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
    {
        id: "web-starter",
        kind: "web",
        title: { TR: "Web projesi (HTML + CSS + JS)", EN: "Web project (HTML + CSS + JS)" },
        description: { TR: "index.html, style.css ve script.js birlikte canlı önizlemede çalışır.", EN: "index.html, style.css and script.js run together in the live preview." },
        files: [
            { name: "index.html", language: "html", code: WEB_INDEX },
            { name: "style.css", language: "css", code: WEB_STYLE },
            { name: "script.js", language: "javascript", code: WEB_SCRIPT },
        ],
    },
    {
        id: "web-todo",
        kind: "web",
        title: { TR: "Yapılacaklar uygulaması", EN: "To-do app" },
        description: { TR: "Form, liste ve DOM olaylarıyla küçük bir web uygulaması.", EN: "A small web app with a form, a list and DOM events." },
        files: [
            { name: "index.html", language: "html", code: TODO_INDEX },
            { name: "style.css", language: "css", code: TODO_STYLE },
            { name: "script.js", language: "javascript", code: TODO_SCRIPT },
        ],
    },
    {
        id: "polyglot",
        kind: "polyglot",
        title: { TR: "Çok dilli proje", EN: "Polyglot project" },
        description: { TR: "Python, JavaScript, Scheme ve Lua dosyaları tek tıkla paralel çalışır.", EN: "Python, JavaScript, Scheme and Lua files run in parallel with one click." },
        files: [
            { name: "main.py", language: "python", code: "print(\"Hello from Python!\")\n" },
            { name: "main.js", language: "javascript", code: "console.log(\"Hello from JavaScript!\");\n" },
            { name: "main.scm", language: "scheme", code: "(display \"Hello from Scheme!\")\n(newline)\n" },
            { name: "main.lua", language: "lua", code: "print(\"Hello from Lua!\")\n" },
        ],
    },
];

export function templatesForLanguage(language: string): FileTemplate[] {
    return FILE_TEMPLATES.filter((template) => template.language === language);
}
