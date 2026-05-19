const { execSync } = require('child_process');
const cwd = require('path').join(__dirname, '..');
try {
    execSync('git add -A', { cwd, stdio: 'inherit' });
    execSync('git commit -m "v0.0.4b: Editor - klavye kisayollari, calistirma gecmisi, guvenlik uyarilari; Hesap - veri disa aktarma"', { cwd, stdio: 'inherit' });
    execSync('git push origin main', { cwd, stdio: 'inherit' });
    console.log('Push basarili!');
} catch (e) { console.error('Hata:', e.message); }
