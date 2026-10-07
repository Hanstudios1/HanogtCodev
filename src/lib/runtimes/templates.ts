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
    /**
     * "web": an HTML page with its stylesheet and script (opens the preview);
     * "docs": Markdown, Mermaid and LaTeX files, each previewed on its own;
     * "polyglot": programs in several languages (opens the console).
     */
    kind: "web" | "docs" | "polyglot";
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
        id: "prolog-family",
        language: "prolog",
        title: { TR: "Aile ağacı ve sorgular", EN: "Family tree and queries" },
        description: { TR: "Olgular, kurallar ve ?- sorgularıyla geri izleme.", EN: "Facts, rules and backtracking with ?- queries." },
        code: "% Facts\nparent(tom, bob).\nparent(tom, liz).\nparent(bob, ann).\nparent(bob, pat).\nparent(pat, jim).\n\n% Rules\ngrandparent(X, Z) :- parent(X, Y), parent(Y, Z).\nancestor(X, Y) :- parent(X, Y).\nancestor(X, Y) :- parent(X, Z), ancestor(Z, Y).\nsibling(X, Y) :- parent(P, X), parent(P, Y), X \\= Y.\n\n% Each query prints all of its answers, like the Prolog top level.\n?- grandparent(tom, Who).\n?- ancestor(tom, jim).\n?- sibling(ann, S).\n?- findall(D, ancestor(bob, D), Descendants).\n",
    },
    {
        id: "prolog-lists",
        language: "prolog",
        title: { TR: "Listeler ve özyineleme", EN: "Lists and recursion" },
        description: { TR: "Kendi length/sum/reverse yüklemleriniz ve read/1 ile girdi.", EN: "Your own length/sum/reverse predicates and input with read/1." },
        stdin: "[3, 1, 4, 1, 5, 9].\n",
        code: ":- initialization(main).\n\nmy_length([], 0).\nmy_length([_|T], N) :- my_length(T, M), N is M + 1.\n\nmy_sum([], 0).\nmy_sum([H|T], S) :- my_sum(T, R), S is H + R.\n\nmy_reverse(L, R) :- my_reverse(L, [], R).\nmy_reverse([], Acc, Acc).\nmy_reverse([H|T], Acc, R) :- my_reverse(T, [H|Acc], R).\n\nmain :-\n    read(List),\n    my_length(List, N),\n    my_sum(List, S),\n    my_reverse(List, R),\n    msort(List, Sorted),\n    format(\"length: ~w, sum: ~w~n\", [N, S]),\n    format(\"reversed: ~w~nsorted: ~w~n\", [R, Sorted]).\n",
    },
    {
        id: "forth-fizzbuzz",
        language: "forth",
        title: { TR: "FizzBuzz ve özyineleme", EN: "FizzBuzz and recursion" },
        description: { TR: "IF/ELSE, DO döngüsü ve RECURSE ile faktöriyel.", EN: "IF/ELSE, a DO loop and a factorial with RECURSE." },
        code: "\\ FizzBuzz from 1 to 15\n: fizzbuzz ( n -- )\n  dup 15 mod 0= if drop .\" FizzBuzz \" exit then\n  dup 3 mod 0= if drop .\" Fizz \" exit then\n  dup 5 mod 0= if drop .\" Buzz \" exit then\n  . ;\n: run ( -- ) 16 1 do i fizzbuzz loop cr ;\nrun\n\n\\ Factorial with RECURSE\n: fact ( n -- n! ) dup 1 > if dup 1- recurse * else drop 1 then ;\n10 fact . cr\n",
    },
    {
        id: "forth-input",
        language: "forth",
        title: { TR: "Girdi okuma", EN: "Reading input" },
        description: { TR: "ACCEPT ile bir satır okur, EVALUATE ile sayıya çevirir.", EN: "Reads a line with ACCEPT and turns it into numbers with EVALUATE." },
        stdin: "7 6\n",
        code: "\\ Reads \"a b\" from the Input tab and prints their product.\ncreate line 80 allot\nline 80 accept   ( -- length )\nline swap evaluate  ( -- a b )\n.\" Product: \" * . cr\n",
    },
    {
        id: "basic-guess",
        language: "basic",
        title: { TR: "Sayı tahmin oyunu", EN: "Number guessing game" },
        description: { TR: "INPUT, DO … LOOP ve IF … ELSEIF bloğu.", EN: "INPUT, DO … LOOP and an IF … ELSEIF block." },
        stdin: "50\n25\n37\n42\n",
        code: "secret = 42\ntries = 0\nPRINT \"Guess the number between 1 and 100.\"\nDO\n    INPUT \"Your guess\"; guess\n    tries = tries + 1\n    IF guess < secret THEN\n        PRINT \"Too small!\"\n    ELSEIF guess > secret THEN\n        PRINT \"Too big!\"\n    ELSE\n        PRINT \"Correct in\"; tries; \"tries.\"\n    END IF\nLOOP UNTIL guess = secret\n",
    },
    {
        id: "basic-classic",
        language: "basic",
        title: { TR: "Klasik satır numaralı BASIC", EN: "Classic line-numbered BASIC" },
        description: { TR: "GOSUB/RETURN, DATA/READ ve GOTO.", EN: "GOSUB/RETURN, DATA/READ and GOTO." },
        code: "10 REM Average of the numbers in the DATA lines\n20 TOTAL = 0\n30 FOR I = 1 TO 5\n40 READ N\n50 GOSUB 200\n60 NEXT I\n70 PRINT \"Average:\"; TOTAL / 5\n80 END\n200 REM Add N to the total\n210 TOTAL = TOTAL + N\n220 PRINT \"Read\"; N\n230 RETURN\n300 DATA 12, 7, 30, 18, 3\n",
    },
    {
        id: "basic-functions",
        language: "basic",
        title: { TR: "SUB ve FUNCTION", EN: "SUB and FUNCTION" },
        description: { TR: "QBasic tarzı alt programlar, diziler ve SELECT CASE.", EN: "QBasic-style procedures, arrays and SELECT CASE." },
        code: "DECLARE FUNCTION Grade$ (score)\nDECLARE SUB ShowLine (n)\n\nDIM scores(1 TO 4)\nscores(1) = 95: scores(2) = 72: scores(3) = 58: scores(4) = 85\nFOR i = 1 TO 4\n    PRINT \"Student\"; i; \"->\"; scores(i); Grade$(scores(i))\nNEXT i\nCALL ShowLine(20)\nEND\n\nFUNCTION Grade$ (score)\n    SELECT CASE score\n        CASE IS >= 90: Grade$ = \"A\"\n        CASE 75 TO 89: Grade$ = \"B\"\n        CASE 60 TO 74: Grade$ = \"C\"\n        CASE ELSE: Grade$ = \"F\"\n    END SELECT\nEND FUNCTION\n\nSUB ShowLine (n)\n    PRINT STRING$(n, \"-\")\nEND SUB\n",
    },
    {
        id: "befunge-sum",
        language: "befunge",
        title: { TR: "İki sayıyı topla", EN: "Add two numbers" },
        description: { TR: "& ile Girdi sekmesinden iki sayı okur.", EN: "Reads two numbers from the Input tab with &." },
        stdin: "19 23\n",
        code: "&&+.55+,@\nReads two integers (&&), adds them (+), prints the result (.) and a newline (55+,).\n",
    },
    {
        id: "mips-sum",
        language: "mips",
        title: { TR: "Girdi ve döngü", EN: "Input and a loop" },
        description: { TR: "read_int ile n'yi okur ve 1..n toplamını yazdırır.", EN: "Reads n with read_int and prints the sum of 1..n." },
        stdin: "10\n",
        code: "        .data\nprompt: .asciiz \"n = \"\nresult: .asciiz \"Sum of 1..n = \"\n\n        .text\nmain:   li   $v0, 4          # print the prompt\n        la   $a0, prompt\n        syscall\n        li   $v0, 5          # read_int -> $v0\n        syscall\n        move $t0, $v0        # $t0 = n\n        li   $t1, 0          # $t1 = sum\nloop:   blez $t0, done\n        add  $t1, $t1, $t0\n        addi $t0, $t0, -1\n        j    loop\ndone:   li   $v0, 4\n        la   $a0, result\n        syscall\n        li   $v0, 1          # print_int\n        move $a0, $t1\n        syscall\n        li   $v0, 11         # print_char '\\n'\n        li   $a0, 10\n        syscall\n        li   $v0, 10         # exit\n        syscall\n",
    },
    {
        id: "mips-functions",
        language: "mips",
        title: { TR: "Fonksiyon ve yığın", EN: "Functions and the stack" },
        description: { TR: "jal/jr ile özyinelemeli faktöriyel; $ra yığında saklanır.", EN: "A recursive factorial with jal/jr; $ra is saved on the stack." },
        code: "        .text\nmain:   li   $a0, 10\n        jal  fact\n        move $a0, $v0\n        li   $v0, 1\n        syscall\n        li   $v0, 10\n        syscall\n\n# fact(n): returns n! in $v0\nfact:   addi $sp, $sp, -8\n        sw   $ra, 4($sp)\n        sw   $a0, 0($sp)\n        li   $v0, 1\n        ble  $a0, 1, return\n        addi $a0, $a0, -1\n        jal  fact\n        lw   $a0, 0($sp)\n        mul  $v0, $v0, $a0\nreturn: lw   $ra, 4($sp)\n        addi $sp, $sp, 8\n        jr   $ra\n",
    },
    {
        id: "yaml-workflow",
        language: "yaml",
        title: { TR: "GitHub Actions iş akışı", EN: "GitHub Actions workflow" },
        description: { TR: "Doğrulanıp biçimlendirilen gerçekçi bir CI dosyası.", EN: "A realistic CI file to validate and format." },
        code: "name: CI\non:\n  push:\n    branches: [main]\n  pull_request:\n\njobs:\n  test:\n    runs-on: ubuntu-latest\n    strategy:\n      matrix:\n        node: [20, 22]\n    steps:\n      - uses: actions/checkout@v4\n      - uses: actions/setup-node@v4\n        with:\n          node-version: ${{ matrix.node }}\n      - run: npm ci\n      - run: npm test\n",
    },
    {
        id: "toml-cargo",
        language: "toml",
        title: { TR: "Cargo.toml", EN: "Cargo.toml" },
        description: { TR: "Rust paket tanımı: tablolar, diziler ve satır içi tablolar.", EN: "A Rust package manifest: tables, arrays and inline tables." },
        code: "[package]\nname = \"hanogt-demo\"\nversion = \"0.1.0\"\nedition = \"2021\"\nauthors = [\"Hanogt <hello@example.com>\"]\n\n[dependencies]\nserde = { version = \"1.0\", features = [\"derive\"] }\nrand = \"0.8\"\n\n[profile.release]\nlto = true\nopt-level = 3\n",
    },
    {
        id: "csv-grades",
        language: "csv",
        title: { TR: "Not tablosu", EN: "Grade sheet" },
        description: { TR: "Tırnaklı alanlar ve tablo görünümü.", EN: "Quoted fields and a table view." },
        code: "student,math,physics,comment\nAda,95,88,\"Great work, keep it up\"\nLinus,72,91,\"Strong in \"\"physics\"\"\"\nGrace,85,79,\n",
    },
    {
        id: "xml-rss",
        language: "xml",
        title: { TR: "RSS beslemesi", EN: "RSS feed" },
        description: { TR: "Ad alanları, CDATA ve varlıklar.", EN: "Namespaces, CDATA and entities." },
        code: "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<rss version=\"2.0\" xmlns:atom=\"http://www.w3.org/2005/Atom\">\n  <channel>\n    <title>Hanogt News</title>\n    <link>https://example.com/</link>\n    <atom:link href=\"https://example.com/rss.xml\" rel=\"self\" type=\"application/rss+xml\"/>\n    <item>\n      <title>Tom &amp; Jerry learn Prolog</title>\n      <description><![CDATA[<p>New languages in <b>Hanogt Codev</b>.</p>]]></description>\n    </item>\n  </channel>\n</rss>\n",
    },
    {
        id: "mermaid-sequence",
        language: "mermaid",
        title: { TR: "Sıralama diyagramı", EN: "Sequence diagram" },
        description: { TR: "Tarayıcı, sunucu ve veritabanı arasındaki mesajlar.", EN: "Messages between a browser, a server and a database." },
        code: "sequenceDiagram\n    autonumber\n    actor User\n    participant Browser\n    participant Server\n    participant DB as Database\n    User->>Browser: Press Run\n    Browser->>Server: POST /api/execute\n    Server->>DB: Save run\n    DB-->>Server: OK\n    Server-->>Browser: Output\n    Browser-->>User: Show console\n",
    },
    {
        id: "mermaid-charts",
        language: "mermaid",
        title: { TR: "Pasta grafiği ve Gantt", EN: "Pie chart and Gantt" },
        description: { TR: "Mermaid ile veri grafiği.", EN: "A data chart drawn with Mermaid." },
        code: "pie showData\n    title Languages in a class project\n    \"Python\" : 45\n    \"JavaScript\" : 30\n    \"Prolog\" : 10\n    \"Other\" : 15\n",
    },
    {
        id: "latex-math",
        language: "latex",
        title: { TR: "Matematik formülleri", EN: "Math formulas" },
        description: { TR: "Matris, durumlar, hizalı denklemler ve teorem.", EN: "Matrices, cases, aligned equations and a theorem." },
        code: "\\documentclass{article}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\n\\section{Linear algebra}\nFor $A \\in \\R^{2 \\times 2}$:\n\\[\n  A = \\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}, \\qquad \\det A = -2.\n\\]\n\n\\section{Functions}\n\\[\n  |x| = \\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}\n\\]\n\\begin{align*}\n  (a + b)^2 &= a^2 + 2ab + b^2 \\\\\n  \\int_0^1 x^n \\, dx &= \\frac{1}{n + 1}\n\\end{align*}\n\n\\begin{theorem}[Pythagoras]\nIn a right triangle, $a^2 + b^2 = c^2$.\n\\end{theorem}\n\\end{document}\n",
    },
    {
        id: "svg-animated",
        language: "svg",
        title: { TR: "Hareketli rozet", EN: "Animated badge" },
        description: { TR: "CSS animasyonlu SVG (önizlemede oynar).", EN: "An SVG with a CSS animation (plays in the preview)." },
        code: "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"200\" height=\"200\" viewBox=\"0 0 200 200\">\n  <style>\n    .ring { transform-origin: 100px 100px; animation: spin 4s linear infinite; }\n    @keyframes spin { to { transform: rotate(360deg); } }\n  </style>\n  <circle cx=\"100\" cy=\"100\" r=\"90\" fill=\"#312e81\"/>\n  <circle class=\"ring\" cx=\"100\" cy=\"100\" r=\"70\" fill=\"none\" stroke=\"#a5b4fc\" stroke-width=\"10\" stroke-dasharray=\"110 40\"/>\n  <text x=\"100\" y=\"108\" text-anchor=\"middle\" font-family=\"system-ui, sans-serif\" font-size=\"22\" fill=\"#fff\">Hanogt</text>\n</svg>\n",
    },
    {
        id: "markdown-readme",
        language: "markdown",
        title: { TR: "Proje README'si", EN: "Project README" },
        description: { TR: "Başlık, rozet, kurulum ve tablo içeren README.", EN: "A README with a title, install steps and a table." },
        code: "# My Project\n\nA short description of what the project does and who it is for.\n\n## Getting started\n\n1. Open the project in **Hanogt Codev**.\n2. Press `Ctrl+Enter` to run it.\n3. Share it with your group.\n\n## Commands\n\n| Shortcut | Action |\n| --- | --- |\n| `Ctrl+Enter` | Run |\n| `Ctrl+S` | Save |\n| `Ctrl+K` | Quick actions |\n\n## License\n\nMIT\n",
    },
    {
        id: "jq-report",
        language: "jq",
        title: { TR: "Siparişleri grupla", EN: "Group the orders" },
        description: { TR: "group_by, map, add ve metin içine değer yerleştirme; veriler Girdi sekmesinden okunur.", EN: "group_by, map, add and string interpolation; the data comes from the Input tab." },
        stdin: "{\"orders\": [\n  {\"customer\": \"Ada\", \"item\": \"Keyboard\", \"price\": 750, \"qty\": 1},\n  {\"customer\": \"Linus\", \"item\": \"Mouse\", \"price\": 250, \"qty\": 2},\n  {\"customer\": \"Ada\", \"item\": \"Cable\", \"price\": 40, \"qty\": 3},\n  {\"customer\": \"Grace\", \"item\": \"Monitor\", \"price\": 4200, \"qty\": 1}\n]}\n",
        code: "# Totals the orders in the Input tab per customer, largest first.\n.orders\n| group_by(.customer)\n| map({customer: .[0].customer, orders: length, total: (map(.price * .qty) | add)})\n| sort_by(-.total)\n| .[]\n| \"\\(.customer): \\(.orders) order(s), total \\(.total)\"\n",
    },
    {
        id: "less-themes",
        language: "less",
        title: { TR: "Tema düğmeleri", EN: "Theme buttons" },
        description: { TR: "Bir eşlem, parametreli mixin ve each() ile her renk için bir düğme sınıfı.", EN: "A map, a parametric mixin and each() make a button class for every colour." },
        code: "// A button for every theme colour, generated with each()\n@themes: {\n  primary: #6366f1;\n  success: #16a34a;\n  danger: #dc2626;\n}\n\n.button(@color) {\n  color: white;\n  background: @color;\n  border: 1px solid darken(@color, 10%);\n  &:hover { background: lighten(@color, 8%); }\n}\n\neach(@themes, {\n  .btn-@{key} {\n    .button(@value);\n  }\n});\n",
    },
    {
        id: "scss-utilities",
        language: "scss",
        title: { TR: "Fonksiyon, @extend ve döngü", EN: "Functions, @extend and loops" },
        description: { TR: "@function, yer tutucu seçici, @extend ve bir eşlem üzerinde @each.", EN: "@function, a placeholder selector, @extend and @each over a map." },
        code: "@use \"sass:math\";\n\n$spacings: (0: 0, 1: 4px, 2: 8px, 3: 16px);\n\n@function rem($px) {\n  @return math.div($px, 16px) * 1rem;\n}\n\n%card {\n  border-radius: 12px;\n  padding: rem(24px);\n}\n\n.card { @extend %card; background: #f4f4f5; }\n.card--dark { @extend %card; background: #18181b; color: white; }\n\n@each $key, $value in $spacings {\n  .m-#{$key} { margin: $value; }\n}\n",
    },
    {
        id: "wat-sieve",
        language: "wat",
        title: { TR: "Asal sayı eleği", EN: "Prime sieve" },
        description: { TR: "read_i32 ile n'yi okur, doğrusal bellekte Eratosthenes eleğiyle asal sayıları yazdırır.", EN: "Reads n with read_i32 and prints the primes up to n with a sieve in linear memory." },
        stdin: "50\n",
        code: ";; Prints the primes up to n (read from the Input tab) with the sieve of Eratosthenes.\n;; Byte i of the memory becomes 1 once i is known to be composite.\n(module\n  (import \"env\" \"read_i32\" (func $read_i32 (result i32)))\n  (import \"env\" \"print_i32\" (func $print_i32 (param i32)))\n  (memory 1)\n\n  (func (export \"main\") (result i32)\n    (local $n i32) (local $i i32) (local $j i32) (local $count i32)\n    (local.set $n (call $read_i32))\n    (local.set $i (i32.const 2))\n    (block $done\n      (loop $outer\n        (br_if $done (i32.gt_s (local.get $i) (local.get $n)))\n        (if (i32.eqz (i32.load8_u (local.get $i)))\n          (then\n            (call $print_i32 (local.get $i))\n            (local.set $count (i32.add (local.get $count) (i32.const 1)))\n            (local.set $j (i32.mul (local.get $i) (local.get $i)))\n            (block $marked\n              (loop $inner\n                (br_if $marked (i32.gt_s (local.get $j) (local.get $n)))\n                (i32.store8 (local.get $j) (i32.const 1))\n                (local.set $j (i32.add (local.get $j) (local.get $i)))\n                (br $inner)))))\n        (local.set $i (i32.add (local.get $i) (i32.const 1)))\n        (br $outer)))\n    ;; main's result (how many primes) is printed last\n    (local.get $count)))\n",
    },
    {
        id: "clojure-words",
        language: "clojure",
        title: { TR: "Kelime sıklığı", EN: "Word frequencies" },
        description: { TR: "read-line, ->> zinciri, frequencies, sort-by ve bir atom.", EN: "read-line, a ->> pipeline, frequencies, sort-by and an atom." },
        stdin: "to be or not to be that is the question\n",
        code: ";; Word frequencies of the line in the Input tab\n(require '[clojure.string :as str])\n\n(def text (or (read-line) \"the quick brown fox jumps over the lazy dog\"))\n\n(def counts\n  (->> (str/split (str/lower-case text) #\"\\W+\")\n       (remove str/blank?)\n       frequencies\n       (sort-by val >)))\n\n(doseq [[word n] (take 5 counts)]\n  (println (format \"%-8s %s\" word (apply str (repeat n \"*\")))))\n\n(def total (atom 0))\n(doseq [[_ n] counts] (swap! total + n))\n(println \"Words:\" @total)\n",
    },
    {
        id: "coffeescript-classes",
        language: "coffeescript",
        title: { TR: "Sınıflar ve kalıtım", EN: "Classes and inheritance" },
        description: { TR: "extends/super, @ parametreleri, liste kavrayışı ve yapı bozma.", EN: "extends/super, @ parameters, comprehensions and destructuring." },
        code: "# Classes, inheritance and comprehensions\nclass Shape\n  constructor: (@name) ->\n  describe: -> \"#{@name}: area #{@area().toFixed 2}\"\n\nclass Circle extends Shape\n  constructor: (@radius) -> super \"circle\"\n  area: -> Math.PI * @radius ** 2\n\nclass Rectangle extends Shape\n  constructor: (@width, @height) -> super \"rectangle\"\n  area: -> @width * @height\n\nshapes = [new Circle(1), new Rectangle(3, 4), new Circle(2.5)]\nconsole.log shape.describe() for shape in shapes\n\nlargest = shapes.reduce (best, shape) -> if shape.area() > best.area() then shape else best\nconsole.log \"Largest: #{largest.name}\"\n\n{name, radius = 0} = shapes[2]\nconsole.log \"Destructured:\", name, radius\n",
    },
    {
        id: "dot-clusters",
        language: "dot",
        title: { TR: "Kümeli akış şeması", EN: "Flow chart with clusters" },
        description: { TR: "subgraph cluster_… grupları, kesikli kenar ve etiketler.", EN: "subgraph cluster_… groups, a dashed edge and labels." },
        code: "digraph Pipeline {\n  node [fontname=\"Helvetica\", shape=box, style=\"rounded,filled\", fillcolor=\"#f4f4f5\"];\n  edge [fontname=\"Helvetica\", fontsize=10];\n\n  subgraph cluster_browser {\n    label=\"Browser\"; style=rounded; color=\"#6366f1\";\n    editor [label=\"Editor\"];\n    worker [label=\"Web Worker\"];\n  }\n  subgraph cluster_server {\n    label=\"Server\"; style=rounded; color=\"#16a34a\";\n    api [label=\"/api/execute\"];\n    scan [label=\"Security scan\"];\n    runner [label=\"Runner\"];\n  }\n\n  editor -> worker [label=\"browser languages\"];\n  editor -> api [label=\"compiled languages\"];\n  api -> scan -> runner;\n  runner -> editor [style=dashed, label=\"output\", constraint=false];\n}\n",
    },
    {
        id: "abc-jig",
        language: "abc",
        title: { TR: "Akorlu bir jig", EN: "A jig with chords" },
        description: { TR: "6/8 ölçü, tekrar işaretleri ve akor sembolleri.", EN: "6/8 time, repeat signs and chord symbols." },
        code: "X:1\nT:The Kesh\nR:jig\nM:6/8\nL:1/8\nQ:3/8=110\nK:G\n|:\"G\"GAG GAB|\"D\"ABA ABd|\"G\"edd gdd|\"C\"edB \"D\"dBA|\n\"G\"GAG GAB|\"D\"ABA ABd|\"G\"edd gdB|\"D\"AGF \"G\"G3:|\n|:\"G\"gfg dBd|\"G\"gfg dBd|\"C\"efg edB|\"D\"dBA ABd|\n\"G\"gfg dBd|\"G\"gfg dBd|\"C\"efg edB|\"D\"AGF \"G\"G3:|\n",
    },
    {
        id: "asciidoc-guide",
        language: "asciidoc",
        title: { TR: "Kısa kılavuz", EN: "Short guide" },
        description: { TR: "Numaralı adımlar, yapılacaklar listesi, uyarı blokları, kenar notu ve tablo.", EN: "Numbered steps, a checklist, admonitions, a sidebar and a table." },
        code: "= Getting started\n:toc:\n\n== Install\n\n. Open the editor.\n. Pick a language.\n. Press *Run*.\n\nTIP: The *Input* tab feeds programs that read input.\n\n== Checklist\n\n* [x] Write the code\n* [ ] Share it with your group\n\n.Shortcuts\n****\nCtrl+Enter runs the file and Ctrl+K opens quick actions.\n****\n\n== Languages\n\n[cols=\"1,1\",options=\"header\"]\n|===\n| Language | Runs in\n| Python | Browser\n| Rust | Server\n|===\n\nWARNING: Unsaved changes stay in this browser only.\n",
    },
    {
        id: "glsl-grid",
        language: "glsl",
        title: { TR: "main() ile tam gölgelendirici", EN: "A complete shader with main()" },
        description: { TR: "u_resolution ve u_time kullanan, nabız gibi atan halkalardan bir ızgara.", EN: "A grid of pulsing rings that uses u_resolution and u_time." },
        code: "// A complete fragment shader with main(); u_resolution, u_time and u_mouse are set too.\nprecision mediump float;\nuniform vec2 u_resolution;\nuniform float u_time;\n\nvoid main() {\n    vec2 st = gl_FragCoord.xy / u_resolution.xy;\n    st.x *= u_resolution.x / u_resolution.y;\n    vec2 cell = fract(st * 6.0) - 0.5;\n    float r = length(cell);\n    float pulse = 0.3 + 0.1 * sin(u_time * 2.0 + floor(st.x * 6.0) + floor(st.y * 6.0));\n    float ring = smoothstep(pulse, pulse - 0.02, r) - smoothstep(pulse - 0.06, pulse - 0.08, r);\n    vec3 color = mix(vec3(0.06, 0.07, 0.12), vec3(0.39, 0.4, 0.95), ring);\n    gl_FragColor = vec4(color, 1.0);\n}\n",
    },
    {
        id: "logo-tree",
        language: "logo",
        title: { TR: "Özyinelemeli ağaç ve sarmal", EN: "Recursive tree and spiral" },
        description: { TR: "Kendini çağıran bir yordam, FOR döngüsü ve RGB listeleriyle renkler.", EN: "A procedure that calls itself, a FOR loop and colours from RGB lists." },
        code: "; A recursive tree and a colourful spiral\nto tree :size :depth\n  if :depth = 0 [stop]\n  setpensize :depth\n  fd :size\n  lt 25 tree :size * 0.72 :depth - 1\n  rt 50 tree :size * 0.72 :depth - 1\n  lt 25 bk :size\nend\n\nsetpencolor \"brown\npenup setxy -120 -150 pendown\ntree 70 7\n\npenup setxy 140 0 pendown\nsetpensize 2\nfor [i 1 60] [\n  setpencolor (list 99 + :i * 2 102 241 - :i * 2)\n  fd :i * 2 rt 89\n]\nhideturtle\n",
    },
];

