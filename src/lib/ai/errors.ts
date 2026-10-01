/**
 * Error explainer for Hanogt AI Core: recognizes common compiler/runtime
 * messages (Python, JavaScript/TypeScript, C#, C++, Java, Lua, SQL and the
 * Hanogt Engine VM) and explains the usual cause and fix.
 */
import type { Copy } from "@/lib/i18n";

export interface ErrorPattern {
    id: string;
    language: string;
    pattern: RegExp;
    title: Copy;
    cause: Copy;
    fix: Copy;
}

export const ERROR_PATTERNS: ErrorPattern[] = [
    // ---------------------------------------------------------------- Python
    {
        id: "py-name", language: "Python", pattern: /NameError: name '([^']+)' is not defined/i,
        title: { TR: "NameError: tanımsız isim", EN: "NameError: undefined name" },
        cause: { TR: "Kullandığın değişken, fonksiyon ya da modül o noktada tanımlı değil. Genelde yazım hatası, tanımdan önce kullanma ya da `import` eksikliğidir.", EN: "The variable, function or module you used isn't defined at that point. It's usually a typo, using it before it's defined, or a missing `import`." },
        fix: { TR: "• İsmin yazımını ve büyük/küçük harfini kontrol et.\n• Değişkeni kullanmadan önce ata.\n• Modülse dosyanın başına `import` ekle.\n• Fonksiyon içinde tanımladığın bir değişkeni dışarıda kullanıyorsan `return` ile döndür.", EN: "• Check the spelling and letter case.\n• Assign the variable before using it.\n• If it's a module, add an `import` at the top.\n• If you defined it inside a function, `return` it to use it outside." },
    },
    {
        id: "py-index", language: "Python", pattern: /IndexError: (?:list|string|tuple) index out of range/i,
        title: { TR: "IndexError: dizin aralık dışında", EN: "IndexError: index out of range" },
        cause: { TR: "Listede olmayan bir konuma eriştin. N elemanlı bir listenin geçerli dizinleri 0 ile N-1 arasıdır.", EN: "You accessed a position that doesn't exist. Valid indexes of an N-item list are 0 to N-1." },
        fix: { TR: "• `range(len(items))` kullanıyorsan sınırları kontrol et ya da doğrudan `for item in items:` yaz.\n• Erişmeden önce `if i < len(items):` ile denetle.\n• Boş liste olasılığını düşün: `items[0]` boş listede hata verir.", EN: "• If you use `range(len(items))`, check the bounds, or simply write `for item in items:`.\n• Guard with `if i < len(items):` before accessing.\n• Consider empty lists: `items[0]` fails on an empty list." },
    },
    {
        id: "py-key", language: "Python", pattern: /KeyError: ?['"]?([^'"\n]*)/i,
        title: { TR: "KeyError: anahtar yok", EN: "KeyError: missing key" },
        cause: { TR: "Sözlükte bulunmayan bir anahtarı `dict[key]` ile okudun.", EN: "You read a key that isn't in the dictionary with `dict[key]`." },
        fix: { TR: "• `data.get(key, varsayılan)` kullan.\n• Ya da önce `if key in data:` ile kontrol et.\n• Anahtarın yazımını ve türünü (str/int) kontrol et.", EN: "• Use `data.get(key, default)`.\n• Or check `if key in data:` first.\n• Verify the key's spelling and type (str vs int)." },
    },
    {
        id: "py-type-operand", language: "Python", pattern: /TypeError: unsupported operand type\(s\)|TypeError: can only concatenate str|TypeError: must be str, not/i,
        title: { TR: "TypeError: uyumsuz türler", EN: "TypeError: incompatible types" },
        cause: { TR: "Farklı türleri birleştirmeye çalıştın; örneğin metin ile sayıyı `+` ile topladın. `input()` her zaman metin döndürür.", EN: "You combined different types, e.g. added a string and a number with `+`. `input()` always returns a string." },
        fix: { TR: "• Sayıya çevir: `int(input())` ya da `float(...)`.\n• Metne çevir: `str(sayi)` veya f-string: `f\"Skor: {score}\"`.", EN: "• Convert to a number: `int(input())` or `float(...)`.\n• Convert to text: `str(number)` or an f-string: `f\"Score: {score}\"`." },
    },
    {
        id: "py-nonetype", language: "Python", pattern: /'NoneType' object (?:has no attribute|is not subscriptable|is not iterable)/i,
        title: { TR: "NoneType hatası", EN: "NoneType error" },
        cause: { TR: "Değer `None`; büyük ihtimalle bir fonksiyon `return` etmeden bitti ya da `list.sort()` gibi yerinde değiştiren bir metodun sonucunu atadın.", EN: "The value is `None`; most likely a function ended without `return`, or you assigned the result of an in-place method like `list.sort()`." },
        fix: { TR: "• Fonksiyonun bir değer döndürdüğünden emin ol.\n• `items = items.sort()` yerine `items.sort()` ya da `items = sorted(items)` yaz.\n• Kullanmadan önce `if value is not None:` ile kontrol et.", EN: "• Make sure the function returns a value.\n• Write `items.sort()` or `items = sorted(items)` instead of `items = items.sort()`.\n• Check `if value is not None:` before using it." },
    },
    {
        id: "py-value-int", language: "Python", pattern: /ValueError: invalid literal for int\(\)/i,
        title: { TR: "ValueError: sayıya çevrilemedi", EN: "ValueError: not a number" },
        cause: { TR: "`int()` sayı olmayan bir metin aldı (boşluk, harf, boş satır ya da `3.5` gibi ondalık).", EN: "`int()` received text that isn't an integer (spaces, letters, an empty line or a decimal like `3.5`)." },
        fix: { TR: "• Girdiyi **Girdi** sekmesine yazdığından emin ol.\n• `int(text.strip())` kullan; ondalık için `float()`.\n• Kullanıcı girdisini `try/except ValueError` ile yakala.", EN: "• Make sure you typed the input in the **Input** tab.\n• Use `int(text.strip())`; `float()` for decimals.\n• Catch bad input with `try/except ValueError`." },
    },
    {
        id: "py-indent", language: "Python", pattern: /IndentationError|TabError|unexpected indent|expected an indented block/i,
        title: { TR: "Girinti hatası", EN: "Indentation error" },
        cause: { TR: "Python blokları girintiyle belirler. Satırların girintisi tutarsız ya da `if`/`for`/`def` sonrasında girintili satır yok.", EN: "Python defines blocks by indentation. The lines are indented inconsistently, or an `if`/`for`/`def` has no indented body." },
        fix: { TR: "• Her seviye için 4 boşluk kullan; sekme ve boşluğu karıştırma.\n• `:` ile biten satırdan sonra en az bir girintili satır olmalı (boşsa `pass`).", EN: "• Use 4 spaces per level; don't mix tabs and spaces.\n• A line ending with `:` needs at least one indented line after it (`pass` if empty)." },
    },
    {
        id: "py-syntax", language: "Python", pattern: /SyntaxError: (?:invalid syntax|expected ':'|unterminated string|EOL while scanning|'\(' was never closed)/i,
        title: { TR: "SyntaxError: sözdizimi hatası", EN: "SyntaxError: invalid syntax" },
        cause: { TR: "Kod Python dilbilgisine uymuyor: eksik `:`, kapanmamış parantez/tırnak ya da yanlış operatör (`=` yerine `==`).", EN: "The code breaks Python's grammar: a missing `:`, an unclosed bracket/quote or a wrong operator (`=` instead of `==`)." },
        fix: { TR: "• Hata satırını **ve bir önceki satırı** kontrol et; eksik parantez genelde öncekindedir.\n• `if`, `for`, `while`, `def`, `class` satırları `:` ile biter.\n• Karşılaştırmada `==` kullan.", EN: "• Check the error line **and the line before it**; a missing bracket is usually earlier.\n• `if`, `for`, `while`, `def` and `class` lines end with `:`.\n• Use `==` for comparison." },
    },
    {
        id: "py-zero", language: "Python", pattern: /ZeroDivisionError/i,
        title: { TR: "ZeroDivisionError: sıfıra bölme", EN: "ZeroDivisionError: division by zero" },
        cause: { TR: "Bir sayıyı sıfıra böldün ya da `%` ile sıfıra göre mod aldın.", EN: "You divided by zero or took a modulo by zero with `%`." },
        fix: { TR: "• Bölmeden önce `if divisor != 0:` ile kontrol et.\n• Ortalama alırken boş liste olasılığını düşün.", EN: "• Check `if divisor != 0:` before dividing.\n• When averaging, handle the empty-list case." },
    },
    {
        id: "py-module", language: "Python", pattern: /ModuleNotFoundError: No module named '([^']+)'/i,
        title: { TR: "ModuleNotFoundError: modül bulunamadı", EN: "ModuleNotFoundError: module not found" },
        cause: { TR: "İçe aktardığın paket kurulu değil ya da adı yanlış.", EN: "The package you import isn't installed or its name is wrong." },
        fix: { TR: "• Hanogt'un tarayıcı Python'u (Pyodide) standart kütüphaneyi ve bazı bilimsel paketleri içerir; `pip install` yoktur.\n• Kendi bilgisayarında `pip install paket_adi` ile kur.\n• Modül adını kontrol et (ör. `sklearn` paketi `scikit-learn` olarak kurulur).", EN: "• Hanogt's in-browser Python (Pyodide) ships the standard library and some scientific packages; there is no `pip install`.\n• On your own machine run `pip install package_name`.\n• Check the module name (e.g. `sklearn` is installed as `scikit-learn`)." },
    },
    {
        id: "py-recursion", language: "Python", pattern: /RecursionError: maximum recursion depth exceeded/i,
        title: { TR: "RecursionError: özyineleme çok derin", EN: "RecursionError: recursion too deep" },
        cause: { TR: "Fonksiyon kendini durmadan çağırıyor; temel durum (base case) eksik ya da hiç ulaşılmıyor.", EN: "The function keeps calling itself; the base case is missing or never reached." },
        fix: { TR: "• Özyinelemenin bir duruş koşulu olduğundan emin ol (ör. `if n <= 1: return 1`).\n• Her çağrıda problemin küçüldüğünü kontrol et.\n• Çok derin işlerde döngüye çevir.", EN: "• Make sure the recursion has a stop condition (e.g. `if n <= 1: return 1`).\n• Check that every call makes the problem smaller.\n• Convert very deep recursion to a loop." },
    },
    {
        id: "py-attribute", language: "Python", pattern: /AttributeError: '([^']+)' object has no attribute '([^']+)'/i,
        title: { TR: "AttributeError: özellik yok", EN: "AttributeError: no such attribute" },
        cause: { TR: "Nesnede olmayan bir metot ya da özellik çağırdın (yazım hatası ya da yanlış tür).", EN: "You called a method or attribute that the object doesn't have (a typo or the wrong type)." },
        fix: { TR: "• `print(type(x))` ve `dir(x)` ile nesnenin türünü ve metotlarını gör.\n• Örn. listeye `push` değil `append` ile eklenir.", EN: "• Use `print(type(x))` and `dir(x)` to see the type and its methods.\n• E.g. lists use `append`, not `push`." },
    },
    // ---------------------------------------------------------------- JavaScript / TypeScript
    {
        id: "js-undefined-prop", language: "JavaScript", pattern: /Cannot read propert(?:y|ies) of (undefined|null)|undefined is not an object/i,
        title: { TR: "TypeError: undefined/null üzerinde özellik okuma", EN: "TypeError: reading a property of undefined/null" },
        cause: { TR: "`a.b` yazdığında `a` henüz `undefined` ya da `null`. Genelde veri gelmeden kullanılıyor, dizin yanlış ya da DOM öğesi bulunamadı.", EN: "When you wrote `a.b`, `a` was still `undefined` or `null`. Usually the data hasn't arrived yet, an index is wrong or a DOM element wasn't found." },
        fix: { TR: "• İsteğe bağlı zincirleme kullan: `a?.b`.\n• Varsayılan ver: `const items = data?.items ?? [];`\n• `document.querySelector` sonucunu kullanmadan önce kontrol et.\n• Asenkron veride `await` ettiğinden emin ol.", EN: "• Use optional chaining: `a?.b`.\n• Provide a default: `const items = data?.items ?? [];`\n• Check `document.querySelector` results before using them.\n• Make sure you `await` asynchronous data." },
    },
    {
        id: "js-not-function", language: "JavaScript", pattern: /TypeError: [\w.$[\]'"]+ is not a function/i,
        title: { TR: "TypeError: ... bir fonksiyon değil", EN: "TypeError: ... is not a function" },
        cause: { TR: "Fonksiyon olmayan bir şeyi çağırdın: yazım hatası, yanlış import/export ya da dizi olmayan bir değerde `map` gibi dizi metodu.", EN: "You called something that isn't a function: a typo, a wrong import/export, or an array method like `map` on a non-array." },
        fix: { TR: "• `console.log(typeof x)` ile türü kontrol et.\n• Varsayılan ve isimli export'ları karıştırma (`import x` ↔ `import { x }`).\n• `Array.isArray(value)` ile dizi olduğundan emin ol.", EN: "• Check the type with `console.log(typeof x)`.\n• Don't mix default and named exports (`import x` vs `import { x }`).\n• Ensure it's an array with `Array.isArray(value)`." },
    },
    {
        id: "js-reference", language: "JavaScript", pattern: /ReferenceError: (\w+) is not defined|ReferenceError: Cannot access '(\w+)' before initialization/i,
        title: { TR: "ReferenceError: tanımsız değişken", EN: "ReferenceError: undefined variable" },
        cause: { TR: "Değişken o kapsamda yok ya da `let`/`const` tanımından önce kullanılıyor.", EN: "The variable doesn't exist in that scope or is used before its `let`/`const` declaration." },
        fix: { TR: "• Yazımı kontrol et.\n• Değişkeni kullanmadan önce tanımla.\n• Blok kapsamına dikkat et: `{ }` içindeki `let` dışarıdan görünmez.", EN: "• Check the spelling.\n• Declare the variable before using it.\n• Mind block scope: a `let` inside `{ }` isn't visible outside." },
    },
    {
        id: "js-syntax", language: "JavaScript", pattern: /SyntaxError: (?:Unexpected token|Unexpected end of input|missing \) after|Invalid or unexpected token|Unexpected identifier)/i,
        title: { TR: "SyntaxError: beklenmeyen simge", EN: "SyntaxError: unexpected token" },
        cause: { TR: "Kapanmamış parantez, süslü parantez ya da tırnak; fazladan virgül; ya da `JSON.parse` geçersiz JSON aldı.", EN: "An unclosed parenthesis, brace or quote; an extra comma; or `JSON.parse` got invalid JSON." },
        fix: { TR: "• Editördeki parantez eşleşmesini ve kırmızı dalgalı çizgileri kontrol et.\n• JSON'da anahtarlar çift tırnaklı olmalı ve sonda virgül olmamalı.\n• Belgeyi biçimlendir (Shift+Alt+F) ve hatalı satırı bul.", EN: "• Check bracket matching and red squiggles in the editor.\n• JSON keys must be double-quoted with no trailing comma.\n• Format the document (Shift+Alt+F) to spot the broken line." },
    },
    {
        id: "js-stack", language: "JavaScript", pattern: /Maximum call stack size exceeded|too much recursion/i,
        title: { TR: "RangeError: çağrı yığını taştı", EN: "RangeError: call stack exceeded" },
        cause: { TR: "Sonsuz özyineleme ya da birbirini çağıran fonksiyonlar.", EN: "Infinite recursion or functions calling each other forever." },
        fix: { TR: "• Özyinelemeye duruş koşulu ekle.\n• Setter içinde aynı özelliği tekrar atamadığından emin ol.", EN: "• Add a stop condition to the recursion.\n• Make sure a setter doesn't assign the same property again." },
    },
    {
        id: "js-promise", language: "JavaScript", pattern: /Unhandled(?:Promise)?Rejection|Uncaught \(in promise\)/i,
        title: { TR: "Yakalanmamış Promise hatası", EN: "Unhandled promise rejection" },
        cause: { TR: "Bir `async` işlem hata verdi ama `try/catch` ya da `.catch()` ile yakalanmadı.", EN: "An `async` operation failed but wasn't caught with `try/catch` or `.catch()`." },
        fix: { TR: "• `try { await f(); } catch (e) { ... }` kullan.\n• `fetch` için `response.ok` değerini de kontrol et.", EN: "• Use `try { await f(); } catch (e) { ... }`.\n• For `fetch`, also check `response.ok`." },
    },
    {
        id: "ts-type", language: "TypeScript", pattern: /TS2322|TS2345|Type '[^']+' is not assignable to (?:type|parameter)/i,
        title: { TR: "TypeScript tür uyuşmazlığı", EN: "TypeScript type mismatch" },
        cause: { TR: "Bir değeri, türüyle uyumsuz bir yere atadın ya da fonksiyona yanlış türde argüman verdin.", EN: "You assigned a value to an incompatible type or passed an argument of the wrong type." },
        fix: { TR: "• Mesajdaki iki türü karşılaştır.\n• Gerekirse dönüştür (`Number(x)`), türü genişlet (`string | null`) ya da `null` kontrolü ekle.\n• `as` ile zorlamaktan kaçın; asıl uyumsuzluğu düzelt.", EN: "• Compare the two types in the message.\n• Convert (`Number(x)`), widen the type (`string | null`) or add a `null` check.\n• Avoid forcing it with `as`; fix the real mismatch." },
    },
    // ---------------------------------------------------------------- C#
    {
        id: "cs-null", language: "C#", pattern: /NullReferenceException|Object reference not set to an instance of an object/i,
        title: { TR: "NullReferenceException", EN: "NullReferenceException" },
        cause: { TR: "`null` olan bir nesnenin üyesine eriştin. Hanogt Engine'de en sık nedeni Inspector'da atanmamış bir alan ya da `GetComponent` ile bulunamayan bileşendir.", EN: "You accessed a member of an object that is `null`. In Hanogt Engine the usual cause is a field not assigned in the Inspector or a component `GetComponent` couldn't find." },
        fix: { TR: "• Inspector'da alanın atandığını kontrol et.\n• `GetComponent<T>()` sonucunu `if (x != null)` ile denetle.\n• Null koşullu operatör: `player?.Bounce();`", EN: "• Check that the field is assigned in the Inspector.\n• Guard `GetComponent<T>()` results with `if (x != null)`.\n• Null-conditional operator: `player?.Bounce();`" },
    },
    {
        id: "cs-index", language: "C#", pattern: /IndexOutOfRangeException|ArgumentOutOfRangeException|Index was outside the bounds of the array/i,
        title: { TR: "Dizin aralık dışında (C#)", EN: "Index out of range (C#)" },
        cause: { TR: "Dizi ya da listede olmayan bir konuma eriştin; geçerli dizinler 0..Length-1 (liste için Count-1).", EN: "You accessed a position outside the array or list; valid indexes are 0..Length-1 (Count-1 for lists)." },
        fix: { TR: "• Döngüde `i < items.Length` kullan (`<=` değil).\n• `foreach` tercih et.\n• Boş koleksiyonu kontrol et.", EN: "• Use `i < items.Length` in loops (not `<=`).\n• Prefer `foreach`.\n• Check for empty collections." },
    },
    {
        id: "cs-cs0103", language: "C#", pattern: /CS0103|The name '(\w+)' does not exist in the current context/i,
        title: { TR: "CS0103: isim bu bağlamda yok", EN: "CS0103: name doesn't exist in this context" },
        cause: { TR: "Değişken/metot tanımlı değil, yazımı farklı ya da başka bir kapsamda (ör. başka bir metodun yerel değişkeni).", EN: "The variable/method isn't defined, is spelled differently or lives in another scope (e.g. a local of another method)." },
        fix: { TR: "• Yazım ve büyük/küçük harfi kontrol et (C# büyük/küçük harfe duyarlıdır).\n• Birden çok metotta kullanacaksan sınıf alanı yap.\n• Eksik `using` yönergesini ekle.", EN: "• Check spelling and case (C# is case-sensitive).\n• Make it a class field if several methods use it.\n• Add the missing `using` directive." },
    },
    {
        id: "cs-cs1002", language: "C#", pattern: /CS1002|; expected/i,
        title: { TR: "CS1002: ; bekleniyor", EN: "CS1002: ; expected" },
        cause: { TR: "Bir ifadenin sonunda noktalı virgül eksik.", EN: "A statement is missing its semicolon." },
        fix: { TR: "• Hata satırının (ya da bir öncekinin) sonuna `;` ekle.", EN: "• Add `;` at the end of the error line (or the one before it)." },
    },
    {
        id: "cs-cs0029", language: "C#", pattern: /CS0029|CS0266|Cannot implicitly convert type/i,
        title: { TR: "CS0029: örtük dönüştürme yapılamaz", EN: "CS0029: cannot implicitly convert" },
        cause: { TR: "Bir türü diğerine otomatik çeviremezsin; ör. `double` → `int` ya da `string` → `int`.", EN: "One type can't be converted to another automatically, e.g. `double` → `int` or `string` → `int`." },
        fix: { TR: "• Açık dönüştürme: `(int)value` ya da `Mathf.RoundToInt(value)`.\n• Metinden sayıya: `int.Parse(text)` ya da `int.TryParse(text, out var n)`.\n• `float` sabitlerine `f` ekle: `5.5f`.", EN: "• Explicit cast: `(int)value` or `Mathf.RoundToInt(value)`.\n• Text to number: `int.Parse(text)` or `int.TryParse(text, out var n)`.\n• Add `f` to float literals: `5.5f`." },
    },
    {
        id: "cs-format", language: "C#", pattern: /FormatException|Input string was not in a correct format/i,
        title: { TR: "FormatException: hatalı sayı biçimi", EN: "FormatException: bad number format" },
        cause: { TR: "`int.Parse`/`double.Parse` sayı olmayan bir metin aldı (boş satır, harf ya da kültüre göre `,`/`.` farkı).", EN: "`int.Parse`/`double.Parse` got text that isn't a number (an empty line, letters or a culture `,`/`.` difference)." },
        fix: { TR: "• `int.TryParse(text, out int value)` kullan.\n• Girdiyi **Girdi** sekmesine yazdığından emin ol.\n• Ondalıklarda `CultureInfo.InvariantCulture` kullan.", EN: "• Use `int.TryParse(text, out int value)`.\n• Make sure the input is in the **Input** tab.\n• Use `CultureInfo.InvariantCulture` for decimals." },
    },
    {
        id: "cs-invalid-cast", language: "C#", pattern: /InvalidCastException|Specified cast is not valid/i,
        title: { TR: "InvalidCastException", EN: "InvalidCastException" },
        cause: { TR: "Nesneyi gerçek türüyle uyumsuz bir türe dönüştürmeye çalıştın.", EN: "You cast an object to a type that doesn't match its real type." },
        fix: { TR: "• `if (obj is Player player) { ... }` ile güvenli dönüştür.\n• Ya da `as` kullanıp `null` kontrolü yap.", EN: "• Cast safely with `if (obj is Player player) { ... }`.\n• Or use `as` and check for `null`." },
    },
    // ---------------------------------------------------------------- C / C++
    {
        id: "cpp-segfault", language: "C/C++", pattern: /Segmentation fault|SIGSEGV|core dumped|exit code 139/i,
        title: { TR: "Segmentation fault (bellek hatası)", EN: "Segmentation fault (memory error)" },
        cause: { TR: "Program izin verilmeyen bir belleğe erişti: dizi sınırı dışı, `nullptr` işaretçisi, silinmiş belleğe erişim ya da çok derin özyineleme.", EN: "The program touched memory it may not use: an out-of-bounds array access, a `nullptr`, freed memory, or recursion that's too deep." },
        fix: { TR: "• Dizi/vektör dizinlerini kontrol et; `v.at(i)` sınır denetimi yapar.\n• İşaretçiyi kullanmadan önce `nullptr` olmadığını denetle.\n• Ham işaretçi yerine `std::vector` ve akıllı işaretçiler (`std::unique_ptr`) kullan.", EN: "• Check array/vector indexes; `v.at(i)` does bounds checking.\n• Verify a pointer isn't `nullptr` before use.\n• Prefer `std::vector` and smart pointers (`std::unique_ptr`) over raw pointers." },
    },
    {
        id: "cpp-undeclared", language: "C/C++", pattern: /was not declared in this scope|use of undeclared identifier/i,
        title: { TR: "Tanımlanmamış tanımlayıcı", EN: "Undeclared identifier" },
        cause: { TR: "Değişken/fonksiyon tanımlanmadı, yazımı farklı ya da gerekli başlık dosyası eklenmedi.", EN: "The variable/function isn't declared, is spelled differently, or a required header is missing." },
        fix: { TR: "• `#include <iostream>`, `<vector>`, `<string>` gibi başlıkları ekle.\n• Standart kütüphane öğelerini `std::` ile yaz (`std::cout`).\n• Fonksiyonu kullanmadan önce tanımla ya da prototipini yaz.", EN: "• Add headers like `#include <iostream>`, `<vector>`, `<string>`.\n• Prefix standard library names with `std::` (`std::cout`).\n• Define the function before use or declare its prototype." },
    },
    {
        id: "cpp-undefined-ref", language: "C/C++", pattern: /undefined reference to [`'"]?([\w:~]+)/i,
        title: { TR: "Bağlayıcı hatası: undefined reference", EN: "Linker error: undefined reference" },
        cause: { TR: "Fonksiyon bildirilmiş ama gövdesi yok ya da derlemeye dahil edilmemiş; `main` yazımı hatalı da olabilir.", EN: "A function is declared but has no body or isn't compiled in; `main` may also be misspelled." },
        fix: { TR: "• Fonksiyonun gövdesini yazdığından emin ol.\n• `int main()` tanımını kontrol et.\n• Çok dosyalı projelerde tüm `.cpp` dosyalarının derlendiğinden emin ol.", EN: "• Make sure the function has a body.\n• Check the `int main()` definition.\n• In multi-file projects, compile all `.cpp` files." },
    },
    {
        id: "cpp-expected", language: "C/C++", pattern: /expected ['‘]?;['’]? before|expected primary-expression|expected ['‘]\)['’]/i,
        title: { TR: "Sözdizimi hatası (C++)", EN: "Syntax error (C++)" },
        cause: { TR: "Noktalı virgül, parantez ya da süslü parantez eksik ya da fazla.", EN: "A semicolon, parenthesis or brace is missing or extra." },
        fix: { TR: "• Hata satırının **bir önceki** satırının sonuna `;` eklenmiş mi bak.\n• Sınıf tanımları `};` ile biter.", EN: "• Check whether the line **before** the error ends with `;`.\n• Class definitions end with `};`." },
    },
    {
        id: "cpp-no-matching", language: "C/C++", pattern: /no matching function for call to|no match for ['‘]operator/i,
        title: { TR: "Eşleşen fonksiyon yok", EN: "No matching function" },
        cause: { TR: "Fonksiyonu, tanımındaki parametre türleri/sayısıyla uyuşmayan argümanlarla çağırdın.", EN: "You called a function with arguments that don't match its parameter types or count." },
        fix: { TR: "• Derleyicinin listelediği \"candidate\" imzalarla çağrını karşılaştır.\n• `const` ve referans (`&`) farklılıklarına dikkat et.", EN: "• Compare your call with the \"candidate\" signatures the compiler lists.\n• Watch for `const` and reference (`&`) differences." },
    },
    {
        id: "cpp-out-of-range", language: "C/C++", pattern: /std::out_of_range|vector::_M_range_check|basic_string::at/i,
        title: { TR: "std::out_of_range", EN: "std::out_of_range" },
        cause: { TR: "`at()` sınır dışı bir dizinle çağrıldı.", EN: "`at()` was called with an out-of-range index." },
        fix: { TR: "• Dizinin `0 <= i < v.size()` aralığında olduğundan emin ol.\n• Döngülerde `i < v.size()` kullan.", EN: "• Ensure the index is within `0 <= i < v.size()`.\n• Use `i < v.size()` in loops." },
    },
    // ---------------------------------------------------------------- Java
    {
        id: "java-npe", language: "Java", pattern: /NullPointerException/i,
        title: { TR: "NullPointerException", EN: "NullPointerException" },
        cause: { TR: "`null` olan bir referansın metodunu ya da alanını kullandın; nesne hiç oluşturulmamış olabilir.", EN: "You used a method or field of a `null` reference; the object may never have been created." },
        fix: { TR: "• Nesneyi `new` ile oluşturduğundan emin ol.\n• `Objects.requireNonNull` ya da `if (x != null)` kullan.\n• Yeni Java sürümlerinde mesaj hangi değişkenin null olduğunu söyler.", EN: "• Make sure the object is created with `new`.\n• Use `Objects.requireNonNull` or `if (x != null)`.\n• Recent Java versions name the null variable in the message." },
    },
    {
        id: "java-bounds", language: "Java", pattern: /ArrayIndexOutOfBoundsException|IndexOutOfBoundsException|StringIndexOutOfBoundsException/i,
        title: { TR: "Dizin sınır dışı (Java)", EN: "Index out of bounds (Java)" },
        cause: { TR: "Geçerli dizinler 0..length-1 (liste için size()-1).", EN: "Valid indexes are 0..length-1 (size()-1 for lists)." },
        fix: { TR: "• Döngüde `i < arr.length` kullan.\n• Gelişmiş for: `for (int x : arr)`.", EN: "• Use `i < arr.length` in loops.\n• Enhanced for: `for (int x : arr)`." },
    },
    {
        id: "java-symbol", language: "Java", pattern: /cannot find symbol/i,
        title: { TR: "cannot find symbol", EN: "cannot find symbol" },
        cause: { TR: "Değişken, metot ya da sınıf tanımlı değil; yazım hatası ya da eksik `import` olabilir.", EN: "A variable, method or class isn't defined; it may be a typo or a missing `import`." },
        fix: { TR: "• Yazımı ve büyük/küçük harfi kontrol et.\n• `import java.util.*;` gibi eksik içe aktarmaları ekle.\n• Değişkenin kapsamını kontrol et.", EN: "• Check spelling and case.\n• Add missing imports such as `import java.util.*;`.\n• Check the variable's scope." },
    },
    {
        id: "java-public-class", language: "Java", pattern: /class (\w+) is public, should be declared in a file named/i,
        title: { TR: "Public sınıf dosya adıyla eşleşmiyor", EN: "Public class doesn't match the file name" },
        cause: { TR: "Java'da `public` sınıfın adı dosya adıyla aynı olmalı.", EN: "In Java a `public` class must have the same name as its file." },
        fix: { TR: "• Dosyayı sınıf adıyla kaydet (ör. `Main.java`) ya da sınıfı yeniden adlandır.\n• Hanogt editörü tek dosyalı `public class Main` programlarını otomatik uyarlar.", EN: "• Save the file with the class name (e.g. `Main.java`) or rename the class.\n• The Hanogt editor adapts single-file `public class Main` programs automatically." },
    },
    {
        id: "java-number-format", language: "Java", pattern: /NumberFormatException/i,
        title: { TR: "NumberFormatException", EN: "NumberFormatException" },
        cause: { TR: "`Integer.parseInt` sayı olmayan bir metin aldı.", EN: "`Integer.parseInt` received text that isn't a number." },
        fix: { TR: "• Girdiyi `trim()` ile temizle.\n• `try { ... } catch (NumberFormatException e) { ... }` ile yakala.", EN: "• Clean the input with `trim()`.\n• Catch it with `try { ... } catch (NumberFormatException e) { ... }`." },
    },
    {
        id: "java-missing-return", language: "Java", pattern: /missing return statement/i,
        title: { TR: "missing return statement", EN: "missing return statement" },
        cause: { TR: "Değer döndürmesi gereken bir metodun bazı yolları `return` içermiyor.", EN: "Some paths of a method that must return a value have no `return`." },
        fix: { TR: "• Tüm `if/else` dallarının sonunda `return` olduğundan emin ol ya da metodun sonuna varsayılan bir `return` ekle.", EN: "• Make sure every `if/else` branch returns, or add a default `return` at the end." },
    },
    // ---------------------------------------------------------------- Lua / SQL / engine / generic
    {
        id: "lua-nil", language: "Lua", pattern: /attempt to (?:index|call|perform arithmetic on|concatenate) (?:a )?nil value/i,
        title: { TR: "Lua: nil değer hatası", EN: "Lua: nil value error" },
        cause: { TR: "Tanımsız (nil) bir değişkeni tablo/fonksiyon/sayı gibi kullandın; Lua'da tanımlanmamış her isim nil'dir.", EN: "You used an undefined (nil) variable as a table, function or number; every undefined name is nil in Lua." },
        fix: { TR: "• İsmin yazımını kontrol et.\n• Değişkeni kullanmadan önce ata: `local t = {}`.\n• `if value then ... end` ile kontrol et.", EN: "• Check the name's spelling.\n• Assign it before use: `local t = {}`.\n• Guard with `if value then ... end`." },
    },
    {
        id: "sql-no-table", language: "SQL", pattern: /no such table|table .* doesn't exist|relation .* does not exist/i,
        title: { TR: "SQL: tablo yok", EN: "SQL: table doesn't exist" },
        cause: { TR: "Sorgudaki tablo oluşturulmamış ya da adı farklı. Hanogt'ta SQL her çalıştırmada boş bir SQLite veritabanıyla başlar.", EN: "The table in the query wasn't created or has another name. In Hanogt, SQL starts with an empty SQLite database on every run." },
        fix: { TR: "• Aynı dosyada önce `CREATE TABLE ...` ve `INSERT ...` yaz, sonra `SELECT` et.\n• Tablo adının yazımını kontrol et.", EN: "• Put `CREATE TABLE ...` and `INSERT ...` before your `SELECT` in the same file.\n• Check the table name's spelling." },
    },
    {
        id: "sql-syntax", language: "SQL", pattern: /near ".*": syntax error|You have an error in your SQL syntax/i,
        title: { TR: "SQL sözdizimi hatası", EN: "SQL syntax error" },
        cause: { TR: "Anahtar kelime sırası yanlış, virgül eksik/fazla ya da tırnak kapanmamış.", EN: "Wrong keyword order, a missing/extra comma or an unclosed quote." },
        fix: { TR: "• Sıra: `SELECT ... FROM ... WHERE ... GROUP BY ... ORDER BY ... LIMIT`.\n• Metin değerleri tek tırnakla yaz: `'Ali'`.\n• Son sütundan sonra virgül bırakma.", EN: "• Order: `SELECT ... FROM ... WHERE ... GROUP BY ... ORDER BY ... LIMIT`.\n• Quote text values with single quotes: `'Ali'`.\n• Don't leave a comma after the last column." },
    },
    {
        id: "engine-budget", language: "Hanogt Engine", pattern: /komut bütçesi|instruction budget|sonsuz döngü|infinite loop/i,
        title: { TR: "Hanogt Engine: komut bütçesi aşıldı", EN: "Hanogt Engine: instruction budget exceeded" },
        cause: { TR: "Bir `Update` ya da coroutine bir karede çok fazla komut çalıştırdı; genelde bitmeyen bir `while` döngüsüdür.", EN: "An `Update` or coroutine ran too many instructions in one frame; usually a `while` loop that never ends." },
        fix: { TR: "• Döngü koşulunun bir noktada yanlış olduğundan emin ol.\n• Zamana yayılacak işler için coroutine ve `yield return null;` kullan.", EN: "• Make sure the loop condition eventually becomes false.\n• Spread long work over frames with a coroutine and `yield return null;`." },
    },
    {
        id: "timeout", language: "Hanogt", pattern: /zaman aşımı|timed out|time limit exceeded|timeout/i,
        title: { TR: "Zaman aşımı", EN: "Timeout" },
        cause: { TR: "Program süre sınırını aştı: sonsuz döngü, girdi beklerken boş **Girdi** sekmesi ya da çok yavaş bir algoritma.", EN: "The program hit the time limit: an infinite loop, waiting for input with an empty **Input** tab, or a very slow algorithm." },
        fix: { TR: "• Döngülerin bittiğini kontrol et.\n• Program girdi okuyorsa **Girdi** sekmesine değerleri yaz.\n• Büyük girdilerde daha verimli bir algoritma kullan.", EN: "• Check that your loops end.\n• If the program reads input, type the values in the **Input** tab.\n• Use a more efficient algorithm for large inputs." },
    },
];

/** Returns the first known error found in the text, with the line number if present. */
export function explainError(text: string): { pattern: ErrorPattern; line: number | null } | null {
    for (const pattern of ERROR_PATTERNS) {
        if (pattern.pattern.test(text)) {
            const line = /(?:line|satır|:)\s*(\d{1,6})/i.exec(text);
            return { pattern, line: line ? Number(line[1]) : null };
        }
    }
    return null;
}

/** True when a message looks like an error message or stack trace. */
export function looksLikeError(text: string) {
    return /\w*(?:Error|Exception)\b|\b(?:Traceback|error CS\d+|error:|fatal|panic|Segmentation fault|undefined reference|cannot find symbol|attempt to (?:index|call|perform)|hata:|not defined|is not a function|out of range|null reference)/i.test(text);
}
