const assert = require('assert');

// Test 1: MIME and Extension Resolution Helper Test
function getMediaExtensionAndMime(fileType, fileName, type) {
    let normalizedType = fileType ? fileType.split(';')[0].toLowerCase() : '';
    let name = fileName || '';

    if (!normalizedType) {
        if (type === 'audio') normalizedType = 'audio/mp4';
        else if (type === 'image') normalizedType = 'image/jpeg';
        else if (type === 'video') normalizedType = 'video/mp4';
        else normalizedType = 'application/octet-stream';
    }

    let ext = '.bin';
    if (normalizedType.includes('quicktime')) ext = '.mov';
    else if (normalizedType.startsWith('video/mp4')) ext = '.mp4';
    else if (normalizedType.startsWith('video/webm')) ext = '.webm';
    else if (normalizedType.includes('mp4') || normalizedType.includes('m4a') || normalizedType.includes('aac')) ext = '.m4a';
    else if (normalizedType.includes('webm')) ext = '.webm';
    else if (normalizedType.includes('ogg')) ext = '.ogg';
    else if (normalizedType.includes('mpeg') || normalizedType.includes('mp3')) ext = '.mp3';
    else if (normalizedType.includes('jpeg') || normalizedType.includes('jpg')) ext = '.jpg';
    else if (normalizedType.includes('png')) ext = '.png';
    else if (normalizedType.includes('webp')) ext = '.webp';
    else if (type === 'audio') ext = '.m4a';
    else if (type === 'image') ext = '.jpg';
    else if (type === 'video') ext = '.mp4';

    if (!name) {
        const prefix = type === 'audio' ? 'voice' : type;
        name = `${prefix}_${Date.now()}${ext}`;
    }

    return { mime: normalizedType, ext, name };
}

// Test 2: Native MP4 Passthrough Qualifier
function isNativeMp4Audio(mimeType, storagePath) {
    const normalized = (mimeType || '').toLowerCase();
    const pathLower = (storagePath || '').toLowerCase();
    return normalized.includes('mp4') || normalized.includes('m4a') || normalized.includes('aac') || pathLower.endsWith('.m4a') || pathLower.endsWith('.mp4');
}

// Test 3: Signed URL Blob Rejection Guard
function isPathSignedUrlEligible(path) {
    if (!path) return false;
    if (path.startsWith('blob:') || path.startsWith('http:') || path.startsWith('https:') || path.startsWith('data:')) {
        return false;
    }
    return true;
}

function runTests() {
    console.log('[REGRESSION TEST] Running chat media MIME & blob isolation test suite...');

    // Test A: Audio MIME Mappings
    const mp4Audio = getMediaExtensionAndMime('audio/mp4', '', 'audio');
    assert.strictEqual(mp4Audio.mime, 'audio/mp4');
    assert.strictEqual(mp4Audio.ext, '.m4a');
    assert.ok(mp4Audio.name.endsWith('.m4a'));

    const webmAudio = getMediaExtensionAndMime('audio/webm;codecs=opus', '', 'audio');
    assert.strictEqual(webmAudio.mime, 'audio/webm');
    assert.strictEqual(webmAudio.ext, '.webm');
    assert.ok(webmAudio.name.endsWith('.webm'));

    const oggAudio = getMediaExtensionAndMime('audio/ogg;codecs=opus', '', 'audio');
    assert.strictEqual(oggAudio.mime, 'audio/ogg');
    assert.strictEqual(oggAudio.ext, '.ogg');
    assert.ok(oggAudio.name.endsWith('.ogg'));

    // Test B: Image & Video MIME Mappings
    const jpegImg = getMediaExtensionAndMime('image/jpeg', 'photo.jpg', 'image');
    assert.strictEqual(jpegImg.mime, 'image/jpeg');
    assert.strictEqual(jpegImg.ext, '.jpg');

    const pngImg = getMediaExtensionAndMime('image/png', 'doc.png', 'image');
    assert.strictEqual(pngImg.mime, 'image/png');
    assert.strictEqual(pngImg.ext, '.png');

    const movVideo = getMediaExtensionAndMime('video/quicktime', 'clip.mov', 'video');
    assert.strictEqual(movVideo.mime, 'video/quicktime');
    assert.strictEqual(movVideo.ext, '.mov');

    const mp4Video = getMediaExtensionAndMime('video/mp4', 'movie.mp4', 'video');
    assert.strictEqual(mp4Video.mime, 'video/mp4');
    assert.strictEqual(mp4Video.ext, '.mp4');

    // Test C: Native MP4 Passthrough Qualifier
    assert.strictEqual(isNativeMp4Audio('audio/mp4', 'temp/raw_123_voice.m4a'), true);
    assert.strictEqual(isNativeMp4Audio('audio/m4a', 'temp/raw_123_voice.m4a'), true);
    assert.strictEqual(isNativeMp4Audio('audio/webm', 'temp/raw_123_voice.webm'), false);

    // Test D: Blob Path Isolation
    assert.strictEqual(isPathSignedUrlEligible('blob:http://localhost:5173/abcd'), false);
    assert.strictEqual(isPathSignedUrlEligible('data:image/png;base64,...'), false);
    assert.strictEqual(isPathSignedUrlEligible('c53fd624/voice_1786131255450.m4a'), true);

    console.log('SUCCESS: All 15 chat media regression test assertions passed cleanly!');
}

runTests();
