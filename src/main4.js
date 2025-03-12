const { app, BrowserWindow, ipcMain, screen, globalShortcut } = require('electron')
const moment = require('moment-timezone')
const path = require('path')

// Security switches
app.commandLine.appendSwitch('disable-in-process-stack-traces')
app.commandLine.appendSwitch('disable-site-isolation-trials')
app.commandLine.appendSwitch('disable-extensions')
app.commandLine.appendSwitch('disable-component-update')

// Password darurat
const EMERGENCY_ENTRY_PASSWORD = "tanyamrazhar";
const EMERGENCY_EXIT_PASSWORD = "tanyamrazhar";

const SESSION_URL = 'https://script.google.com/macros/s/AKfycbysp3rSNRASlJfMsEzCKxntLjDBcl_DYFiqADTmeVGIZHwDoT-QVIgELMO6_wUpDLNFAw/exec?sheet=SessionList'

let currentSession = null;
let mainWindow = null;
let forceAlwaysOnTopInterval = null;

// Mencegah aplikasi langsung keluar dengan Alt+F4
app.on('before-quit', (event) => {
  event.preventDefault();
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    mainWindow.loadFile('src/close.html');
    mainWindow.webContents.once('did-finish-load', () => {
      if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('session-available', currentSession !== null);
      }
    });
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

// Fungsi untuk memaksa window tetap di atas dan terfokus
function enforceAlwaysOnTop() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        // Ini lebih kuat dibanding screen-saver
        mainWindow.setAlwaysOnTop(true, 'pop-up-menu');
        
        // Pastikan window di fokus
        mainWindow.focus();
        mainWindow.focusOnWebView();
        
        // Jika tidak fullscreen, paksa ke fullscreen
        if (!mainWindow.isFullScreen()) {
            mainWindow.setFullScreen(true);
        }
        
        // Jika minimized, maksimalkan kembali
        if (mainWindow.isMinimized()) {
            mainWindow.restore();
        }
        
        // Buat window kembali menjadi topmost melalui z-order
        mainWindow.moveTop();
    }
}

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
            require('electron').ipcRenderer.send('check-session-and-navigate-back');
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

