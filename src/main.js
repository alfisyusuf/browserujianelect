const { app, BrowserWindow, ipcMain } = require('electron')
const moment = require('moment-timezone')
const path = require('path')

app.commandLine.appendSwitch('disable-in-process-stack-traces')
app.commandLine.appendSwitch('disable-site-isolation-trials')

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
            devTools: false
        },
        frame: false,
        fullscreen: true,
        autoHideMenuBar: true,
        kiosk: true
    })

    mainWindow.setAlwaysOnTop(true, 'screen-saver')

    mainWindow.webContents.on('before-input-event', (event, input) => {
        // Block DevTools
        if ((input.control || input.meta) && input.key.toLowerCase() === 'i') {
            event.preventDefault()
        }
        
        // Block Alt+F4
        if (input.alt && input.key === 'F4') {
            event.preventDefault()
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
        }
    })

    // Keep your existing event handlers
    mainWindow.webContents.on('did-finish-load', () => {
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
            if (!currentSession) {
                mainWindow.loadFile('src/no-session.html')
            }
        })
        .catch(() => {
            mainWindow.loadFile('src/connection-error.html')
        })
}

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
