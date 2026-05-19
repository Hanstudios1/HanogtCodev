const { execSync } = require('child_process');
const cwd = require('path').join(__dirname, '..');
try {
    execSync('git add -A', { cwd, stdio: 'inherit' });
    execSync('git commit -m "v0.0.4d: Hanogt Security Bot chatbot - sag ust buton, sohbet penceresi, kurallar bilgi bankasi, yazma animasyonu, mesaj duzenleme-silme"', { cwd, stdio: 'inherit' });
    execSync('git push origin main', { cwd, stdio: 'inherit' });
    console.log('Push basarili!');
} catch (e) { console.error('Hata:', e.message); }
