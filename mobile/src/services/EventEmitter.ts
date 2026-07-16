type Callback = (data: any) => void;

class CustomEventEmitter {
    private listeners: { [key: string]: Callback[] } = {};

    on(event: string, callback: Callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event: string, callback: Callback) {
        if (!this.listeners[event]) return;
        this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }

    emit(event: string, data: any) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(cb => cb(data));
    }
}

export default new CustomEventEmitter();
