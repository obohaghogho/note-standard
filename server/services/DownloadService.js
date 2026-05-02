const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Service to manage app downloads and versioning
 */
class DownloadService {
    constructor() {
        this.apkDir = path.join(__dirname, '..', 'uploads', 'versions');
        this.fallbacks = [
            path.join(__dirname, '..', '..', 'client', 'public', 'downloads', 'app-release.apk'),
            path.join(__dirname, '..', '..', 'client', 'dist', 'downloads', 'app-release.apk'),
            path.join(__dirname, '..', 'public', 'downloads', 'app-release.apk'),
            path.join(process.cwd(), 'client', 'public', 'downloads', 'app-release.apk'),
            path.join(process.cwd(), 'client', 'dist', 'downloads', 'app-release.apk'),
        ];
    }

    /**
     * Finds the latest APK file based on filename versioning (e.g., NoteStandard_v1.2.0.apk)
     */
    getLatestAPK() {
        try {
            if (!fs.existsSync(this.apkDir)) {
                return this.getFallback();
            }

            const files = fs.readdirSync(this.apkDir)
                .filter(file => file.endsWith('.apk'));

            if (files.length === 0) {
                return this.getFallback();
            }

            // Version pattern: v1.2.3 or 1.2.3
            const versionRegex = /v?(\d+)\.(\d+)\.(\d+)/i;

            const sortedFiles = files
                .map(file => {
                    const match = file.match(versionRegex);
                    if (!match) return { file, version: [0, 0, 0] };
                    return {
                        file,
                        version: [
                            parseInt(match[1], 10),
                            parseInt(match[2], 10),
                            parseInt(match[3], 10)
                        ]
                    };
                })
                .sort((a, b) => {
                    for (let i = 0; i < 3; i++) {
                        if (a.version[i] > b.version[i]) return -1;
                        if (a.version[i] < b.version[i]) return 1;
                    }
                    return 0;
                });

            const latest = sortedFiles[0];
            const fullPath = path.join(this.apkDir, latest.file);
            
            logger.info(`[DownloadService] Serving latest APK: ${latest.file} (Version: ${latest.version.join('.')})`);
            return {
                path: fullPath,
                filename: latest.file,
                version: latest.version.join('.')
            };

        } catch (err) {
            logger.error('[DownloadService] Error resolving latest APK:', err.message);
            return this.getFallback();
        }
    }

    getFallback() {
        for (const fallbackPath of this.fallbacks) {
            if (fs.existsSync(fallbackPath)) {
                logger.info(`[DownloadService] Falling back to APK at: ${fallbackPath}`);
                return {
                    path: fallbackPath,
                    filename: path.basename(fallbackPath),
                    version: 'unknown'
                };
            }
        }
        
        logger.error('[DownloadService] No APK fallback found in any expected location');
        return null;
    }
}

module.exports = new DownloadService();
