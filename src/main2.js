const { app, BrowserWindow, ipcMain } = require('electron')
const moment = require('moment-timezone')
const path = require('path')

// Security switches
app.commandLine.appendSwitch('disable-in-process-stack-traces')
app.commandLine.appendSwitch('disable-site-isolation-trials')

// Password darurat
const EMERGENCY_ENTRY_PASSWORD = "tanyamrazhar";
const EMERGENCY_EXIT_PASSWORD = "tanyamrazhar";

const SESSION_URL = 'https://script.google.com/macros/s/AKfycbysp3rSNRASlJfMsEzCKxntLjDBcl_DYFiqADTmeVGIZHwDoT-QVIgELMO6_wUpDLNFAw/exec?sheet=SessionList'

let currentSession = null;
let mainWindow = null;

// Mencegah aplikasi langsung keluar dengan Alt+F4
app.on('before-quit', (event) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.loadFile('src/close.html');
  }
});

app.on('will-quit', (event) => {
    if (!app.isQuiting) {
        event.preventDefault();
    }
});

app.on('quit', (event) => {
    if (!app.isQuiting) {
        event.preventDefault();
    }
});

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
            devTools: false
        },
        frame: false,
        fullscreen: true,
        autoHideMenuBar: true,
        kiosk: true
    })

    mainWindow.setAlwaysOnTop(true, 'screen-saver')

    // Menangani penutupan window
    mainWindow.on('close', (event) => {
        // Jika ini adalah penutupan yang disengaja melalui app.exit(), jangan cegah
        if (!app.isQuiting) {
            event.preventDefault();
            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.loadFile('src/close.html');
            }
        }
    });

    mainWindow.webContents.on('before-input-event', (event, input) => {
        // Pastikan mainWindow masih valid
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
            return;
        }
        
        // Allow Enter key for forms
        if (input.key === 'Enter') {
            return;
        }
        
        // Block DevTools
        if ((input.control || input.meta) && input.key.toLowerCase() === 'i') {
            event.preventDefault()
        }
        
        // Block Alt+F4
        if (input.alt) {
            event.preventDefault()
            if (input.key === 'F4') {
                // Periksa apakah mainWindow masih valid
                if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.loadFile('src/close.html');
                }
            }
            return;
        }

        // Block Alt+Tab
        if (input.alt && input.key === 'Tab') {
            event.preventDefault()
        }

        // Block Windows key combinations
        if (input.meta) {
            event.preventDefault()
        }

        // Block Ctrl+Alt combinations
        if (input.control && input.alt) {
            event.preventDefault()
        }

        // Block Escape
        if (input.key === 'Escape') {
            event.preventDefault()
        }

        // Block Ctrl+Q
        if ((input.control || input.meta) && input.key.toLowerCase() === 'q') {
            event.preventDefault()
            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.loadFile('src/close.html');
            }
        }
    })

    // Keep your existing event handlers
    mainWindow.webContents.on('did-finish-load', () => {
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
            return;
        }
        
        const currentURL = mainWindow.webContents.getURL();
        if (!currentURL.includes('welcome.html')) {
            if (currentURL.includes('close.html')) {
                mainWindow.webContents.executeJavaScript(backButtonScript);
            } else {
                mainWindow.webContents.executeJavaScript(navigationButtonsScript);
            }
        }
    });

    // Keep your existing window loading code
    mainWindow.loadFile('src/welcome.html')
        .then(() => {
            return getCurrentSession()
        })
        .then(session => {
            currentSession = session
            
            if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
                return;
            }
            
            if (!currentSession) {
                mainWindow.loadFile('src/no-session.html')
                mainWindow.webContents.once('did-finish-load', () => {
                    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                        mainWindow.webContents.send('session-status', 'none');
                    }
                });
            } else {
                mainWindow.webContents.send('session-status', 'success');
            }
        })
        .catch(() => {
            if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
                return;
            }
            
            mainWindow.loadFile('src/connection-error.html')
            mainWindow.webContents.once('did-finish-load', () => {
                if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.webContents.send('session-status', 'error');
                }
            });
        })
}

ipcMain.on('check-password', (event, password) => {
    const isValid = (currentSession && password === currentSession['Password Masuk']) || 
                    password === EMERGENCY_ENTRY_PASSWORD;
    event.reply('password-result', isValid);
});

ipcMain.on('load-close-page', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.loadFile('src/close.html');
    }
});

ipcMain.on('confirm-exit', (event, password) => {
    console.log('Password entered:', password);
    console.log('Expected password:', currentSession ? currentSession['Password Keluar'] : 'No session');
    console.log('Emergency password check:', password === EMERGENCY_EXIT_PASSWORD);
    
    if ((currentSession && password === currentSession['Password Keluar']) || 
        password === EMERGENCY_EXIT_PASSWORD) {
        // Set flag bahwa ini adalah penutupan yang disengaja
        app.isQuiting = true;
        
        // Cara yang lebih kuat untuk keluar dari aplikasi
        setTimeout(() => {
            console.log('Forcing app to exit...');
            app.exit(0);
        }, 500);
    } else {
        event.reply('exit-result', false);
    }
});

ipcMain.on('load-exam', () => {
    if (!currentSession || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
    }
    
    mainWindow.loadURL(currentSession['URL Ujian'])
        .catch(() => {
            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.loadFile('src/connection-error.html');
            }
        });
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
