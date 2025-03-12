/**
 * Preload script untuk optimasi loading di browser ujian
 * Script ini dijalankan sebelum halaman dimuat
 */

// Fungsi untuk ekstrak domain dari URL
function extractDomain(url) {
    try {
        const urlObj = new URL(url);
        return urlObj.origin;
    } catch (e) {
        console.error('Error extracting domain:', e);
        return null;
    }
}

// Preload sumber daya untuk mempercepat loading
window.addEventListener('DOMContentLoaded', () => {
    // Jika ini adalah halaman loading dan ada informasi sesi
    if (document.title === 'Memuat Ujian' && window.currentSession) {
        try {
            const examUrl = window.currentSession['URL Ujian'];
            if (!examUrl) return;
            
            const domain = extractDomain(examUrl);
            if (!domain) return;
            
            console.log('Setting up preconnect for:', domain);
            
            // Buat elemen link preconnect
            const preconnect = document.createElement('link');
            preconnect.rel = 'preconnect';
            preconnect.href = domain;
            document.head.appendChild(preconnect);
            
            // Buat elemen link dns-prefetch
            const dnsPrefetch = document.createElement('link');
            dnsPrefetch.rel = 'dns-prefetch';
            dnsPrefetch.href = domain;
            document.head.appendChild(dnsPrefetch);
            
            // Mulai prefetch resource jika memungkinkan
            setTimeout(() => {
                // Preload favicon domain tujuan
                const faviconLink = document.createElement('link');
                faviconLink.rel = 'prefetch';
                faviconLink.href = `${domain}/favicon.ico`;
                document.head.appendChild(faviconLink);
                
                // Potential prefetch untuk common assets
                const commonAssets = ['/styles.css', '/main.js', '/bundle.js'];
                commonAssets.forEach(asset => {
                    const assetLink = document.createElement('link');
                    assetLink.rel = 'prefetch';
                    assetLink.href = `${domain}${asset}`;
                    document.head.appendChild(assetLink);
                });
            }, 1000);
        } catch (e) {
            console.error('Error setting up prefetch:', e);
        }
    }
    
    // Tambahkan pengoptimalan khusus browser
    try {
        // Disable cache throttling
        if (window.caches) {
            caches.keys().then(cacheNames => {
                cacheNames.forEach(cacheName => {
                    console.log('Pre-warming cache:', cacheName);
                });
            });
        }
        
        // Prioritaskan resource loading
        if (navigator.connection) {
            console.log('Connection type:', navigator.connection.effectiveType);
            // Adjust based on connection type
            if (navigator.connection.effectiveType === '4g') {
                // Bisa preload lebih banyak untuk koneksi cepat
            } else {
                // Minimalisir preloading untuk koneksi lambat
            }
        }
    } catch (e) {
        console.error('Error optimizing browser:', e);
    }
});

// Optimize untuk fetch
const originalFetch = window.fetch;
if (originalFetch) {
    window.fetch = function(...args) {
        // Tambahkan opsi cache untuk fetch requests
        if (args.length >= 2 && typeof args[1] === 'object') {
            if (!args[1].cache) {
                args[1].cache = 'default';
            }
            // Tambahkan priority jika browser mendukung
            if (!args[1].priority && 'priority' in Request.prototype) {
                args[1].priority = 'high';
            }
        }
        return originalFetch.apply(this, args);
    };
}

// Tambahan: fungsi untuk memeriksa dan memulihkan koneksi yang gagal
let connectionMonitorInterval;
window.addEventListener('load', () => {
    // Jika ini adalah halaman error koneksi, mulai monitor koneksi
    if (document.title && document.title.includes('Error')) {
        connectionMonitorInterval = setInterval(() => {
            // Cek koneksi dengan fetch ke Google
            fetch('https://www.google.com/favicon.ico', { 
                mode: 'no-cors',
                cache: 'no-store'
            })
            .then(() => {
                console.log('Connection restored, attempting to reload');
                // Jika berhasil dan ini halaman error, coba reload
                if (document.title && document.title.includes('Error')) {
                    clearInterval(connectionMonitorInterval);
                    require('electron').ipcRenderer.send('retry-connection');
                }
            })
            .catch(e => console.error('Still no connection:', e));
        }, 10000); // Cek setiap 10 detik
    } else if (connectionMonitorInterval) {
        clearInterval(connectionMonitorInterval);
    }
});