const WEB_INDEX = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>Hanogt Web</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <main class=\"card\">\n    <h1>Hello World from Hanogt!</h1>\n    <p>Edit <code>index.html</code>, <code>style.css</code> and <code>script.js</code>; the preview updates as you type.</p>\n    <button id=\"counter\" type=\"button\">Clicked 0 times</button>\n  </main>\n  <script src=\"script.js\"></script>\n</body>\n</html>\n";

const WEB_STYLE = ":root {\n  font-family: system-ui, -apple-system, \"Segoe UI\", sans-serif;\n}\n\nbody {\n  margin: 0;\n  min-height: 100vh;\n  display: grid;\n  place-items: center;\n  background: linear-gradient(135deg, #312e81, #701a75);\n}\n\n.card {\n  max-width: 28rem;\n  margin: 1rem;\n  padding: 2rem;\n  border-radius: 1.5rem;\n  background: rgba(255, 255, 255, 0.94);\n  color: #18181b;\n  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);\n  text-align: center;\n}\n\nbutton {\n  border: 0;\n  border-radius: 999px;\n  padding: 0.75rem 1.5rem;\n  font: inherit;\n  font-weight: 600;\n  color: white;\n  background: linear-gradient(90deg, #6366f1, #d946ef);\n  cursor: pointer;\n}\n";

