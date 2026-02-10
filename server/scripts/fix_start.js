const { execSync, spawn } = require('child_process');
const os = require('os');
const net = require('net');

const PORT = 5000;

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
    const stdout = checkPort(port);
    if (!stdout) {
        log(`Port ${port} is free.`);
        return;
    }

    const lines = stdout.trim().split('\n');
    const pids = new Set();
    lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        // On Windows netstat: Proto Local Address Foreign Address State PID
        // Last element is PID
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== '0') {
            pids.add(pid);
        }
    });

    if (pids.size > 0) {
        log(`Killing PIDs on port ${port}: ${Array.from(pids).join(', ')}`);
        pids.forEach(pid => {
            try {
                if (os.platform() === 'win32') {
                    execSync(`taskkill /F /PID ${pid}`);
                } else {
                    process.kill(pid, 'SIGKILL');
                }
            } catch (e) {
                // Ignore if already dead
            }
        });
        
        // Wait a moment for OS to release port
        const start = Date.now();
        while (Date.now() - start < 1000) {} 
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
