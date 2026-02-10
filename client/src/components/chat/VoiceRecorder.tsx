import { useState, useRef } from 'react';
import { toast } from 'react-hot-toast';
import { Mic, Square, Play, Pause, Trash2, Send } from 'lucide-react';
import { Button } from '../common/Button';

interface VoiceRecorderProps {
    onSend: (audioBlob: Blob) => void;
    onCancel: () => void;
}

export const VoiceRecorder: React.FC<VoiceRecorderProps> = ({ onSend, onCancel }) => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [recordingTime, setRecordingTime] = useState(0);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
    const timerRef = useRef<any>(null);

    const startRecording = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream);
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    audioChunksRef.current.push(event.data);
                }
            };

            mediaRecorderRef.current.onstop = () => {
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const url = URL.createObjectURL(audioBlob);
                setAudioUrl(url);
            };

            mediaRecorderRef.current.start();
            setIsRecording(true);

            // Start Timer
            setRecordingTime(0);
            timerRef.current = setInterval(() => {
                setRecordingTime((prev) => prev + 1);
            }, 1000);

        } catch (error) {
            console.error('Error accessing microphone:', error);
            toast.error('Could not access microphone. Please allow permissions.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && isRecording) {
            mediaRecorderRef.current.stop();
            if (timerRef.current) clearInterval(timerRef.current);
            setIsRecording(false);

            // Stop all tracks to release mic
            mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }
    };

    const togglePlayback = () => {
        if (audioPlayerRef.current) {
            if (isPlaying) {
                audioPlayerRef.current.pause();
            } else {
                audioPlayerRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSend = () => {
        if (audioChunksRef.current.length > 0) {
            const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            onSend(audioBlob);
        }
    };

    return (
        <div className="flex items-center gap-3 bg-white/5 p-2 rounded-lg animate-in fade-in slide-in-from-bottom-2 duration-200">
            {audioUrl ? (
                // Preview Mode
                <>
                    <audio
                        ref={audioPlayerRef}
                        src={audioUrl}
                        onEnded={() => setIsPlaying(false)}
                        className="hidden"
                    />
                    <button onClick={togglePlayback} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors">
                        {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <div className="h-1 w-24 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-primary animate-pulse" style={{ width: '100%' }}></div>
                    </div>
                    <button onClick={() => { setAudioUrl(null); audioChunksRef.current = []; }} className="p-2 text-red-400 hover:text-red-300">
                        <Trash2 size={18} />
                    </button>
                    <Button size="sm" onClick={handleSend} className="rounded-full px-4">
                        Send Voice <Send size={14} className="ml-2" />
                    </Button>
                </>
            ) : (
                // Recording Mode
                <>
                    {isRecording ? (
                        <>
                            <div className="flex items-center gap-2 mr-2">
                                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                                <span className="text-sm font-mono text-red-400">{formatTime(recordingTime)}</span>
                            </div>
                            <button onClick={stopRecording} className="p-2 rounded-full bg-red-500/20 text-red-500 hover:bg-red-500/30 transition-colors">
                                <Square size={18} fill="currentColor" />
                            </button>
                        </>
                    ) : (
                        <button onClick={startRecording} className="p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-primary">
                            <Mic size={20} />
                        </button>
                    )}
                    <Button variant="ghost" size="sm" onClick={onCancel}>
                        Cancel
                    </Button>
                </>
            )}
        </div>
    );
};
