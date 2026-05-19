const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'lib', 'i18n.tsx');
let content = fs.readFileSync(file, 'utf8');

// Find the KR block that has duplicated keys and fix it
// The problem: after line "set_password: ..." there are duplicated keys starting with "indent_keep"
// We need to remove the duplicated block between "set_password" and the closing "},\n    HI:"

// Find the correct end of KR: after set_password, the next line should be "change_password" then closing
// But now there are duplicated lines. Let's find and fix.

// Strategy: find the KR block, keep only the original keys (up to verify_code), then close it
const krStart = content.indexOf('    KR: {');
if (krStart === -1) { console.log('Cannot find KR block'); process.exit(1); }

const hiStart = content.indexOf('    HI: {');
if (hiStart === -1) { console.log('Cannot find HI block'); process.exit(1); }

// Extract everything between KR: { and HI: {
const krBlock = content.substring(krStart, hiStart);

// Find all unique keys in the KR block - keep only first occurrence of each
const lines = krBlock.split(/\r?\n/);
const seen = new Set();
const cleanLines = [];
for (const line of lines) {
    const keyMatch = line.match(/^\s+(\w+):\s*"/);
    if (keyMatch) {
        if (seen.has(keyMatch[1])) {
            continue; // Skip duplicate
        }
        seen.add(keyMatch[1]);
    }
    // Skip comment lines that were added by the bad edit
    if (line.trim().startsWith('//') && line.includes('Phase 2')) continue;
    cleanLines.push(line);
}

// Make sure it ends with },
let cleanBlock = cleanLines.join('\n');
// Ensure it ends properly
if (!cleanBlock.trimEnd().endsWith('},')) {
    cleanBlock = cleanBlock.replace(/\}\s*$/, '},\n');
}

content = content.substring(0, krStart) + cleanBlock + content.substring(hiStart);
fs.writeFileSync(file, content, 'utf8');
console.log(`Cleaned KR block. Removed ${lines.length - cleanLines.length} duplicate lines.`);
