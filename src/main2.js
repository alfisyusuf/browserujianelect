const { app, BrowserWindow, ipcMain, screen } = require('electron')
const moment = require('moment-timezone')
const path = require('path')

// Security switches
app.commandLine.appendSwitch('disable-in-process-stack-traces')
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('disable-extensions')
app.commandLine.appendSwitch('disable-component-update')

const SESSION_URL = 'https://script.google.com/macros/s/AKfycbysp3rSNRASlJfMsEzCKxntLjDBcl_DYFiqADTmeVGIZHwDoT-QVIgELMO6_wUpDLNFAw/exec?sheet=SessionList'

let currentSession = null;
let mainWindow = null;

const navigationButtonsScript = `
    if (!document.getElementById('nav-buttons')) {
        const navDiv = document.createElement('div');
        navDiv.id = 'nav-buttons';
        navDiv.style.position = 'fixed';
        navDiv.style.top = '0';
        navDiv.style.left = '50%';
        navDiv.style.transform = 'translateX(-50%)';
        navDiv.style.zIndex = '9999';
        navDiv.style.display = 'flex';

        const homeBtn = document.createElement('button');
        homeBtn.innerHTML = 'Home';
        homeBtn.className = 'nav-button nav-button-left';
        homeBtn.onclick = () => {
            require('electron').ipcRenderer.send('load-exam');
        };

        const logoutBtn = document.createElement('button');
        logoutBtn.innerHTML = 'Keluar';
        logoutBtn.className = 'nav-button nav-button-right';
        logoutBtn.onclick = () => {
            require('electron').ipcRenderer.send('load-close-page');
        };

        const style = document.createElement('style');
        style.textContent = \`
            .nav-button {
                background: linear-gradient(45deg, #3f51b5, #5c6bc0);
                color: white;
                padding: 12px 30px;
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transition: all 0.3s ease;
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            .nav-button-left {
                border-bottom-left-radius: 12px;
            }
            .nav-button-right {
                border-bottom-right-radius: 12px;
            }
            .nav-button:hover {
                background: linear-gradient(45deg, #5c6bc0, #3f51b5);
                box-shadow: 0 3px 8px rgba(63, 81, 181, 0.3);
            }
            .nav-button:active {
                transform: translateY(1px);
            }
        \`;

        document.head.appendChild(style);
        navDiv.appendChild(homeBtn);
        navDiv.appendChild(logoutBtn);
        document.body.appendChild(navDiv);
    }
`;

const backButtonScript = `
    if (!document.getElementById('back-button')) {
        const backBtn = document.createElement('button');
        backBtn.id = 'back-button';
        backBtn.innerHTML = 'Kembali';
        backBtn.style.position = 'fixed';
        backBtn.style.top = '20px';
        backBtn.style.left = '20px';
        backBtn.className = 'nav-button';
        backBtn.style.borderRadius = '12px';
        backBtn.onclick = () => {
            require('electron').ipcRenderer.send('load-exam');
        };

        const style = document.createElement('style');
        style.textContent = \`
            .nav-button {
                background: linear-gradient(45deg, #3f51b5, #5c6bc0);
                color: white;
                padding: 12px 30px;
                cursor: pointer;
                border: none;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transition: all 0.3s ease;
                font-size: 14px;
                font-weight: 600;
                letter-spacing: 0.5px;
                text-transform: uppercase;
            }
            .nav-button:hover {
                background: linear-gradient(45deg, #5c6bc0, #3f51b5);
                box-shadow: 0 3px 8px rgba(63, 81, 181, 0.3);
            }
            .nav-button:active {
                transform: translateY(1px);
            }
        \`;

        document.head.appendChild(style);
        document.body.appendChild(backBtn);
    }
`;

async function getCurrentSession() {
    try {
        const response = await fetch(SESSION_URL)
        const sessions = await response.json()
        
        const jakartaTime = moment().tz('Asia/Jakarta')
        
        const activeSession = sessions.find(session => {
            const startTime = moment.tz(session['Waktu Mulai'], 'Asia/Jakarta')
            const endTime = moment.tz(session['Waktu Selesai'], 'Asia/Jakarta')
            return jakartaTime.isBetween(startTime, endTime)
        })
        
        return activeSession
    } catch (error) {
        console.error('Error fetching sessions:', error)
        return null
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1024,
        height: 768,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            devTools: false,
            enableRemoteModule: false,
            webSecurity: true,
            spellcheck: false
        },
        frame: false,
        fullscreen: true,
        autoHideMenuBar: true,
        kiosk: true,
        skipTaskbar: true,
        resizable: false
    })

    // Prevent screen capture
    mainWindow.setContentProtection(true)
    
    // Keep window always on top
    mainWindow.setAlwaysOnTop(true, 'screen-saver')

    // Monitor display changes
    screen.on('display-added', () => {
        mainWindow.setFullScreen(true)
    })

    // Block context menu
    mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault()
    })

    mainWindow.webContents.on('did-finish-load', () => {
        const currentURL = mainWindow.webContents.getURL();
        if (!currentURL.includes('welcome.html')) {
            if (currentURL.includes('close.html')) {
                mainWindow.webContents.executeJavaScript(backButtonScript);
            } else {
                mainWindow.webContents.executeJavaScript(navigationButtonsScript);
            }
            
            // Disable copy-paste and selection
            mainWindow.webContents.executeJavaScript(`
                document.addEventListener('contextmenu', e => e.preventDefault());
                document.addEventListener('selectstart', e => e.preventDefault());
                document.addEventListener('copy', e => e.preventDefault());
                document.addEventListener('cut', e => e.preventDefault());
                document.addEventListener('paste', e => e.preventDefault());
                document.addEventListener('keydown', e => {
                    if (e.key === 'PrintScreen') {
                        e.preventDefault();
                    }
                });
            `);
        }
    });

    // Block keyboard shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
        const blockedKeys = ['Tab', 'Escape', 'Meta', 'Alt', 'F4', 'F11', 'PrintScreen']
        if (
            input.meta || 
            input.alt || 
            (input.control && input.alt) ||
            blockedKeys.includes(input.key) ||
            (input.control && ['i', 'q', 'r', 'p', 'c', 'v', 'x'].includes(input.key.toLowerCase()))
        ) {
            event.preventDefault()
        }
    })

    mainWindow.loadFile('src/welcome.html')
        .then(() => {
            return getCurrentSession()
        })
        .then(session => {
            currentSession = session
            if (!currentSession) {
                mainWindow.loadFile('src/no-session.html')
            }
        })
        .catch(() => {
            mainWindow.loadFile('src/connection-error.html')
        })
}

// Block USB devices
app.on('device-added', () => {
    if (mainWindow) {
        mainWindow.focus()
        mainWindow.setFullScreen(true)
    }
})

ipcMain.on('check-password', (event, password) => {
    const isValid = currentSession && password === currentSession['Password Masuk'];
    event.reply('password-result', isValid);
});

ipcMain.on('load-close-page', () => {
    mainWindow.loadFile('src/close.html');
});

ipcMain.on('confirm-exit', (event, password) => {
    if (currentSession && password === currentSession['Password Keluar']) {
        app.quit();
    } else {
        event.reply('exit-result', false);
    }
});

ipcMain.on('load-exam', () => {
    if (!currentSession) return;
    
    mainWindow.loadURL(currentSession['URL Ujian'])
        .catch(() => {
            mainWindow.loadFile('src/connection-error.html')
        })
});

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})
