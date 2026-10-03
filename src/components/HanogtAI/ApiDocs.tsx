"use client";

import { BookOpen, Check, Copy as CopyIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { API_BASE_PATH, API_ERROR_CODES, API_INPUT_CHARS_MAX, API_MESSAGES_MAX, API_MODEL_ID, API_SYSTEM_MAX, type ApiErrorCode } from "@/lib/ai/api-keys";
import { useI18n, type Copy } from "@/lib/i18n";
import { PLAN_AI_FEATURES } from "@/lib/plans";
import { SITE_URL } from "@/lib/site";
import { cx } from "./ui";

const C = {
    title: { TR: "Hanogt AI API belgeleri", EN: "Hanogt AI API docs" },
    intro: { TR: "Hanogt AI'ı kendi uygulamandan, OpenAI uyumlu bir API ile kullan. OpenAI'ın resmî kütüphaneleri temel adresi değiştirerek çalışır; model adı \"{model}\".", EN: "Use Hanogt AI from your own app with an OpenAI-compatible API. OpenAI's official libraries work by changing the base URL; the model is \"{model}\"." },
    baseUrl: { TR: "Temel adres", EN: "Base URL" },
    auth: { TR: "Kimlik doğrulama", EN: "Authentication" },
    authBody: { TR: "Her istekte anahtarını Authorization başlığında gönder: \"Authorization: Bearer hnk_…\". Oturum çerezi kabul edilmez ve başka sitelerin tarayıcıdan çağırmasına (CORS) izin verilmez: anahtar sunucunda kalmalı.", EN: "Send your key with every request in the Authorization header: \"Authorization: Bearer hnk_…\". Session cookies aren't accepted and other sites can't call the API from a browser (no CORS): keep the key on your server." },
    examples: { TR: "Örnekler", EN: "Examples" },
    copy: { TR: "Kopyala", EN: "Copy" },
    copied: { TR: "Kopyalandı", EN: "Copied" },
    endpoints: { TR: "Uç noktalar", EN: "Endpoints" },
    completions: { TR: "Sohbet yanıtı; stream: true ile parça parça (server-sent events, [DONE] ile biter). Sayılan tek istek budur.", EN: "A chat answer; with stream: true it arrives in pieces (server-sent events ending with [DONE]). This is the only request that is counted." },
    models: { TR: "Kullanılabilir model (\"{model}\").", EN: "The available model (\"{model}\")." },
    usage: { TR: "Son dakika ve 24 saatteki isteklerin, anahtar sayın.", EN: "Your requests in the last minute and 24 hours, and your key count." },
    params: { TR: "Parametreler", EN: "Parameters" },
    paramModel: { TR: "İsteğe bağlı; yalnızca \"{model}\".", EN: "Optional; \"{model}\" only." },
    paramMessages: { TR: "system, developer, user ve assistant mesajları (yalnızca metin), en fazla {messages} mesaj ve toplam {chars} karakter; son mesaj kullanıcının olmalı. system metni en fazla {system} karakter ve Hanogt AI'ın kurallarından sonra gelir.", EN: "system, developer, user and assistant messages (text only), at most {messages} messages and {chars} characters in total; the last one must be the user's. The system text is at most {system} characters and comes after Hanogt AI's rules." },
    paramStream: { TR: "true: yanıt parça parça gelir.", EN: "true: the answer arrives in pieces." },
    paramTokens: { TR: "max_tokens veya max_completion_tokens: en uzun yanıt; planının sınırını (Plus {plus}, Pro {pro}) geçemez.", EN: "max_tokens or max_completion_tokens: the longest answer; never more than your plan's limit (Plus {plus}, Pro {pro})." },
    paramSampling: { TR: "temperature (0–2), top_p (0–1) ve stop (en fazla 4 metin).", EN: "temperature (0–2), top_p (0–1) and stop (up to 4 strings)." },
    paramMode: { TR: "Hanogt'a özel: mode (general, code, security) ve language (iki harfli kod, ör. tr). Varsayılan: general ve en.", EN: "Hanogt extras: mode (general, code, security) and language (a two-letter code such as tr). Defaults: general and en." },
    paramUnsupported: { TR: "Desteklenmeyenler hata verir: tools, function_call, n > 1, ses ve görsel. Diğer OpenAI parametreleri yok sayılır.", EN: "Not supported, with an error: tools, function_call, n > 1, audio and images. Other OpenAI parameters are ignored." },
    limits: { TR: "Sınırlar", EN: "Limits" },
    limitsBody: { TR: "Hesap başına (bütün anahtarlar birlikte): Plus dakikada {plusMinute} ve 24 saatte {plusDay}, Pro dakikada {proMinute} ve 24 saatte {proDay} istek. Anahtar: Plus {plusKeys}, Pro {proKeys}. 24 saat, ilk isteğinden itibaren sayılır.", EN: "Per account (all keys together): Plus {plusMinute} a minute and {plusDay} in 24 hours, Pro {proMinute} a minute and {proDay} in 24 hours. Keys: Plus {plusKeys}, Pro {proKeys}. The 24 hours count from your first request." },
    headers: { TR: "Her yanıtta: x-ratelimit-limit-requests, x-ratelimit-remaining-requests ve x-ratelimit-reset-requests (dakika); x-hanogt-ratelimit-limit-day, -remaining-day ve -reset-day (24 saat). 429'da Retry-After saniyeyi söyler.", EN: "Every answer has x-ratelimit-limit-requests, x-ratelimit-remaining-requests and x-ratelimit-reset-requests (the minute) and x-hanogt-ratelimit-limit-day, -remaining-day and -reset-day (the 24 hours). On a 429, Retry-After gives the seconds to wait." },
    errors: { TR: "Hatalar", EN: "Errors" },
    errorsBody: { TR: "Hatalar OpenAI biçimindedir: { \"error\": { \"message\", \"type\", \"code\", \"param\" } }.", EN: "Errors use OpenAI's shape: { \"error\": { \"message\", \"type\", \"code\", \"param\" } }." },
    status: { TR: "Durum", EN: "Status" },
    code: { TR: "Kod", EN: "Code" },
    meaning: { TR: "Anlamı", EN: "Meaning" },
    rules: { TR: "Kullanım kuralları", EN: "Rules" },
    rulesBody: { TR: "Anahtarını kimseyle paylaşma ve satma; erişimi yeniden satamazsın. İstekler Hanogt AI'ın güvenlik kurallarına ve Kullanım Şartları'na tabidir; kötüye kullanımda anahtarlar iptal edilebilir.", EN: "Don't share or sell your key; you may not resell access. Requests follow Hanogt AI's safety rules and the Terms of Use; keys can be revoked for abuse." },
} satisfies Record<string, Copy>;

const ERROR_MEANINGS: Record<ApiErrorCode, Copy> = {
    missing_api_key: { TR: "Authorization başlığında anahtar yok.", EN: "No key in the Authorization header." },
    invalid_api_key: { TR: "Anahtar geçersiz ya da iptal edilmiş.", EN: "The key is invalid or revoked." },
    account_suspended: { TR: "Anahtarın sahibi olan hesap askıda.", EN: "The key's account is suspended." },
    plan_required: { TR: "API, Plus ya da Pro plan ister.", EN: "The API needs Plus or Pro." },
    key_inactive: { TR: "Anahtar, planının anahtar sayısının dışında kaldı.", EN: "The key is outside your plan's key allowance." },
    feature_unavailable: { TR: "API hesabında henüz açık değil.", EN: "The API isn't open to your account yet." },
    invalid_request: { TR: "İstek gövdesi ya da bir parametre geçersiz (param alanına bak).", EN: "The body or a parameter is invalid (see param)." },
    unsupported_parameter: { TR: "Desteklenmeyen bir parametre (tools, n > 1…).", EN: "An unsupported parameter (tools, n > 1…)." },
    model_not_found: { TR: "Model \"hanogt-ai\" değil.", EN: "The model isn't \"hanogt-ai\"." },
    context_length_exceeded: { TR: "Mesajlar ya da system metni çok uzun.", EN: "The messages or the system text are too long." },
    rate_limit_exceeded: { TR: "Dakikalık ya da 24 saatlik sınır doldu; Retry-After kadar bekle.", EN: "The minute or 24-hour limit is used up; wait Retry-After." },
    upstream_error: { TR: "Model isteği tamamlayamadı; tekrar dene.", EN: "The model couldn't complete the request; try again." },
    service_unavailable: { TR: "Hizmete şu anda ulaşılamıyor; biraz sonra tekrar dene.", EN: "The service can't be reached right now; try again later." },
};

const subscribeNothing = () => () => undefined;

/** The site's own address in the browser (so the samples work on any deployment); SITE_URL while rendering on the server. */
function useBaseUrl() {
    return useSyncExternalStore(subscribeNothing, () => `${window.location.origin}${API_BASE_PATH}`, () => `${SITE_URL}${API_BASE_PATH}`);
}

type Sample = { id: string; label: string; code: string };

function samples(base: string): Sample[] {
    const body = `{"model":"${API_MODEL_ID}","messages":[{"role":"user","content":"Merhaba!"}]}`;
    return [
        {
            id: "curl",
            label: "curl",
            code: `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer $HANOGT_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`,
        },
        {
            id: "js",
            label: "JavaScript",
            code: `const response = await fetch("${base}/chat/completions", {\n  method: "POST",\n  headers: {\n    Authorization: \`Bearer \${process.env.HANOGT_API_KEY}\`,\n    "Content-Type": "application/json",\n  },\n  body: JSON.stringify({\n    model: "${API_MODEL_ID}",\n    messages: [{ role: "user", content: "Merhaba!" }],\n  }),\n});\nconst data = await response.json();\nconsole.log(data.choices[0].message.content);`,
        },
        {
            id: "python",
            label: "Python",
            code: `import os\nimport requests\n\nresponse = requests.post(\n    "${base}/chat/completions",\n    headers={"Authorization": f"Bearer {os.environ['HANOGT_API_KEY']}"},\n    json={"model": "${API_MODEL_ID}", "messages": [{"role": "user", "content": "Merhaba!"}]},\n    timeout=60,\n)\nprint(response.json()["choices"][0]["message"]["content"])`,
        },
        {
            id: "openai-js",
            label: "OpenAI SDK (JS)",
            code: `import OpenAI from "openai";\n\nconst client = new OpenAI({\n  apiKey: process.env.HANOGT_API_KEY,\n  baseURL: "${base}",\n});\n\nconst stream = await client.chat.completions.create({\n  model: "${API_MODEL_ID}",\n  messages: [{ role: "user", content: "Write a Python function that reverses a string." }],\n  stream: true,\n});\nfor await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta?.content ?? "");`,
        },
        {
            id: "openai-python",
            label: "OpenAI SDK (Python)",
            code: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(api_key=os.environ["HANOGT_API_KEY"], base_url="${base}")\n\nreply = client.chat.completions.create(\n    model="${API_MODEL_ID}",\n    messages=[\n        {"role": "system", "content": "Answer in one short paragraph."},\n        {"role": "user", "content": "What is Hanogt Engine?"},\n    ],\n)\nprint(reply.choices[0].message.content)`,
        },
    ];
}

function CodeSamples({ base }: { base: string }) {
    const { tx } = useI18n();
    const list = samples(base);
    const [active, setActive] = useState(list[0].id);
    const [copied, setCopied] = useState(false);
    const sample = list.find((entry) => entry.id === active) ?? list[0];
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(sample.code);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_500);
        } catch {
            setCopied(false);
        }
    };
    return (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/10" data-api-samples>
            <div className="flex items-center gap-1 overflow-x-auto border-b border-zinc-200 bg-zinc-50 px-2 py-1.5 dark:border-white/10 dark:bg-white/[0.03]" role="tablist" aria-label={tx(C.examples)}>
                {list.map((entry) => (
                    <button
                        key={entry.id}
                        type="button"
                        role="tab"
                        aria-selected={entry.id === sample.id}
                        onClick={() => setActive(entry.id)}
                        className={cx("shrink-0 rounded-lg px-2.5 py-1 text-[12px] font-bold transition", entry.id === sample.id ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white" : "text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200")}
                    >
                        {entry.label}
                    </button>
                ))}
                <button type="button" onClick={() => void copy()} className="ms-auto inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[12px] font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white">
                    {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <CopyIcon className="h-3.5 w-3.5" aria-hidden />}{tx(copied ? C.copied : C.copy)}
                </button>
            </div>
            <pre className="overflow-x-auto bg-zinc-950 p-4 text-[12.5px] leading-relaxed text-zinc-100" dir="ltr"><code>{sample.code}</code></pre>
        </div>
    );
}

function Heading({ children }: { children: string }) {
    return <h3 className="mt-6 text-[14px] font-black uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{children}</h3>;
}

/** How to call the Hanogt AI API: address, key, samples, endpoints, parameters, limits, errors and rules. */
export default function ApiDocs() {
    const { tx, locale } = useI18n();
    const base = useBaseUrl();
    const number = (value: number) => value.toLocaleString(locale);
    const plus = PLAN_AI_FEATURES.plus;
    const pro = PLAN_AI_FEATURES.pro;
    return (
        <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-zinc-900 sm:p-6" data-api-docs>
            <h2 className="flex items-center gap-2 text-[16px] font-black tracking-tight text-zinc-900 dark:text-white"><BookOpen className="h-5 w-5 text-violet-500" aria-hidden />{tx(C.title)}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(C.intro, { model: API_MODEL_ID })}</p>

            <Heading>{tx(C.baseUrl)}</Heading>
            <p className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 font-mono text-[13px] text-zinc-800 dark:bg-white/[0.04] dark:text-zinc-100" dir="ltr" data-api-base-url>{base}</p>

            <Heading>{tx(C.auth)}</Heading>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(C.authBody)}</p>

            <Heading>{tx(C.examples)}</Heading>
            <div className="mt-2"><CodeSamples base={base} /></div>

            <Heading>{tx(C.endpoints)}</Heading>
            <dl className="mt-2 space-y-2 text-[13px]">
                {([["POST", "/chat/completions", tx(C.completions)], ["GET", "/models", tx(C.models, { model: API_MODEL_ID })], ["GET", "/usage", tx(C.usage)]] as const).map(([method, path, text]) => (
                    <div key={path} className="rounded-xl border border-zinc-200 px-3 py-2 dark:border-white/10">
                        <dt className="font-mono text-[12.5px] font-bold text-zinc-900 dark:text-white" dir="ltr"><span className="me-2 rounded bg-violet-500/10 px-1.5 py-0.5 text-violet-700 dark:text-violet-300">{method}</span>{API_BASE_PATH}{path}</dt>
                        <dd className="mt-1 text-zinc-600 dark:text-zinc-300">{text}</dd>
                    </div>
                ))}
            </dl>

            <Heading>{tx(C.params)}</Heading>
            <ul className="mt-2 list-disc space-y-1.5 ps-5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                <li><code className="font-mono text-[12.5px]">model</code>: {tx(C.paramModel, { model: API_MODEL_ID })}</li>
                <li><code className="font-mono text-[12.5px]">messages</code>: {tx(C.paramMessages, { messages: API_MESSAGES_MAX, chars: number(API_INPUT_CHARS_MAX), system: number(API_SYSTEM_MAX) })}</li>
                <li><code className="font-mono text-[12.5px]">stream</code>: {tx(C.paramStream)}</li>
                <li>{tx(C.paramTokens, { plus: number(plus.maxTokens), pro: number(pro.maxTokens) })}</li>
                <li>{tx(C.paramSampling)}</li>
                <li>{tx(C.paramMode)}</li>
                <li>{tx(C.paramUnsupported)}</li>
            </ul>

            <Heading>{tx(C.limits)}</Heading>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                {tx(C.limitsBody, {
                    plusMinute: number(plus.api?.perMinute ?? 0), plusDay: number(plus.api?.perDay ?? 0), proMinute: number(pro.api?.perMinute ?? 0), proDay: number(pro.api?.perDay ?? 0),
                    plusKeys: plus.api?.keys ?? 0, proKeys: pro.api?.keys ?? 0,
                })}
            </p>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(C.headers)}</p>

            <Heading>{tx(C.errors)}</Heading>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(C.errorsBody)}</p>
            <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[480px] text-start text-[12.5px]">
                    <thead>
                        <tr className="border-b border-zinc-200 text-zinc-500 dark:border-white/10">
                            <th scope="col" className="py-1.5 pe-3 text-start font-bold">{tx(C.status)}</th>
                            <th scope="col" className="py-1.5 pe-3 text-start font-bold">{tx(C.code)}</th>
                            <th scope="col" className="py-1.5 text-start font-bold">{tx(C.meaning)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {API_ERROR_CODES.map((entry) => (
                            <tr key={entry.code} className="border-b border-zinc-100 last:border-0 dark:border-white/[0.06]">
                                <td className="py-1.5 pe-3 font-mono tabular-nums">{entry.status}</td>
                                <td className="py-1.5 pe-3 font-mono text-zinc-900 dark:text-zinc-100">{entry.code}</td>
                                <td className="py-1.5 text-zinc-600 dark:text-zinc-300">{tx(ERROR_MEANINGS[entry.code])}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <Heading>{tx(C.rules)}</Heading>
            <p className="mt-2 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">{tx(C.rulesBody)}</p>
        </section>
    );
}
