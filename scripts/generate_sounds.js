const fs = require('fs');
const path = require('path');

function writeWavHeader(buffer, sampleRate, numChannels, bitsPerSample, dataSize) {
    // RIFF chunk descriptor
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
    buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
    buffer.writeUInt16LE(numChannels, 22); // NumChannels
    buffer.writeUInt32LE(sampleRate, 24); // SampleRate
    buffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28); // ByteRate
    buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32); // BlockAlign
    buffer.writeUInt16LE(bitsPerSample, 34); // BitsPerSample

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);
}

function generateDialTone(filePath) {
    const sampleRate = 44100;
    const durationSec = 4; // 2 sec tone, 2 sec silence
    const numSamples = sampleRate * durationSec;
    const dataSize = numSamples * 2; // 16-bit
    const buffer = Buffer.alloc(44 + dataSize);
    
    writeWavHeader(buffer, sampleRate, 1, 16, dataSize);
    
    // European dial tone: 425Hz 
    // US dial tone: 350Hz + 440Hz
    // Let's do US style ringback: 440Hz + 480Hz, 2 sec on, 4 sec off.
    // For simplicity, we just do 2s on, 2s off in a 4s loop
    for (let i = 0; i < numSamples; i++) {
        let sample = 0;
        const t = i / sampleRate;
        if (t < 2.0) { // ON for 2 seconds
            const f1 = 440;
            const f2 = 480;
            sample = (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t)) * 0.25;
            
            // Apply simple envelope
            if (t < 0.1) sample *= (t / 0.1);
            if (t > 1.9) sample *= ((2.0 - t) / 0.1);
        }
        
        // 16-bit PCM
        const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
        buffer.writeInt16LE(intSample, 44 + i * 2);
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log(`Generated dial tone: ${filePath}`);
}

function generateIncomingRingtone(filePath) {
    const sampleRate = 44100;
    const durationSec = 3; 
    const numSamples = sampleRate * durationSec;
    const dataSize = numSamples * 2; 
    const buffer = Buffer.alloc(44 + dataSize);
    
    writeWavHeader(buffer, sampleRate, 1, 16, dataSize);
    
    // Modern electronic ringtone: 
    // Sequence of rapidly alternating frequencies
    for (let i = 0; i < numSamples; i++) {
        let sample = 0;
        const t = i / sampleRate;
        
        // Pattern: [0-0.4s ON], [0.4-0.6s OFF], [0.6-1.0s ON], [1.0-3.0s OFF]
        const cycleT = t % 3.0;
        let isOn = (cycleT < 0.4) || (cycleT > 0.6 && cycleT < 1.0);
        
        if (isOn) {
            // Rapid trill between 800Hz and 1000Hz
            const isHigh = (Math.floor(t * 20) % 2) === 0;
            const freq = isHigh ? 1000 : 800;
            sample = Math.sin(2 * Math.PI * freq * t) * 0.4;
            
            // Modulate amplitude slightly for buzz
            sample *= (0.7 + 0.3 * Math.sin(2 * Math.PI * 50 * t));
        }
        
        const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
        buffer.writeInt16LE(intSample, 44 + i * 2);
    }
    
    fs.writeFileSync(filePath, buffer);
    console.log(`Generated incoming ringtone: ${filePath}`);
}

const soundsDir = path.join(__dirname, 'client', 'public', 'sounds');
if (!fs.existsSync(soundsDir)) {
    fs.mkdirSync(soundsDir, { recursive: true });
}

generateDialTone(path.join(soundsDir, 'ringtone.wav'));
generateIncomingRingtone(path.join(soundsDir, 'ringing.wav'));
