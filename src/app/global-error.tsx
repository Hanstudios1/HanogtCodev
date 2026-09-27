"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
    return (
        <html lang="tr">
            <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#07070b", color: "#ededf2", fontFamily: "system-ui, sans-serif" }}>
                <div style={{ maxWidth: 420, padding: 32, textAlign: "center" }}>
                    <h1 style={{ fontSize: 24, marginBottom: 8 }}>Hanogt Codev yüklenemedi</h1>
                    <p style={{ opacity: 0.7, lineHeight: 1.6 }}>Beklenmedik bir hata oluştu. Lütfen sayfayı yenileyin; sorun sürerse Geri Bildirim sayfasından bize bildirin.</p>
                    <button type="button" onClick={reset} style={{ marginTop: 20, padding: "12px 20px", borderRadius: 14, border: 0, background: "#4f46e5", color: "#fff", fontWeight: 600, cursor: "pointer" }}>Tekrar dene</button>
                </div>
            </body>
        </html>
    );
}