const WEB_SCRIPT = "const button = document.getElementById(\"counter\");\nlet clicks = 0;\n\nbutton.addEventListener(\"click\", () => {\n  clicks += 1;\n  button.textContent = `Clicked ${clicks} ${clicks === 1 ? \"time\" : \"times\"}`;\n  console.log(\"Button clicked\", clicks);\n});\n";

const TODO_INDEX = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>To-do</title>\n  <link rel=\"stylesheet\" href=\"style.css\">\n</head>\n<body>\n  <main>\n    <h1>To-do</h1>\n    <form id=\"form\">\n      <input id=\"task\" placeholder=\"Add a task\" autocomplete=\"off\" required>\n      <button type=\"submit\">Add</button>\n    </form>\n    <ul id=\"list\"></ul>\n    <p id=\"summary\"></p>\n  </main>\n  <script src=\"script.js\"></script>\n</body>\n</html>\n";

const TODO_STYLE = "body {\n  font-family: system-ui, sans-serif;\n  background: #f4f4f5;\n  color: #18181b;\n  display: flex;\n  justify-content: center;\n  padding: 2rem 1rem;\n}\n\nmain {\n  width: min(28rem, 100%);\n}\n\nform {\n  display: flex;\n  gap: 0.5rem;\n}\n\ninput {\n  flex: 1;\n  padding: 0.6rem 0.8rem;\n  border: 1px solid #d4d4d8;\n  border-radius: 0.75rem;\n  font: inherit;\n}\n\nbutton {\n  border: 0;\n  border-radius: 0.75rem;\n  padding: 0.6rem 1rem;\n  background: #4f46e5;\n  color: white;\n  font: inherit;\n  cursor: pointer;\n}\n\nli {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  padding: 0.5rem 0;\n  border-bottom: 1px solid #e4e4e7;\n}\n\nli.done span {\n  text-decoration: line-through;\n  color: #a1a1aa;\n}\n";

