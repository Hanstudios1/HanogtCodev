const { app, BrowserWindow, desktopCapturer, dialog, session, shell } = require('electron');
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

/**
 * Microphone, screen sharing and the other web permissions: granted to our
 * own sites (as Electron does by default), refused to any other page.
 */
function allowOwnSitesOnly() {
    const ses = session.defaultSession;
    ses.setPermissionRequestHandler((webContents, permission, callback, details) => {
        callback(APP_ORIGINS.has(originOf(details.requestingUrl || webContents.getURL())));
    });
    ses.setPermissionCheckHandler((webContents, permission, requestingOrigin) => APP_ORIGINS.has(requestingOrigin));

    // getDisplayMedia (screen sharing in calls): the person picks a screen or window.
    // macOS 15+ shows its own picker; elsewhere a small dialog lists what can be shared.
    ses.setDisplayMediaRequestHandler(async (request, callback) => {
        const origin = originOf(request.securityOrigin || (request.frame && request.frame.url) || '');
        if (!APP_ORIGINS.has(origin)) {
            callback({});
            return;
        }
        try {
            const sources = (await desktopCapturer.getSources({ types: ['screen', 'window'], thumbnailSize: { width: 0, height: 0 } })).slice(0, 10);
            if (!sources.length) {
                callback({});
                return;
            }
            const turkish = app.getLocale().startsWith('tr');
            const window = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
            const cancel = turkish ? 'İptal' : 'Cancel';
            const { response } = await dialog.showMessageBox(window, {
                type: 'question',
                title: turkish ? 'Ekran paylaş' : 'Share your screen',
                message: turkish ? 'Neyi paylaşmak istiyorsun?' : 'What do you want to share?',
                buttons: [...sources.map((source) => source.name), cancel],
                cancelId: sources.length,
                noLink: true,
            });
            callback(response < sources.length ? { video: sources[response] } : {});
        } catch {
            callback({});
        }
    }, { useSystemPicker: true });
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
    allowOwnSitesOnly();
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
