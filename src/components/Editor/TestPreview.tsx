"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, Maximize2, Minimize2, Smartphone, Monitor, Terminal } from "lucide-react";

interface TestPreviewProps {
    code: string;
    language: string;
    cssCode?: string;
    output?: string[];  // For non-web languages
}

export default function TestPreview({ code, language, cssCode, output = [] }: TestPreviewProps) {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
    const [key, setKey] = useState(0);

    const isWebContent = ["html", "css", "javascript", "typescript"].includes(language.toLowerCase());

    const generatePreviewHTML = () => {
        const lang = language.toLowerCase();

        if (lang === "html") {
            if (code.includes("<html") || code.includes("<!DOCTYPE")) {
                if (cssCode) {
                    return code.replace("</head>", `<style>${cssCode}</style></head>`);
                }
                return code;
            }
            return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: system-ui, -apple-system, sans-serif; }
        ${cssCode || ""}
    </style>
</head>
<body>
    ${code}
</body>
</html>`;
        }

        if (lang === "css") {
            return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>${code}</style>
</head>
<body>
    <div class="preview-container" style="padding: 20px;">
        <h1>CSS Önizleme</h1>
        <p>Bu bir paragraf örneğidir.</p>
        <button>Buton</button>
        <div class="box" style="margin-top: 10px; padding: 20px; background: #eee;">Kutu</div>
    </div>
</body>
</html>`;
        }

        if (lang === "javascript" || lang === "typescript") {
            return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: system-ui; padding: 20px; background: #1a1a1a; color: #fff; }
        #output { background: #2d2d2d; padding: 15px; border-radius: 8px; white-space: pre-wrap; font-family: monospace; }
    </style>
</head>
<body>
    <h3 style="margin-bottom: 10px;">JavaScript Çıktısı:</h3>
    <div id="output"></div>
    <script>
        const output = document.getElementById('output');
        const originalLog = console.log;
        console.log = (...args) => {
            output.innerHTML += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '\\n';
            originalLog.apply(console, args);
        };
        console.error = (...args) => {
            output.innerHTML += '<span style="color: #ff6b6b;">Hata: ' + args.join(' ') + '</span>\\n';
        };
        try {
            ${code}
        } catch (e) {
            output.innerHTML += '<span style="color: #ff6b6b;">Hata: ' + e.message + '</span>';
        }
    </script>
</body>
</html>`;
        }

        return "";
    };

    const refreshPreview = () => {
        setKey(k => k + 1);
    };

    useEffect(() => {
        if (iframeRef.current && isWebContent) {
            const html = generatePreviewHTML();
            const blob = new Blob([html], { type: "text/html" });
            iframeRef.current.src = URL.createObjectURL(blob);
        }
    }, [code, cssCode, key, isWebContent]);

    // For non-web languages, show the output
    if (!isWebContent) {
        return (
            <div className={`h-full flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-zinc-900" : ""}`}>
                {/* Toolbar */}
                <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
                    <div className="flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-zinc-400" />
                        <span className="text-xs text-zinc-400 font-medium">{language} Çıktısı</span>
                    </div>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>

                {/* Output Area */}
                <div className="flex-1 bg-zinc-900 p-4 overflow-auto font-mono text-sm">
                    {output.length > 0 ? (
                        output.map((line, i) => (
                            <div key={i} className={`${line.startsWith('Error') || line.startsWith('>') ? 'text-yellow-400' : 'text-green-400'}`}>
                                {line}
                            </div>
                        ))
                    ) : (
                        <div className="text-zinc-500 text-center mt-10">
                            <div className="text-4xl mb-4">🚀</div>
                            <div>Kodu çalıştırmak için <strong>RUN</strong> butonuna basın</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className={`h-full flex flex-col ${isFullscreen ? "fixed inset-0 z-50 bg-zinc-900" : ""}`}>
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-2 bg-zinc-800 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-zinc-400 font-medium">Test Önizleme</span>
                    <span className="text-xs px-2 py-0.5 bg-green-600 text-white rounded">CANLI</span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setViewMode(viewMode === "desktop" ? "mobile" : "desktop")}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"
                        title={viewMode === "desktop" ? "Mobil Görünüm" : "Masaüstü Görünüm"}
                    >
                        {viewMode === "desktop" ? <Smartphone className="w-4 h-4" /> : <Monitor className="w-4 h-4" />}
                    </button>
                    <button
                        onClick={refreshPreview}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"
                        title="Yenile"
                    >
                        <RefreshCw className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setIsFullscreen(!isFullscreen)}
                        className="p-1.5 hover:bg-zinc-700 rounded text-zinc-400 hover:text-white"
                        title={isFullscreen ? "Küçült" : "Tam Ekran"}
                    >
                        {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                    </button>
                </div>
            </div>

            {/* Preview Area */}
            <div className="flex-1 bg-white overflow-hidden flex items-center justify-center p-2">
                <div
                    className={`h-full bg-white rounded shadow-lg overflow-hidden transition-all ${viewMode === "mobile" ? "w-[375px]" : "w-full"
                        }`}
                >
                    <iframe
                        ref={iframeRef}
                        key={key}
                        className="w-full h-full border-0"
                        sandbox="allow-scripts"
                        title="Preview"
                    />
                </div>
            </div>
        </div>
    );
}
