const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Your deployed website URL
const WEBSITE_URL = 'https://hanogtcodev.vercel.app';
// Our own sites; sign-in may hop between them (see src/lib/auth-client.ts).
const APP_ORIGINS = new Set([WEBSITE_URL, 'https://www.hanogtcodev.com', 'https://hanogtcodev.com']);
const GOOGLE_SIGN_IN_ORIGIN = 'https://accounts.google.com';

function originOf(url) {
    try {
        return new URL(url).origin;
    } catch {
        return '';
    }
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        icon: path.join(__dirname, '../public/logo-dark.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        titleBarStyle: 'default',
        autoHideMenuBar: true
    });

    // Load the live website
    mainWindow.loadURL(WEBSITE_URL);

    // Open external links in the default browser
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        if (!APP_ORIGINS.has(originOf(url))) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Handle navigation
    mainWindow.webContents.on('will-navigate', (event, url) => {
        // Keep internal navigation, open external links in browser
        const origin = originOf(url);
        if (!APP_ORIGINS.has(origin) && origin !== GOOGLE_SIGN_IN_ORIGIN) {
            event.preventDefault();
            shell.openExternal(url);
        }
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
