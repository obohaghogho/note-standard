const { execSync, spawn } = require('child_process');
const os = require('os');
const net = require('net');

const PORT = process.env.PORT || 5000;

function log(msg) {
    console.log(`\x1b[36m[FixScript]\x1b[0m ${msg}`);
}

function checkPort(port) {
    try {
        const platform = os.platform();
        let cmd = platform === 'win32' ? `netstat -ano | findstr :${port}` : `lsof -i :${port} -t`;
        const stdout = execSync(cmd, { stdio: 'pipe' }).toString();
        return stdout;
    } catch (e) {
        return '';
    }
}

function killPort(port) {
    if (os.platform() === 'win32') {
        try {
            // Find PIDs listening on the specified port
            const findCmd = `powershell -Command "Get-NetTCPConnection -LocalPort ${port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"`;
            const pidsRaw = execSync(findCmd, { stdio: 'pipe' }).toString().trim();
            if (pidsRaw) {
                const pids = pidsRaw.split(/\r?\n/).map(p => p.trim()).filter(p => /^\d+$/.test(p) && p !== '0');
                for (const pid of pids) {
                    log(`Killing process ${pid} on port ${port}...`);
                    try {
                        execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
                    } catch (e) { /* ignore */ }
                }
            }
        } catch (e) {
            // Fallback to npx kill-port
            try {
                execSync(`npx --yes kill-port ${port}`, { stdio: 'ignore' });
            } catch (err) { /* ignore */ }
        }
    } else {
        try {
            execSync(`npx --yes kill-port ${port}`, { stdio: 'ignore' });
        } catch (e) { /* ignore */ }
    }

    // Wait a moment for OS socket release
    const start = Date.now();
    while (Date.now() - start < 1500) {
        // busy wait
    }
}

function start() {
    log(`Cleaning port ${PORT}...`);
    killPort(PORT);
    
    // Double check
    const check = checkPort(PORT);
    if (check) {
        log(`WARNING: Port ${PORT} is still in use! Attempting to start anyway...`);
    } else {
        log(`Port ${PORT} is clean.`);
    }

    log('Starting nodemon...');
    const nodemonCmd = os.platform() === 'win32' ? 'npx.cmd' : 'npx';
    const child = spawn(nodemonCmd, ['nodemon', 'index.js'], {
        cwd: process.cwd(),
        stdio: 'inherit',
        shell: true
    });

    child.on('error', (err) => {
        console.error('Failed to start nodemon:', err);
    });
}

start();
