const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

// Your deployed website URL
const WEBSITE_URL = 'https://hanogt.pages.dev';

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
        if (!url.startsWith(WEBSITE_URL)) {
            shell.openExternal(url);
            return { action: 'deny' };
        }
        return { action: 'allow' };
    });

    // Handle navigation
    mainWindow.webContents.on('will-navigate', (event, url) => {
        // Keep internal navigation, open external links in browser
        if (!url.startsWith(WEBSITE_URL) && !url.startsWith('https://accounts.google.com')) {
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
