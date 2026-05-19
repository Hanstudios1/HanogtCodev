const { execSync } = require('child_process');
const cwd = require('path').join(__dirname, '..');
try {
    execSync('git add -A', { cwd, stdio: 'inherit' });
    execSync('git commit -m "v0.0.4: Guvenlik Botu v3.0 - Entropi analizi, polimorfik kod tespiti, saldiri zinciri tespiti, derin tarama, Unicode saldiri tespiti, piston.ts tam entegrasyon"', { cwd, stdio: 'inherit' });
    execSync('git push origin main', { cwd, stdio: 'inherit' });
    console.log('Push basarili!');
} catch (e) { console.error('Hata:', e.message); }