const TODO_SCRIPT = "const form = document.getElementById(\"form\");\nconst input = document.getElementById(\"task\");\nconst list = document.getElementById(\"list\");\nconst summary = document.getElementById(\"summary\");\nconst tasks = [];\n\nfunction render() {\n  list.replaceChildren(...tasks.map((task, index) => {\n    const item = document.createElement(\"li\");\n    item.className = task.done ? \"done\" : \"\";\n    const checkbox = document.createElement(\"input\");\n    checkbox.type = \"checkbox\";\n    checkbox.checked = task.done;\n    checkbox.addEventListener(\"change\", () => {\n      tasks[index].done = checkbox.checked;\n      render();\n    });\n    const text = document.createElement(\"span\");\n    text.textContent = task.text;\n    item.append(checkbox, text);\n    return item;\n  }));\n  const left = tasks.filter((task) => !task.done).length;\n  summary.textContent = `${left} of ${tasks.length} left`;\n}\n\nform.addEventListener(\"submit\", (event) => {\n  event.preventDefault();\n  const text = input.value.trim();\n  if (!text) return;\n  tasks.push({ text, done: false });\n  console.log(\"Added:\", text);\n  input.value = \"\";\n  render();\n});\n\nrender();\n";

const DOCS_README = "# Project notes\n\nSwitch between the tabs: the preview follows the active file.\n\n- `flow.mmd` is a **Mermaid** flowchart.\n- `formulas.tex` is a **LaTeX** page rendered with KaTeX.\n";

