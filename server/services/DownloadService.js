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
    async getLatestAPK() {
        try {
            const supabase = require('../config/supabase');
            // Try listing files from Supabase storage bucket 'app-releases'
            const { data: files, error } = await supabase.storage
                .from('app-releases')
                .list('', { limit: 100 });

            if (!error && files && files.length > 0) {
                const apkFiles = files.filter(f => f.name.endsWith('.apk'));
                if (apkFiles.length > 0) {
                    const versionRegex = /v?(\d+)\.(\d+)\.(\d+)/i;
                    const sortedFiles = apkFiles
                        .map(f => {
                            const match = f.name.match(versionRegex);
                            if (!match) return { name: f.name, version: [0, 0, 0] };
                            return {
                                name: f.name,
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
                    // Generate a signed URL valid for 1 hour to offload bandwidth
                    const { data: urlData, error: urlError } = await supabase.storage
                        .from('app-releases')
                        .createSignedUrl(latest.name, 3600);

                    if (!urlError && urlData?.signedUrl) {
                        logger.info(`[DownloadService] Serving latest APK from Supabase Storage: ${latest.name} (Version: ${latest.version.join('.')})`);
                        return {
                            url: urlData.signedUrl,
                            filename: latest.name,
                            version: latest.version.join('.')
                        };
                    }
                }
            }
        } catch (err) {
            logger.error('[DownloadService] Supabase APK fetch error:', err.message);
        }

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