// Script untuk memastikan fokus tetap pada aplikasi
const focusEnforcerScript = `
    // Pantau fokus, kembali ke window saat blur
    window.addEventListener('blur', function() {
        setTimeout(() => {
            window.focus();
        }, 100);
    });
    
    // Force focus terus-menerus
    setInterval(function() {
        window.focus();
    }, 1000);
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
            spellcheck: false,
            // Tambahkan opsi berikut untuk optimasi loading:
            preload: path.join(__dirname, 'preload.js'),
            defaultEncoding: 'UTF-8',
            webviewTag: false,
            images: true,
            javascript: true,
            textAreasAreResizable: false,
            experimentalFeatures: false,
            backgroundThrottling: false, // Hindari throttling saat di background
        },
        frame: false,
        fullscreen: true,
        autoHideMenuBar: true,
        kiosk: true,
        skipTaskbar: true,
        resizable: false,
        focusable: true,
        fullscreenable: true,
        minimizable: false,
        maximizable: true,
        closable: false,
        movable: false
    })

    // Prevent screen capture
    mainWindow.setContentProtection(true)
    
    // Keep window always on top dengan level lebih tinggi
    mainWindow.setAlwaysOnTop(true, 'pop-up-menu')
    mainWindow.setVisibleOnAllWorkspaces(true);
    
    // Optimasi untuk mengontrol window baru
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // Force semua window baru terbuka di window yang sama
        if (url) {
            mainWindow.loadURL(url).catch(err => console.error('Failed to load:', err));
        }
        return { action: 'deny' }; // Jangan ijinkan window baru
    });
    
    // Interval untuk selalu memastikan window tetap di atas
    forceAlwaysOnTopInterval = setInterval(enforceAlwaysOnTop, 500);

    // Monitor display changes
    screen.on('display-added', () => {
        mainWindow.setFullScreen(true)
        enforceAlwaysOnTop();
    })

    // Ketika aplikasi kehilangan fokus, paksa kembali fokus
    mainWindow.on('blur', () => {
        if (!mainWindow.isDestroyed()) {
            setTimeout(() => {
                enforceAlwaysOnTop();
            }, 100);
        }
    });

    // Menangani penutupan window
    mainWindow.on('close', (event) => {
        // Jika ini adalah penutupan yang disengaja melalui app.exit(), jangan cegah
        if (!app.isQuiting) {
            event.preventDefault();
            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.loadFile('src/close.html');
                mainWindow.webContents.once('did-finish-load', () => {
                    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                        mainWindow.webContents.send('session-available', currentSession !== null);
                    }
                });
            }
        }
    });

    // Block context menu
    mainWindow.webContents.on('context-menu', (e) => {
        e.preventDefault()
    })

    mainWindow.webContents.on('did-finish-load', () => {
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
            return;
        }
        
        const currentURL = mainWindow.webContents.getURL();
        if (!currentURL.includes('welcome.html')) {
            // Jangan tambahkan tombol navigasi di halaman no-session
            if (currentURL.includes('no-session.html') || currentURL.includes('loading.html')) {
                // Tidak perlu tambahkan tombol navigasi pada halaman ini
            } else if (currentURL.includes('close.html')) {
                // Tidak perlu tambahkan tombol kembali, sudah ada di close.html
                // mainWindow.webContents.executeJavaScript(backButtonScript);
            } else {
                mainWindow.webContents.executeJavaScript(navigationButtonsScript);
            }
            
            // Disable copy-paste and selection di semua halaman
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
            
            // Tambahkan script untuk memastikan fokus di semua halaman
            mainWindow.webContents.executeJavaScript(focusEnforcerScript);
            
            // Kirim info sesi ke halaman loading jika ini halaman loading
            if (currentURL.includes('loading.html') && currentSession) {
                mainWindow.webContents.executeJavaScript(`
                    window.currentSession = ${JSON.stringify(currentSession)};
                `);
            }
        }
    });

    // Block keyboard shortcuts
    mainWindow.webContents.on('before-input-event', (event, input) => {
        // Pastikan mainWindow masih valid
        if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
            return;
        }
        
        const blockedKeys = ['Tab', 'Escape', 'Meta', 'Alt', 'F4', 'F11', 'PrintScreen']
        if (
            input.meta || 
            input.alt || 
            (input.control && input.alt) ||
            blockedKeys.includes(input.key) ||
            (input.control && ['i', 'q', 'r', 'p', 'c', 'v', 'x'].includes(input.key.toLowerCase()))
        ) {
            event.preventDefault()
            // Khusus untuk Alt+F4, arahkan ke halaman keluar
            if (input.alt && input.key === 'F4') {
                if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.loadFile('src/close.html');
                    mainWindow.webContents.once('did-finish-load', () => {
                        if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                            mainWindow.webContents.send('session-available', currentSession !== null);
                        }
                    });
                }
            }
        }
    })
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

// Block USB devices
app.on('device-added', () => {
    if (mainWindow) {
        mainWindow.focus()
        mainWindow.setFullScreen(true)
        enforceAlwaysOnTop();
    }
})

// Pantau perubahan fokus di sistem operasi
app.on('browser-window-blur', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        setTimeout(() => {
            enforceAlwaysOnTop();
        }, 100);
    }
});

ipcMain.on('check-password', (event, password) => {
    const isValid = (currentSession && password === currentSession['Password Masuk']) || 
                    password === EMERGENCY_ENTRY_PASSWORD;
    event.reply('password-result', isValid);
});

ipcMain.on('load-close-page', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.loadFile('src/close.html');
        mainWindow.webContents.once('did-finish-load', () => {
            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.send('session-available', currentSession !== null);
            }
        });
    }
});

// Handler baru untuk tombol kembali di close.html
ipcMain.on('check-session-and-navigate-back', () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
    }
    
    if (currentSession) {
        // Jika ada sesi aktif, arahkan ke halaman loading terlebih dahulu
        mainWindow.loadFile('src/loading.html')
            .then(() => {
                // Kirim info sesi ke halaman loading
                if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.webContents.executeJavaScript(`
                        window.currentSession = ${JSON.stringify(currentSession)};
                    `);
                    
                    // Setelah halaman loading tampil, kemudian muat URL ujian
                    setTimeout(() => {
                        if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                            mainWindow.loadURL(currentSession['URL Ujian'], {
                                timeout: 60000 // 60 detik timeout
                            }).catch(() => {
                                if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                                    mainWindow.loadFile('src/connection-error.html');
                                }
                            });
                        }
                    }, 500);
                }
            })
            .catch(() => {
                if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.loadFile('src/connection-error.html');
                }
            });
    } else {
        // Jika tidak ada sesi aktif, arahkan ke halaman no-session
        mainWindow.loadFile('src/no-session.html');
    }
});

ipcMain.on('confirm-exit', (event, password) => {
    if ((currentSession && password === currentSession['Password Keluar']) || 
        password === EMERGENCY_EXIT_PASSWORD) {
        // Set flag bahwa ini adalah penutupan yang disengaja
        app.isQuiting = true;
        
        // Clear interval
        if (forceAlwaysOnTopInterval) {
            clearInterval(forceAlwaysOnTopInterval);
        }
        
        // Unregister shortcuts
        globalShortcut.unregisterAll();
        
        // Cara yang lebih kuat untuk keluar dari aplikasi
        setTimeout(() => {
            console.log('Forcing app to exit...');
            app.exit(0);
        }, 500);
    } else {
        event.reply('exit-result', false);
    }
});

// Tambahkan handler untuk keluar dari halaman no-session tanpa password
ipcMain.on('no-session-exit', () => {
    // Set flag dan keluar tanpa password
    app.isQuiting = true;
    
    // Clear interval
    if (forceAlwaysOnTopInterval) {
        clearInterval(forceAlwaysOnTopInterval);
    }
    
    // Unregister shortcuts
    globalShortcut.unregisterAll();
    
    // Keluar dari aplikasi
    setTimeout(() => {
        console.log('Exiting from no-session page...');
        app.exit(0);
    }, 500);
});

ipcMain.on('load-exam', () => {
    if (!currentSession || !mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
    }
    
    // Tampilkan loading screen terlebih dahulu
    mainWindow.loadFile('src/loading.html')
        .then(() => {
            // Kirim info sesi ke halaman loading
            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.webContents.executeJavaScript(`
                    window.currentSession = ${JSON.stringify(currentSession)};
                `);
                
                // Setelah loading screen ditampilkan, coba muat URL ujian dengan delay kecil
                setTimeout(() => {
                    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                        mainWindow.loadURL(currentSession['URL Ujian'], {
                            timeout: 60000 // 60 detik timeout
                        }).catch((err) => {
                            console.error('Failed to load exam URL:', err);
                            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                                mainWindow.loadFile('src/connection-error.html');
                            }
                        });
                    }
                }, 500); // Delay kecil untuk memastikan loading screen muncul
            }
        })
        .catch(() => {
            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                mainWindow.loadFile('src/connection-error.html');
            }
        });
});

ipcMain.on('retry-connection', async () => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) {
        return;
    }
    
    try {
        // Coba muat sesi kembali
        const session = await getCurrentSession();
        currentSession = session;
        
        if (currentSession) {
            // Jika berhasil mendapatkan sesi, muat halaman loading terlebih dahulu
            mainWindow.loadFile('src/loading.html')
                .then(() => {
                    // Kirim info sesi ke halaman loading
                    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                        mainWindow.webContents.executeJavaScript(`
                            window.currentSession = ${JSON.stringify(currentSession)};
                        `);
                        
                        // Kemudian muat URL ujian
                        setTimeout(() => {
                            if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                                mainWindow.loadURL(currentSession['URL Ujian'], {
                                    timeout: 60000 // 60 detik timeout
                                }).catch(() => {
                                    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                                        mainWindow.loadFile('src/connection-error.html');
                                    }
                                });
                            }
                        }, 500);
                    }
                })
                .catch(() => {
                    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                        mainWindow.loadFile('src/connection-error.html');
                    }
                });
        } else {
            // Jika tidak ada sesi aktif, arahkan ke halaman no-session
            mainWindow.loadFile('src/no-session.html');
        }
    } catch (error) {
        console.error('Error retrying connection:', error);
        // Jika masih gagal, tetap di halaman error
        if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
            mainWindow.reload();
        }
    }
});

// Tetap mempertahankan handler ini untuk backward compatibility
ipcMain.on('load-no-session', () => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
        mainWindow.loadFile('src/no-session.html');
    }
});

// Register global shortcuts
app.whenReady().then(() => {
    // Register globalShortcuts untuk mencegah app switching
    globalShortcut.register('Alt+Tab', () => {
        console.log('Alt+Tab is disabled');
        enforceAlwaysOnTop();
        return false;
    });
    
    globalShortcut.register('Alt+Shift+Tab', () => {
        console.log('Alt+Shift+Tab is disabled');
        enforceAlwaysOnTop();
        return false;
    });
    
    globalShortcut.register('Alt+F4', () => {
        console.log('Alt+F4 is disabled');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.loadFile('src/close.html');
            mainWindow.webContents.once('did-finish-load', () => {
                if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
                    mainWindow.webContents.send('session-available', currentSession !== null);
                }
            });
        }
        return false;
    });
    
    globalShortcut.register('Alt+Escape', () => {
        console.log('Alt+Escape is disabled');
        enforceAlwaysOnTop();
        return false;
    });
    
    // Lalu buat window
    createWindow();
});

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