const DOCS_FLOW = "flowchart TD\n    Idea([Idea]) --> Write[Write the code]\n    Write --> Run{Run it}\n    Run -->|Error| Fix[Read the error and fix it]\n    Fix --> Run\n    Run -->|Works| Share[Share on Hanogt Media]\n";

const DOCS_FORMULAS = "\\section*{Formulas}\nThe area of a circle is $A = \\pi r^2$ and\n\\[\n  \\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}.\n\\]\n";

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
        id: "docs-project",
        kind: "docs",
        title: { TR: "Doküman projesi (Markdown + Mermaid + LaTeX)", EN: "Docs project (Markdown + Mermaid + LaTeX)" },
        description: { TR: "README, akış diyagramı ve formül sayfası; etkin dosya canlı önizlenir.", EN: "A README, a flowchart and a formula sheet; the active file is previewed live." },
        files: [
            { name: "README.md", language: "markdown", code: DOCS_README },
            { name: "flow.mmd", language: "mermaid", code: DOCS_FLOW },
            { name: "formulas.tex", language: "latex", code: DOCS_FORMULAS },
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
    {
        id: "classics",
        kind: "polyglot",
        title: { TR: "Klasik diller turu", EN: "Tour of classic languages" },
        description: { TR: "BASIC, Forth, Prolog ve MIPS assembly tarayıcıda birlikte çalışır.", EN: "BASIC, Forth, Prolog and MIPS assembly run together in the browser." },
        files: [
            { name: "main.bas", language: "basic", code: "PRINT \"Hello from BASIC!\"\n" },
            { name: "main.fth", language: "forth", code: ".\" Hello from Forth!\" cr\n" },
            { name: "main.pro", language: "prolog", code: ":- initialization(main).\nmain :- writeln('Hello from Prolog!').\n" },
            { name: "main.asm", language: "mips", code: "        .data\nmsg:    .asciiz \"Hello from MIPS!\\n\"\n        .text\nmain:   li $v0, 4\n        la $a0, msg\n        syscall\n" },
        ],
    },
];

export function templatesForLanguage(language: string): FileTemplate[] {
    return FILE_TEMPLATES.filter((template) => template.language === language);
}
