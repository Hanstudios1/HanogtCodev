/**
 * Programming concepts Hanogt AI Core explains offline ("özyineleme nedir",
 * "what is a closure", "SQL ile NoSQL farkı"): a short explanation in Turkish
 * and English and, where it helps, a tiny example. The intent model sends
 * these questions here (intent `code_concept`); retrieval picks the concept.
 * Loaded on demand by local-engine.ts.
 */
import type { Copy } from "@/lib/i18n";

export interface CodeConcept {
    id: string;
    title: Copy;
    /** Search words in Turkish and English (synonyms, abbreviations, common misspellings). */
    keywords: string;
    text: Copy;
    example?: { language: "python" | "javascript" | "sql" | "bash"; code: string };
}

export const CONCEPTS: CodeConcept[] = [
    {
        id: "variable",
        title: { TR: "Değişken", EN: "Variable" },
        keywords: "değişken degisken variable var let const sabit constant atama assignment değer tutmak",
        text: {
            TR: "Değişken, programın bir değeri adıyla saklayıp sonra kullanmasını sağlayan etiketli bir kutudur. Değeri değişebilir; sabitler (JavaScript'te `const`) ise bir kez atanır. İyi bir değişken adı ne tuttuğunu anlatır: `x` yerine `totalPrice`.",
            EN: "A variable is a named box that lets a program store a value and use it later. Its value can change; constants (`const` in JavaScript) are assigned once. A good variable name says what it holds: `totalPrice` rather than `x`.",
        },
        example: { language: "javascript", code: "let count = 0;      // değişebilir\nconst rate = 0.18;  // sabit\ncount = count + 1;" },
    },
    {
        id: "data-types",
        title: { TR: "Veri tipleri", EN: "Data types" },
        keywords: "veri tipi veri türü data type int integer tam sayı float double ondalık string metin bool boolean char tip türleri",
        text: {
            TR: "Veri tipi bir değerin ne tür bir şey olduğunu ve onunla ne yapılabileceğini belirler: tam sayı (int), ondalık sayı (float/double), metin (string), doğru/yanlış (bool), liste, sözlük gibi. `\"5\" + 1` gibi işlemlerin sonucu tiplere göre değişir; JavaScript'te \"51\", Python'da hata verir.",
            EN: "A data type says what kind of thing a value is and what you can do with it: integers (int), decimals (float/double), text (string), true/false (bool), lists, dictionaries and so on. The result of something like `\"5\" + 1` depends on the types: \"51\" in JavaScript, an error in Python.",
        },
    },
    {
        id: "function",
        title: { TR: "Fonksiyon, parametre ve dönüş değeri", EN: "Functions, parameters and return values" },
        keywords: "fonksiyon function metot method parametre parameter argüman argument return dönüş değeri geri döndürmek çağırmak call def",
        text: {
            TR: "Fonksiyon, bir işi yapan ve tekrar tekrar çağrılabilen adlandırılmış kod bloğudur. Tanımdaki girdilere parametre, çağırırken verilen değerlere argüman denir; `return` sonucu çağırana geri verir. Küçük ve tek işi yapan fonksiyonlar kodu okunur ve test edilebilir kılar.",
            EN: "A function is a named block of code that does one job and can be called again and again. The inputs in its definition are parameters; the values passed when calling it are arguments; `return` hands the result back to the caller. Small functions that do one thing make code readable and testable.",
        },
        example: { language: "python", code: "def area(width, height):  # parametreler\n    return width * height\n\nprint(area(3, 4))  # argümanlar → 12" },
    },
    {
        id: "scope",
        title: { TR: "Kapsam (scope)", EN: "Scope" },
        keywords: "kapsam scope global local yerel değişken görünürlük blok block scope hoisting",
        text: {
            TR: "Kapsam, bir değişkenin kodun hangi bölümünden görülebildiğidir. Fonksiyon içinde tanımlanan değişken yereldir ve dışarıdan görünmez; her yerden görülen değişkenler globaldir. JavaScript'te `let` ve `const` blok kapsamlıdır (yalnızca `{ }` içinde geçerli), eski `var` ise fonksiyon kapsamlıdır.",
            EN: "Scope is the part of the code from which a variable can be seen. A variable defined inside a function is local and invisible outside; one visible everywhere is global. In JavaScript `let` and `const` are block-scoped (valid only inside `{ }`), while the old `var` is function-scoped.",
        },
    },
    {
        id: "recursion",
        title: { TR: "Özyineleme (recursion)", EN: "Recursion" },
        keywords: "özyineleme özyinelemeli ozyineleme recursion recursive kendini çağıran fonksiyon base case temel durum yinelemeli",
        text: {
            TR: "Özyineleme, bir fonksiyonun problemi küçültüp kendini yeniden çağırmasıdır. Her özyinelemeli fonksiyonun bir temel durumu (base case) olmalıdır; yoksa sonsuza kadar çağırır ve yığın taşması (stack overflow) olur. Ağaç gezme, böl ve yönet algoritmaları için doğaldır; çok derin girdilerde döngüyle yazmak daha güvenlidir.",
            EN: "Recursion is when a function solves a smaller version of the problem by calling itself. Every recursive function needs a base case; without one it calls itself forever and overflows the stack. It is natural for walking trees and divide-and-conquer algorithms; for very deep inputs a loop is safer.",
        },
        example: { language: "python", code: "def factorial(n):\n    if n <= 1:          # temel durum\n        return 1\n    return n * factorial(n - 1)" },
    },
    {
        id: "loop",
        title: { TR: "Döngüler", EN: "Loops" },
        keywords: "döngü dongu loop for while do while foreach tekrar iterasyon iteration sonsuz döngü infinite loop break continue",
        text: {
            TR: "Döngü, bir kod bloğunu koşul sağlandıkça ya da bir koleksiyonun her elemanı için tekrarlar. `for` belirli sayıda ya da her eleman için, `while` koşul doğru olduğu sürece çalışır. Koşul hiç yanlış olmazsa sonsuz döngü oluşur; `break` döngüden çıkar, `continue` sıradaki tura geçer.",
            EN: "A loop repeats a block of code while a condition holds or once for each element of a collection. `for` runs a set number of times or per element; `while` runs as long as its condition is true. If the condition never becomes false you get an infinite loop; `break` leaves the loop and `continue` skips to the next round.",
        },
    },
    {
        id: "array-list",
        title: { TR: "Dizi ve liste", EN: "Arrays and lists" },
        keywords: "dizi array liste list eleman indeks index sıralı koleksiyon vector arraylist append push",
        text: {
            TR: "Dizi (liste), elemanları sırayla tutan ve her elemana indeksiyle (çoğu dilde 0'dan başlayarak) erişilen yapıdır. İndeksle okuma çok hızlıdır (O(1)); ortaya eleman eklemek ya da aramak ise elemanları kaydırdığı veya taradığı için O(n)'dir. Python'da `list`, JavaScript'te `Array`, Java'da `ArrayList`, C++'ta `std::vector` kullanılır.",
            EN: "An array (list) keeps elements in order, and each element is reached by its index (starting at 0 in most languages). Reading by index is very fast (O(1)); inserting in the middle or searching is O(n) because elements are shifted or scanned. Python has `list`, JavaScript `Array`, Java `ArrayList`, C++ `std::vector`.",
        },
    },
    {
        id: "hash-map",
        title: { TR: "Sözlük / hash map", EN: "Dictionaries / hash maps" },
        keywords: "sözlük sozluk dictionary dict hash map hashmap hash table anahtar değer key value map nesne object eşleme",
        text: {
            TR: "Sözlük (hash map), değerleri anahtarlarla saklar ve bir anahtarın değerini ortalama O(1) sürede bulur; bunu anahtarın hash değerinden yerini hesaplayarak yapar. \"Bu daha önce görüldü mü?\", sayma ve gruplama gibi işlerde listeyi tekrar tekrar taramaktan çok daha hızlıdır. Python'da `dict`, JavaScript'te `Map` (ya da nesne), Java'da `HashMap`.",
            EN: "A dictionary (hash map) stores values under keys and finds a key's value in O(1) on average by computing its position from the key's hash. For \"have we seen this before?\", counting and grouping it is far faster than scanning a list again and again. Python has `dict`, JavaScript `Map` (or plain objects), Java `HashMap`.",
        },
        example: { language: "python", code: "counts = {}\nfor word in [\"elma\", \"armut\", \"elma\"]:\n    counts[word] = counts.get(word, 0) + 1\nprint(counts)  # {'elma': 2, 'armut': 1}" },
    },
    {
        id: "stack-queue",
        title: { TR: "Yığın (stack) ve kuyruk (queue)", EN: "Stacks and queues" },
        keywords: "yığın yigin stack kuyruk queue lifo fifo push pop enqueue dequeue deque",
        text: {
            TR: "Yığın (stack) son giren ilk çıkar (LIFO) mantığıyla çalışır: geri alma, ayraç eşleme ve fonksiyon çağrıları yığınla yönetilir. Kuyruk (queue) ilk giren ilk çıkar (FIFO): iş sıraları ve genişlik öncelikli arama (BFS) kuyruk kullanır. Python'da kuyruk için `collections.deque`, yığın için liste yeterlidir.",
            EN: "A stack is last in, first out (LIFO): undo, bracket matching and function calls are managed with stacks. A queue is first in, first out (FIFO): job queues and breadth-first search (BFS) use one. In Python use `collections.deque` for a queue; a list is enough for a stack.",
        },
    },
    {
        id: "linked-list",
        title: { TR: "Bağlı liste", EN: "Linked lists" },
        keywords: "bağlı liste bagli liste linked list düğüm node next pointer işaretçi singly doubly",
        text: {
            TR: "Bağlı liste, her düğümün değeri ve bir sonraki düğüme bağlantıyı (pointer) tuttuğu yapıdır. Başa ya da elinizdeki bir düğümün yanına eleman eklemek O(1)'dir, ama i'nci elemana ulaşmak için baştan yürümek gerekir (O(n)). Günlük işlerde çoğu zaman dinamik dizi daha hızlıdır; bağlı liste daha çok kuyruk ve LRU önbellek gibi yapıların içinde kullanılır.",
            EN: "A linked list is made of nodes that each hold a value and a link (pointer) to the next node. Adding at the head, or next to a node you already hold, is O(1), but reaching the i-th element means walking from the start (O(n)). For everyday work a dynamic array is usually faster; linked lists mostly live inside structures such as queues and LRU caches.",
        },
    },
    {
        id: "tree-graph",
        title: { TR: "Ağaç ve grafik", EN: "Trees and graphs" },
        keywords: "ağaç agac tree binary tree ikili ağaç bst graph grafik çizge düğüm kenar node edge bfs dfs genişlik derinlik öncelikli arama",
        text: {
            TR: "Grafik, düğümler ve onları bağlayan kenarlardan oluşur (yollar, sosyal ağlar, bağımlılıklar). Ağaç, döngüsü olmayan ve tek bir kökten dallanan özel bir grafiktir (klasörler, HTML DOM). Gezmek için genişlik öncelikli arama (BFS, kuyrukla; en kısa adım sayısını bulur) ya da derinlik öncelikli arama (DFS, yığınla ya da özyinelemeyle) kullanılır.",
            EN: "A graph is made of nodes and the edges connecting them (roads, social networks, dependencies). A tree is a special graph without cycles that branches out from one root (folders, the HTML DOM). To walk them you use breadth-first search (BFS, with a queue; it finds the fewest steps) or depth-first search (DFS, with a stack or recursion).",
        },
    },
    {
        id: "big-o",
        title: { TR: "Zaman karmaşıklığı (Big O)", EN: "Time complexity (Big O)" },
        keywords: "big o büyük o karmaşıklık karmasiklik complexity zaman karmaşıklığı time complexity o(n) o(1) o(log n) o(n^2) performans verimlilik algoritma analizi",
        text: {
            TR: "Big O, girdi büyüdükçe bir algoritmanın süresinin (ya da belleğinin) nasıl arttığını kabaca anlatır. O(1) sabit, O(log n) ikili arama gibi çok yavaş artan, O(n) tek tarama, O(n log n) iyi sıralamalar, O(n²) iç içe döngüler demektir. Bir milyon elemanda O(n²) yaklaşık 10¹² adım eder; bu yüzden büyük veride doğru veri yapısını seçmek (ör. sözlük) en büyük kazançtır.",
            EN: "Big O roughly describes how an algorithm's time (or memory) grows with the input size. O(1) is constant, O(log n) grows very slowly like binary search, O(n) is a single pass, O(n log n) good sorting, O(n²) nested loops. On a million items O(n²) is about 10¹² steps, so choosing the right data structure (e.g. a dictionary) is the biggest win on large data.",
        },
    },
    {
        id: "sorting",
        title: { TR: "Sıralama algoritmaları", EN: "Sorting algorithms" },
        keywords: "sıralama siralama sorting sort algoritması bubble sort kabarcık merge sort birleştirme quick sort hızlı sıralama insertion sort kararlı stable",
        text: {
            TR: "Kabarcık ve ekleme sıralaması basittir ama O(n²) olduğu için büyük listelerde yavaştır. Birleştirme (merge) sıralaması her zaman O(n log n)'dir ve kararlıdır (eşit elemanların sırası korunur); hızlı sıralama (quick sort) ortalamada O(n log n)'dir. Gerçek projelerde dilin hazır sıralamasını (`sorted`, `Array.prototype.sort`) bir karşılaştırma fonksiyonuyla kullanmak en doğrusudur.",
            EN: "Bubble sort and insertion sort are simple but O(n²), so they are slow on large lists. Merge sort is always O(n log n) and stable (equal elements keep their order); quicksort is O(n log n) on average. In real projects, use the language's built-in sort (`sorted`, `Array.prototype.sort`) with a comparison function.",
        },
        example: { language: "javascript", code: "const people = [{ name: \"Can\", age: 30 }, { name: \"Ada\", age: 25 }];\npeople.sort((a, b) => a.age - b.age); // sayılar için mutlaka karşılaştırıcı ver" },
    },
    {
        id: "oop",
        title: { TR: "Nesne yönelimli programlama (OOP)", EN: "Object-oriented programming (OOP)" },
        keywords: "nesne yönelimli programlama oop object oriented sınıf class nesne object instance örnek constructor kurucu metot method özellik property",
        text: {
            TR: "Nesne yönelimli programlama, veriyi ve o veriyle çalışan fonksiyonları (metotları) sınıflar içinde bir araya getirir. Sınıf bir kalıptır, nesne o kalıptan üretilmiş örnektir. Dört temel fikri kapsülleme, kalıtım, çok biçimlilik ve soyutlamadır.",
            EN: "Object-oriented programming groups data and the functions (methods) that work on it into classes. A class is a blueprint; an object is an instance made from it. Its four core ideas are encapsulation, inheritance, polymorphism and abstraction.",
        },
        example: { language: "python", code: "class Dog:\n    def __init__(self, name):\n        self.name = name\n\n    def speak(self):\n        return f\"{self.name}: Hav!\"\n\nprint(Dog(\"Karabaş\").speak())" },
    },
    {
        id: "inheritance",
        title: { TR: "Kalıtım (inheritance)", EN: "Inheritance" },
        keywords: "kalıtım kalitim inheritance miras extends alt sınıf üst sınıf subclass superclass base class super override",
        text: {
            TR: "Kalıtım, bir sınıfın başka bir sınıfın özelliklerini ve metotlarını devralmasıdır: `Kedi`, `Hayvan`'dan türeyebilir ve kendine özgü davranışı eklerken ortak kodu tekrar yazmaz. Alt sınıf üst sınıfın metodunu ezebilir (override) ve `super` ile üst sınıfı çağırabilir. Derin kalıtım zincirleri yerine çoğu zaman bileşim (composition) daha esnektir.",
            EN: "Inheritance is when a class takes over the properties and methods of another: `Cat` can derive from `Animal` and add its own behavior without rewriting the shared code. A subclass can override a parent method and call the parent with `super`. Instead of deep inheritance chains, composition is often more flexible.",
        },
    },
    {
        id: "polymorphism",
        title: { TR: "Çok biçimlilik (polymorphism)", EN: "Polymorphism" },
        keywords: "çok biçimlilik cok bicimlilik polimorfizm polymorphism override overload aşırı yükleme farklı davranış aynı arayüz",
        text: {
            TR: "Çok biçimlilik, farklı türdeki nesnelerin aynı arayüz üzerinden kullanılıp her birinin kendi davranışını göstermesidir: `shape.area()` çağrısı daire için πr², kare için a² hesaplar. Böylece çağıran kod nesnenin tam türünü bilmek zorunda kalmaz ve yeni türler eklemek kolaylaşır.",
            EN: "Polymorphism means objects of different types are used through the same interface while each behaves in its own way: calling `shape.area()` computes πr² for a circle and a² for a square. The calling code doesn't need to know the exact type, and adding new types gets easier.",
        },
    },
    {
        id: "encapsulation",
        title: { TR: "Kapsülleme (encapsulation)", EN: "Encapsulation" },
        keywords: "kapsülleme kapsulleme encapsulation private public protected erişim belirleyici access modifier getter setter gizleme",
        text: {
            TR: "Kapsülleme, bir nesnenin iç durumunu dışarıdan doğrudan değiştirilmeye kapatıp yalnızca kontrollü metotlarla erişim vermektir (`private` alanlar, `public` metotlar). Böylece geçersiz durumlar engellenir (ör. bakiyenin eksiye düşmesi) ve iç yapı değişse de dışarıdaki kod bozulmaz.",
            EN: "Encapsulation keeps an object's internal state from being changed directly from outside and allows access only through controlled methods (`private` fields, `public` methods). It prevents invalid states (e.g. a balance going negative) and lets the internals change without breaking outside code.",
        },
    },
    {
        id: "interface",
        title: { TR: "Arayüz ve soyut sınıf", EN: "Interfaces and abstract classes" },
        keywords: "arayüz arayuz interface soyut sınıf abstract class implements sözleşme contract protocol trait",
        text: {
            TR: "Arayüz (interface), bir sınıfın hangi metotları sağlaması gerektiğini söyleyen bir sözleşmedir; nasıl yapılacağını söylemez. Soyut sınıf ise ortak kodu da içerebilir ama doğrudan örneklenemez. Kodu somut sınıflar yerine arayüzlere bağlamak test etmeyi ve parçaları değiştirmeyi kolaylaştırır.",
            EN: "An interface is a contract saying which methods a class must provide, not how. An abstract class can also contain shared code but can't be instantiated directly. Depending on interfaces rather than concrete classes makes code easier to test and parts easier to swap.",
        },
    },
    {
        id: "closure",
        title: { TR: "Closure (kapanış)", EN: "Closures" },
        keywords: "closure kapanış kapanis lexical scope sözcüksel kapsam iç fonksiyon inner function dış değişken private state",
        text: {
            TR: "Closure, bir fonksiyonun tanımlandığı yerdeki değişkenleri, o kapsam bittikten sonra da hatırlamasıdır. Bir sayaç ya da ayarlanmış bir fonksiyon üretmek için kullanılır ve dışarıdan erişilemeyen özel durum sağlar. Döngü içinde oluşturulan closure'larda JavaScript'te `var` yerine `let` kullanmak klasik hatayı önler.",
            EN: "A closure is a function that remembers the variables from where it was defined, even after that scope has finished. It is used to build counters or pre-configured functions and gives private state that can't be reached from outside. For closures created in a loop, using `let` instead of `var` in JavaScript avoids the classic bug.",
        },
        example: { language: "javascript", code: "function makeCounter() {\n    let count = 0;\n    return () => ++count; // count'u hatırlar\n}\nconst next = makeCounter();\nnext(); next(); // 2" },
    },
    {
        id: "callback-promise",
        title: { TR: "Callback ve Promise", EN: "Callbacks and promises" },
        keywords: "callback geri çağırma promise söz then catch resolve reject callback hell asenkron sonuç future",
        text: {
            TR: "Callback, bir iş bitince çağrılsın diye başka bir fonksiyona verilen fonksiyondur. İç içe callback'ler okunmaz hâle gelince Promise kullanılır: Promise, ileride gelecek bir sonucu temsil eder; `.then` başarıyı, `.catch` hatayı ele alır. Günümüzde Promise'ler çoğunlukla `async/await` ile yazılır.",
            EN: "A callback is a function passed to another function so that it's called when some work is done. When nested callbacks become unreadable, promises take over: a promise stands for a result that will arrive later; `.then` handles success and `.catch` the error. Today promises are mostly written with `async/await`.",
        },
    },
    {
        id: "async-await",
        title: { TR: "Asenkron programlama ve async/await", EN: "Asynchronous code and async/await" },
        keywords: "async await asenkron asynchronous eşzamansız senkron synchronous bekleme non blocking event loop olay döngüsü fetch",
        text: {
            TR: "Asenkron kod, ağ isteği ya da dosya okuma gibi bekleyen işler sürerken programın durmadan devam etmesini sağlar. `async` fonksiyon bir Promise döndürür; içindeki `await` o Promise bitene kadar yalnızca bu fonksiyonu bekletir. Hataları `try/catch` ile yakala ve birbirinden bağımsız istekleri `Promise.all` ile aynı anda başlat.",
            EN: "Asynchronous code lets a program keep going while slow work such as a network request or a file read is pending. An `async` function returns a promise; `await` inside it pauses only that function until the promise settles. Catch errors with `try/catch` and start independent requests together with `Promise.all`.",
        },
        example: { language: "javascript", code: "async function loadUser(id) {\n    try {\n        const response = await fetch(`/api/users/${id}`);\n        if (!response.ok) throw new Error(`HTTP ${response.status}`);\n        return await response.json();\n    } catch (error) {\n        console.error(\"Kullanıcı alınamadı:\", error);\n        return null;\n    }\n}" },
    },
    {
        id: "concurrency",
        title: { TR: "İş parçacığı ve eşzamanlılık", EN: "Threads and concurrency" },
        keywords: "thread iş parçacığı is parcacigi eşzamanlılık concurrency paralel parallel race condition yarış durumu deadlock kilitlenme mutex lock senkronizasyon",
        text: {
            TR: "İş parçacıkları (thread) bir programın birden çok işi aynı anda yürütmesini sağlar. Aynı veriye birden çok iş parçacığı kontrolsüz yazarsa sonuç zamanlamaya göre değişir (race condition); bunu kilitler (mutex) ya da değiştirilemez veriyle önlersin. Birbirini bekleyen kilitler de programı dondurabilir (deadlock).",
            EN: "Threads let a program run several pieces of work at the same time. If several threads write to the same data without control, the result depends on timing (a race condition); you prevent it with locks (mutexes) or immutable data. Locks waiting on each other can also freeze the program (deadlock).",
        },
    },
    {
        id: "exceptions",
        title: { TR: "İstisnalar ve hata yakalama", EN: "Exceptions and error handling" },
        keywords: "istisna exception hata yakalama error handling try catch except finally throw raise fırlatmak hata yönetimi",
        text: {
            TR: "İstisna, programın normal akışında devam edemeyeceği bir durumu bildirir (dosya yok, sayı değil…). `try` bloğunda oluşan istisnayı `catch`/`except` yakalar, `finally` her durumda çalışır. Yalnızca gerçekten ele alabileceğin hataları yakala, hatayı sessizce yutma ve kullanıcıya anlaşılır bir mesaj göster.",
            EN: "An exception signals a situation where the program can't continue normally (missing file, not a number…). An exception raised in a `try` block is caught by `catch`/`except`, and `finally` always runs. Catch only the errors you can really handle, never swallow them silently, and show the user a clear message.",
        },
        example: { language: "python", code: "try:\n    age = int(input(\"Yaş: \"))\nexcept ValueError:\n    print(\"Lütfen bir sayı gir.\")" },
    },
    {
        id: "null",
        title: { TR: "null, undefined ve None", EN: "null, undefined and None" },
        keywords: "null undefined none nil boş değer null pointer null reference optional chaining ?. ?? nullable",
        text: {
            TR: "null (Python'da None) \"değer yok\" demektir; JavaScript'te undefined ise \"henüz değer atanmadı\" anlamına gelir. Böyle bir değerin özelliğine erişmek en sık görülen hatalardandır (NullReferenceException, \"Cannot read properties of undefined\"). Kullanmadan önce kontrol et ya da JavaScript'te `?.` ve `??` işleçlerini kullan.",
            EN: "null (None in Python) means \"no value\"; in JavaScript undefined means \"not assigned yet\". Reading a property of such a value is one of the most common bugs (NullReferenceException, \"Cannot read properties of undefined\"). Check before use, or in JavaScript use the `?.` and `??` operators.",
        },
        example: { language: "javascript", code: "const user = { name: \"Ada\" };\nconst city = user?.address?.city ?? \"Bilinmiyor\"; // \"Bilinmiyor\"" },
    },
    {
        id: "mutability",
        title: { TR: "Değiştirilebilirlik (mutable / immutable)", EN: "Mutability (mutable / immutable)" },
        keywords: "değiştirilebilir değiştirilemez mutable immutable sabit nesne tuple frozen kopya copy shallow deep copy sığ kopya derin kopya",
        text: {
            TR: "Değiştirilebilir (mutable) bir nesne yerinde değiştirilebilir (Python'da list, dict; JavaScript'te dizi ve nesneler); değiştirilemez (immutable) bir değer ise değişiklikte yenisi üretilir (metinler, sayılar, Python'da tuple). Aynı listeyi iki değişken paylaşıyorsa birindeki değişiklik diğerinde de görünür; gerekirse kopya (sığ ya da derin) al.",
            EN: "A mutable object can be changed in place (lists and dicts in Python; arrays and objects in JavaScript); an immutable value is replaced by a new one when changed (strings, numbers, tuples in Python). If two variables share the same list, a change through one shows up in the other; take a (shallow or deep) copy when needed.",
        },
    },
    {
        id: "value-reference",
        title: { TR: "Değerle ve referansla aktarım", EN: "Pass by value and by reference" },
        keywords: "değerle aktarım referansla aktarım pass by value pass by reference referans reference pointer işaretçi kopya parametre aktarımı",
        text: {
            TR: "Değerle aktarımda fonksiyon argümanın bir kopyasını alır; içerideki değişiklik dışarıyı etkilemez. Referansla aktarımda fonksiyon aynı nesneye erişir ve onu değiştirebilir. Python, Java ve JavaScript nesneleri \"referansın değeriyle\" aktarır: içerideki nesneyi değiştirebilirsin ama değişkene yeni bir nesne atamak dışarıyı etkilemez.",
            EN: "With pass by value the function gets a copy of the argument; changes inside don't affect the caller. With pass by reference it works on the same object and can change it. Python, Java and JavaScript pass objects \"by the value of the reference\": you can modify the object inside, but assigning a new object to the parameter doesn't affect the caller.",
        },
    },
    {
        id: "compiler-interpreter",
        title: { TR: "Derleyici ve yorumlayıcı", EN: "Compilers and interpreters" },
        keywords: "derleyici compiler yorumlayıcı interpreter derleme compile çalıştırma bytecode jit makine kodu derlenen yorumlanan dil",
        text: {
            TR: "Derleyici, kaynak kodu çalıştırmadan önce bütünüyle makine koduna ya da ara koda (bytecode) çevirir (C, C++, Rust, Go); hatalar çoğunlukla derlemede yakalanır. Yorumlayıcı kodu çalıştırırken satır satır işler (Python, Ruby). Java ve C# önce bytecode'a derlenir, sonra çalışma zamanında JIT ile makine koduna çevrilir.",
            EN: "A compiler translates the whole source to machine code or an intermediate bytecode before running (C, C++, Rust, Go); many errors are caught at compile time. An interpreter processes the code while running it (Python, Ruby). Java and C# are compiled to bytecode first and turned into machine code at run time by a JIT.",
        },
    },
    {
        id: "typing",
        title: { TR: "Statik ve dinamik tip", EN: "Static and dynamic typing" },
        keywords: "statik tip dinamik tip static typing dynamic typing type checking tip denetimi typescript type hint tip ipucu güçlü zayıf tip strongly weakly typed",
        text: {
            TR: "Statik tipli dillerde (Java, C#, TypeScript, Go) değişkenlerin tipi derleme sırasında denetlenir; birçok hata kod çalışmadan yakalanır. Dinamik tipli dillerde (Python, JavaScript) tip çalışma anında belirlenir; yazmak daha hızlıdır ama tip hataları geç ortaya çıkar. Python'daki tip ipuçları ve TypeScript iki dünyanın arasında bir denge sağlar.",
            EN: "In statically typed languages (Java, C#, TypeScript, Go) variable types are checked at compile time, so many bugs are caught before the code runs. In dynamically typed languages (Python, JavaScript) types are decided at run time: faster to write, but type errors show up later. Python's type hints and TypeScript sit between the two.",
        },
    },
    {
        id: "api",
        title: { TR: "API", EN: "APIs" },
        keywords: "api uygulama programlama arayüzü application programming interface endpoint uç nokta web api sdk istemci client sunucu server",
        text: {
            TR: "API, bir yazılımın başka bir yazılıma sunduğu tanımlı kullanım yoludur: hangi istekleri kabul ettiğini ve ne döndürdüğünü belirler. Web API'leri genellikle HTTP üzerinden JSON alıp verir; bir hava durumu servisine şehir gönderip sıcaklığı almak buna örnektir. Hanogt'un kendi geliştirici API'si de /ai/api sayfasında anlatılıyor.",
            EN: "An API is the defined way one piece of software offers its features to another: which requests it accepts and what it returns. Web APIs usually exchange JSON over HTTP; sending a city to a weather service and getting the temperature back is an example. Hanogt's own developer API is described on the /ai/api page.",
        },
    },
    {
        id: "rest-http",
        title: { TR: "REST ve HTTP metotları", EN: "REST and HTTP methods" },
        keywords: "rest restful http metot method get post put patch delete istek request yanıt response endpoint idempotent crud",
        text: {
            TR: "REST, kaynakları URL'lerle adlandırıp HTTP metotlarıyla işlemeyi öneren bir API tarzıdır: GET okur, POST oluşturur, PUT/PATCH günceller, DELETE siler (CRUD). GET güvenlidir ve veriyi değiştirmemelidir; PUT ve DELETE aynı istek tekrarlansa da aynı sonucu verecek şekilde (idempotent) tasarlanır. Sonuç, durum koduyla birlikte genellikle JSON olarak döner.",
            EN: "REST is an API style that names resources with URLs and works on them with HTTP methods: GET reads, POST creates, PUT/PATCH update, DELETE removes (CRUD). GET is safe and must not change data; PUT and DELETE are designed to be idempotent (repeating the request has the same effect). Results usually come back as JSON with a status code.",
        },
    },
    {
        id: "http-status",
        title: { TR: "HTTP durum kodları", EN: "HTTP status codes" },
        keywords: "http durum kodu status code 200 201 204 301 400 401 403 404 409 429 500 502 503 hata kodu",
        text: {
            TR: "HTTP durum kodu isteğin sonucunu söyler: 2xx başarı (200 OK, 201 oluşturuldu), 3xx yönlendirme, 4xx istemci hatası (400 hatalı istek, 401 giriş gerekli, 403 yetki yok, 404 bulunamadı, 429 çok fazla istek), 5xx sunucu hatası (500 iç hata, 503 hizmet geçici olarak kullanılamıyor). 4xx'te isteği düzeltmek, 5xx'te bekleyip yeniden denemek gerekir.",
            EN: "An HTTP status code tells you how a request went: 2xx success (200 OK, 201 created), 3xx redirects, 4xx client errors (400 bad request, 401 sign-in needed, 403 forbidden, 404 not found, 429 too many requests), 5xx server errors (500 internal error, 503 service unavailable). For 4xx fix the request; for 5xx wait and retry.",
        },
    },
    {
        id: "json",
        title: { TR: "JSON", EN: "JSON" },
        keywords: "json javascript object notation veri formatı serileştirme serialization parse stringify nesne dizi",
        text: {
            TR: "JSON, veriyi nesneler (`{}`), diziler (`[]`), metinler, sayılar, true/false ve null ile yazan, insanların da okuyabildiği bir metin biçimidir; web API'lerinin ortak dilidir. Anahtarlar çift tırnakla yazılır ve sonda virgül olamaz. JavaScript'te `JSON.parse`/`JSON.stringify`, Python'da `json.loads`/`json.dumps` kullanılır.",
            EN: "JSON is a human-readable text format that writes data with objects (`{}`), arrays (`[]`), strings, numbers, true/false and null; it's the common language of web APIs. Keys use double quotes and trailing commas aren't allowed. Use `JSON.parse`/`JSON.stringify` in JavaScript and `json.loads`/`json.dumps` in Python.",
        },
        example: { language: "python", code: "import json\n\ndata = json.loads('{\"name\": \"Ada\", \"skills\": [\"python\", \"sql\"]}')\nprint(data[\"skills\"][0])  # python" },
    },
    {
        id: "sql",
        title: { TR: "SQL ve veritabanları", EN: "SQL and databases" },
        keywords: "sql veritabanı veritabani database select insert update delete join where tablo table ilişkisel relational primary key birincil anahtar foreign key index indeks nosql",
        text: {
            TR: "İlişkisel veritabanları veriyi tablolarda tutar ve SQL ile sorgulanır: SELECT okur, INSERT ekler, UPDATE günceller, DELETE siler, JOIN tabloları ilişkili sütunlar üzerinden birleştirir. Sık aranan sütunlara indeks eklemek sorguları hızlandırır. Kullanıcı girdisini sorguya asla metin olarak eklemeyip parametreli sorgu kullanmak SQL enjeksiyonunu önler. NoSQL veritabanları (Firestore, MongoDB) ise belgeler gibi daha esnek yapılar tutar.",
            EN: "Relational databases keep data in tables and are queried with SQL: SELECT reads, INSERT adds, UPDATE changes, DELETE removes, and JOIN combines tables through related columns. Indexes on frequently searched columns speed queries up. Never paste user input into a query as text; parameterized queries prevent SQL injection. NoSQL databases (Firestore, MongoDB) store more flexible structures such as documents.",
        },
        example: { language: "sql", code: "SELECT users.name, COUNT(orders.id) AS order_count\nFROM users\nLEFT JOIN orders ON orders.user_id = users.id\nGROUP BY users.name\nORDER BY order_count DESC;" },
    },
    {
        id: "git",
        title: { TR: "Git: commit, branch ve merge", EN: "Git: commits, branches and merges" },
        keywords: "git commit branch dal merge birleştirme versiyon kontrol version control sürüm kontrol clone push pull rebase conflict çakışma github repository depo",
        text: {
            TR: "Git, dosyalardaki değişikliklerin geçmişini tutan bir sürüm kontrol sistemidir. Commit bir anlık görüntüdür; branch (dal) ana kodu bozmadan ayrı bir çalışma hattı açar; merge dalları birleştirir; aynı satırlar iki dalda değiştiyse çakışma (conflict) elle çözülür. `git status`, `git add`, `git commit -m \"...\"`, `git push` en sık kullanılan komutlardır.",
            EN: "Git is a version control system that keeps the history of changes to your files. A commit is a snapshot; a branch opens a separate line of work without breaking the main code; merge joins branches, and if the same lines changed on both, the conflict is resolved by hand. `git status`, `git add`, `git commit -m \"...\"` and `git push` are the everyday commands.",
        },
        example: { language: "bash", code: "git switch -c yeni-ozellik\ngit add .\ngit commit -m \"Giriş formunu ekle\"\ngit push -u origin yeni-ozellik" },
    },
    {
        id: "pull-request",
        title: { TR: "Pull request ve kod incelemesi", EN: "Pull requests and code review" },
        keywords: "pull request pr merge request kod incelemesi code review onay review github gitlab inceleme",
        text: {
            TR: "Pull request (PR), bir daldaki değişiklikleri ana dala almadan önce ekibin incelemesine sunmaktır. İnceleyenler yorum yazar, otomatik testler çalışır ve onaydan sonra birleştirilir. Küçük, tek konulu ve açıklaması iyi yazılmış PR'lar daha hızlı ve daha doğru incelenir.",
            EN: "A pull request (PR) proposes the changes on a branch for the team to review before they go into the main branch. Reviewers comment, automated tests run, and it's merged after approval. Small, single-topic PRs with a good description get reviewed faster and better.",
        },
    },
    {
        id: "package-manager",
        title: { TR: "Paket yöneticisi ve bağımlılıklar", EN: "Package managers and dependencies" },
        keywords: "paket yöneticisi package manager npm pip yarn pnpm nuget maven cargo bağımlılık dependency kütüphane yükleme install package.json requirements.txt lock dosyası",
        text: {
            TR: "Paket yöneticisi, projenin kullandığı hazır kütüphaneleri (bağımlılıkları) indirir, sürümlerini takip eder ve günceller: JavaScript'te npm/pnpm, Python'da pip, C#'ta NuGet, Java'da Maven/Gradle. Bağımlılıklar `package.json` ya da `requirements.txt` gibi dosyalarda yazılır; lock dosyası herkesin aynı sürümleri kurmasını sağlar.",
            EN: "A package manager downloads the ready-made libraries (dependencies) a project uses, tracks their versions and updates them: npm/pnpm for JavaScript, pip for Python, NuGet for C#, Maven/Gradle for Java. Dependencies are listed in files such as `package.json` or `requirements.txt`; the lock file makes everyone install the same versions.",
        },
    },
    {
        id: "framework-library",
        title: { TR: "Framework ve kütüphane farkı", EN: "Frameworks vs libraries" },
        keywords: "framework çatı kütüphane kutuphane library fark difference react vue angular django next.js express inversion of control",
        text: {
            TR: "Kütüphaneyi sen çağırırsın: ihtiyacın olan fonksiyonu alıp kendi akışında kullanırsın (ör. lodash, NumPy). Framework ise uygulamanın iskeletini kurar ve senin kodunu kendi belirlediği yerlerde çağırır (ör. Django, Angular, Next.js). Kısacası kütüphanede kontrol sende, framework'te çatıdadır.",
            EN: "You call a library: you take the function you need and use it in your own flow (e.g. lodash, NumPy). A framework sets up the application's skeleton and calls your code at the places it defines (e.g. Django, Angular, Next.js). In short, with a library you're in control; with a framework, the framework is.",
        },
    },
    {
        id: "regex",
        title: { TR: "Düzenli ifadeler (regex)", EN: "Regular expressions (regex)" },
        keywords: "düzenli ifade duzenli ifade regex regexp regular expression desen pattern eşleşme match e-posta doğrulama capture group grup",
        text: {
            TR: "Düzenli ifadeler (regex), metinde desen aramak, doğrulamak ve parçalamak için kullanılan küçük bir dildir: `\\d` rakam, `\\w` harf/rakam/alt çizgi, `+` bir veya daha fazla, `^` ve `$` metnin başı ve sonu demektir. Kısa doğrulamalar için güçlüdür ama karmaşık biçimleri (HTML gibi) regex'le ayrıştırmak hataya açıktır.",
            EN: "Regular expressions (regex) are a small language for searching, validating and splitting text by pattern: `\\d` is a digit, `\\w` a letter/digit/underscore, `+` one or more, `^` and `$` the start and end of the text. They are powerful for short validations, but parsing complex formats (such as HTML) with regex is error-prone.",
        },
        example: { language: "python", code: "import re\n\nprint(bool(re.fullmatch(r\"[\\w.+-]+@[\\w-]+\\.[\\w.]+\", \"ada@example.com\")))  # True" },
    },
    {
        id: "unit-test",
        title: { TR: "Birim testi", EN: "Unit testing" },
        keywords: "birim testi unit test test yazmak pytest jest junit assert doğrulama tdd test güdümlü geliştirme mock coverage kapsam",
        text: {
            TR: "Birim testi, kodun küçük bir parçasının (genellikle bir fonksiyonun) belirli girdiler için beklenen sonucu verdiğini otomatik olarak kontrol eder. Normal durumları ve uç durumları (boş girdi, sıfır, çok büyük değer) test et. Python'da pytest, JavaScript'te Jest ya da node:test, Java'da JUnit yaygındır.",
            EN: "A unit test automatically checks that a small piece of code (usually one function) gives the expected result for given inputs. Test the normal cases and the edge cases (empty input, zero, very large values). pytest for Python, Jest or node:test for JavaScript and JUnit for Java are common.",
        },
        example: { language: "python", code: "def add(a, b):\n    return a + b\n\ndef test_add():\n    assert add(2, 3) == 5\n    assert add(-1, 1) == 0\n# Çalıştır: pytest" },
    },
    {
        id: "debugging",
        title: { TR: "Hata ayıklama (debugging)", EN: "Debugging" },
        keywords: "hata ayıklama debug debugging debugger breakpoint kesme noktası console.log print stack trace adım adım step hata bulma",
        text: {
            TR: "Hata ayıklarken önce hatayı her seferinde yeniden üretebileceğin en küçük örneği bul, sonra hata mesajını ve yığın izini (stack trace) sondan başa doğru oku: hangi dosyanın hangi satırında olduğu yazar. Değişkenleri `print`/`console.log` ile ya da debugger'da kesme noktası (breakpoint) koyup adım adım izle; bir seferde tek bir şeyi değiştir.",
            EN: "When debugging, first find the smallest example that reproduces the bug every time, then read the error message and the stack trace from the bottom up: it tells you the file and line. Watch variables with `print`/`console.log` or by setting a breakpoint in a debugger and stepping through; change one thing at a time.",
        },
    },
    {
        id: "clean-code",
        title: { TR: "Temiz kod ve yeniden düzenleme", EN: "Clean code and refactoring" },
        keywords: "temiz kod clean code refactoring yeniden düzenleme refactor okunabilirlik readability dry kendini tekrar etme kiss solid isimlendirme kod kalitesi",
        text: {
            TR: "Temiz kod; anlamlı isimler, tek işi yapan kısa fonksiyonlar ve tekrar etmeyen (DRY) mantıkla okunabilir kalan koddur. Yeniden düzenleme (refactoring), davranışı değiştirmeden kodun yapısını iyileştirmektir; testler varken yapmak güvenlidir. Akıllıca ama anlaşılmaz bir satır yerine sıkıcı ama açık bir kod tercih et.",
            EN: "Clean code stays readable with meaningful names, short functions that do one thing and logic that isn't repeated (DRY). Refactoring is improving the code's structure without changing its behavior; it's safe when tests are in place. Prefer boring, clear code to a clever line nobody understands.",
        },
    },
    {
        id: "design-patterns",
        title: { TR: "Tasarım kalıpları", EN: "Design patterns" },
        keywords: "tasarım kalıbı tasarim kalibi design pattern singleton factory fabrika observer gözlemci strategy strateji adapter decorator mvc",
        text: {
            TR: "Tasarım kalıpları, sık karşılaşılan tasarım sorunlarına denenmiş çözümlerin adlarıdır: Singleton tek bir örnek, Factory nesne üretimini bir yerde toplar, Observer bir değişikliği abonelere duyurur, Strategy davranışı değiştirilebilir yapar. Kalıp bir amaç değil araçtır; ihtiyaç yokken kullanmak kodu gereksiz karmaşıklaştırır.",
            EN: "Design patterns are names for proven solutions to recurring design problems: Singleton keeps a single instance, Factory centralizes object creation, Observer announces a change to subscribers, Strategy makes behavior swappable. A pattern is a tool, not a goal; using one without need just complicates the code.",
        },
    },
    {
        id: "env-vars",
        title: { TR: "Ortam değişkenleri ve gizli anahtarlar", EN: "Environment variables and secrets" },
        keywords: "ortam değişkeni environment variable env .env process.env os.environ gizli anahtar api key secret yapılandırma configuration",
        text: {
            TR: "Ortam değişkenleri, kodun dışında tutulan yapılandırma değerleridir (veritabanı adresi, API anahtarı). Gizli anahtarları asla koda ya da depoya (git) yazma; `.env` dosyasını `.gitignore`'a ekle ve kodda `process.env.API_KEY` (Node) ya da `os.environ[\"API_KEY\"]` (Python) ile oku. Bir anahtar yanlışlıkla paylaşıldıysa hemen iptal edip yenisini oluştur.",
            EN: "Environment variables are configuration values kept outside the code (database address, API key). Never write secrets into code or the repository (git); add the `.env` file to `.gitignore` and read values with `process.env.API_KEY` (Node) or `os.environ[\"API_KEY\"]` (Python). If a key was shared by mistake, revoke it right away and create a new one.",
        },
    },
    {
        id: "hash-encryption",
        title: { TR: "Hash ve şifreleme farkı", EN: "Hashing vs encryption" },
        keywords: "hash hashing özet şifreleme sifreleme encryption decryption çözme bcrypt scrypt argon2 sha256 md5 parola saklama salt tuz",
        text: {
            TR: "Şifreleme geri döndürülebilir: anahtarı olan veriyi çözebilir (ör. AES, HTTPS). Hash tek yönlüdür: aynı girdi hep aynı özeti verir ama özetten girdi geri elde edilemez. Parolalar şifrelenmez, bcrypt/scrypt/Argon2 gibi yavaş ve tuzlu (salt) hash'lerle saklanır; MD5 ya da düz SHA-256 parola için uygun değildir.",
            EN: "Encryption is reversible: whoever has the key can decrypt the data (e.g. AES, HTTPS). A hash is one-way: the same input always gives the same digest, but the input can't be recovered from it. Passwords aren't encrypted; they're stored with slow, salted hashes such as bcrypt, scrypt or Argon2. MD5 or plain SHA-256 isn't suitable for passwords.",
        },
    },
    {
        id: "frontend-backend",
        title: { TR: "Frontend, backend ve full stack", EN: "Frontend, backend and full stack" },
        keywords: "frontend ön yüz backend arka uç full stack istemci client sunucu server html css javascript veritabanı web geliştirme",
        text: {
            TR: "Frontend, kullanıcının tarayıcıda gördüğü ve etkileşime girdiği kısımdır (HTML, CSS, JavaScript; React gibi araçlar). Backend sunucuda çalışır: veriyi saklar, iş kurallarını uygular ve API sunar (Node.js, Python, Java, C#). Full stack geliştirici ikisinde de çalışır.",
            EN: "The frontend is the part users see and interact with in the browser (HTML, CSS, JavaScript; tools such as React). The backend runs on the server: it stores data, applies business rules and serves an API (Node.js, Python, Java, C#). A full-stack developer works on both.",
        },
    },
    {
        id: "dom",
        title: { TR: "DOM", EN: "The DOM" },
        keywords: "dom document object model belge nesne modeli html element queryselector getelementbyid addeventlistener olay event tarayıcı",
        text: {
            TR: "DOM (Document Object Model), tarayıcının HTML sayfasını bir nesne ağacı olarak sunmasıdır. JavaScript bu ağaçta öğe bulur (`document.querySelector`), içeriği değiştirir ve olay dinler (`addEventListener`). Kullanıcıdan gelen metni sayfaya eklerken `innerHTML` yerine `textContent` kullanmak XSS saldırılarını önler.",
            EN: "The DOM (Document Object Model) is the browser's view of an HTML page as a tree of objects. JavaScript finds elements in it (`document.querySelector`), changes their content and listens for events (`addEventListener`). When putting user-supplied text on the page, using `textContent` instead of `innerHTML` prevents XSS attacks.",
        },
        example: { language: "javascript", code: "const button = document.querySelector(\"#kaydet\");\nbutton.addEventListener(\"click\", () => {\n    document.querySelector(\"#durum\").textContent = \"Kaydedildi\";\n});" },
    },
    {
        id: "cors",
        title: { TR: "CORS", EN: "CORS" },
        keywords: "cors cross origin resource sharing kaynaklar arası köken origin access-control-allow-origin preflight tarayıcı engeli blocked by cors policy",
        text: {
            TR: "CORS, bir web sayfasının başka bir kökendeki (alan adı, port ya da protokol farklı) sunucuya istek atıp atamayacağını tarayıcının denetlemesidir. Sunucu `Access-Control-Allow-Origin` gibi başlıklarla izin vermezse tarayıcı yanıtı sayfaya vermez. Çözüm sunucu tarafındadır: izin verilen kökenleri ayarla; gizli anahtarları asla tarayıcı koduna koyma.",
            EN: "CORS is the browser checking whether a web page may call a server on another origin (a different domain, port or protocol). If the server doesn't allow it with headers such as `Access-Control-Allow-Origin`, the browser withholds the response from the page. The fix is on the server: configure the allowed origins, and never put secret keys in browser code.",
        },
    },
    {
        id: "memory",
        title: { TR: "Bellek yönetimi ve çöp toplayıcı", EN: "Memory management and garbage collection" },
        keywords: "bellek yönetimi memory management çöp toplayıcı garbage collector gc bellek sızıntısı memory leak heap stack yığın malloc free pointer referans sayma",
        text: {
            TR: "Program çalışırken nesneler bellekte (heap) yer kaplar. C ve C++'ta belleği elle ayırıp bırakırsın (ya da akıllı işaretçiler kullanırsın); Java, C#, Python ve JavaScript'te çöp toplayıcı artık ulaşılamayan nesneleri kendisi temizler. Gereksiz yere tutulan referanslar (sürekli büyüyen önbellekler, kaldırılmayan olay dinleyicileri) yine de bellek sızıntısına yol açar.",
            EN: "While a program runs, objects take up memory (on the heap). In C and C++ you allocate and free memory yourself (or use smart pointers); in Java, C#, Python and JavaScript a garbage collector cleans up objects that can no longer be reached. References kept by mistake (ever-growing caches, event listeners never removed) still cause memory leaks.",
        },
    },
    {
        id: "programming-paradigms",
        title: { TR: "Programlama paradigmaları", EN: "Programming paradigms" },
        keywords: "paradigma paradigm fonksiyonel programlama functional programming prosedürel procedural nesne yönelimli imperative declarative bildirimsel saf fonksiyon pure function map filter reduce",
        text: {
            TR: "Paradigma, programı düşünme biçimidir. Prosedürel programlama adım adım talimatlar yazar; nesne yönelimli programlama veriyi ve davranışı nesnelerde toplar; fonksiyonel programlama yan etkisiz saf fonksiyonlarla ve `map`/`filter`/`reduce` gibi dönüşümlerle çalışır. Modern diller (Python, JavaScript, C#) bu yaklaşımları birlikte kullanmana izin verir.",
            EN: "A paradigm is a way of thinking about a program. Procedural programming writes step-by-step instructions; object-oriented programming groups data and behavior into objects; functional programming works with side-effect-free pure functions and transformations such as `map`/`filter`/`reduce`. Modern languages (Python, JavaScript, C#) let you mix these approaches.",
        },
        example: { language: "javascript", code: "const total = [3, 8, 12, 5]\n    .filter((n) => n > 4)\n    .map((n) => n * 2)\n    .reduce((sum, n) => sum + n, 0); // 50" },
    },
    {
        id: "caching",
        title: { TR: "Önbellek (cache)", EN: "Caching" },
        keywords: "önbellek onbellek cache caching memoization memoize ttl geçersiz kılma invalidation redis cdn hız",
        text: {
            TR: "Önbellek, pahalı bir işin (veritabanı sorgusu, ağ isteği, uzun hesaplama) sonucunu bir süre saklayıp tekrar istendiğinde hızlıca vermektir. Zor olan, veri değiştiğinde önbelleği doğru zamanda geçersiz kılmaktır; bu yüzden çoğu önbelleğe bir yaşam süresi (TTL) verilir. Aynı argümanlarla çağrılan saf fonksiyonların sonucunu saklamaya memoization denir.",
            EN: "A cache keeps the result of expensive work (a database query, a network request, a long computation) for a while and serves it quickly when asked again. The hard part is invalidating it at the right time when the data changes, which is why most caches get a time to live (TTL). Storing the results of a pure function by its arguments is called memoization.",
        },
    },
];
