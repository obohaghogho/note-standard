export interface BreadcrumbEvent {
  timestamp: string;
  category: 'navigation' | 'click' | 'api_failure' | 'console_error' | 'user_action';
  description: string;
  data?: Record<string, unknown>;
}

class CrashReplayRecorder {
  private breadcrumbs: BreadcrumbEvent[] = [];
  private maxBreadcrumbs = 50;
  private startTime = Date.now();

  constructor() {
    if (typeof window !== 'undefined') {
      this.initListeners();
    }
  }

  private initListeners() {
    // 1. Route Navigation Breadcrumb
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.addBreadcrumb('navigation', `Navigated to ${window.location.pathname}`);
    };

    // 2. User Click Breadcrumb
    window.addEventListener('click', (e) => {
      try {
        const target = e.target as HTMLElement;
        if (!target) return;
        const label = target.getAttribute('aria-label') || target.innerText?.substring(0, 30) || target.tagName;
        this.addBreadcrumb('click', `Clicked <${target.tagName.toLowerCase()}> "${label.trim()}"`);
      } catch (err) {
        void err;
      }
    }, true);
  }

  public addBreadcrumb(category: BreadcrumbEvent['category'], description: string, data?: Record<string, unknown>) {
    const event: BreadcrumbEvent = {
      timestamp: new Date().toISOString(),
      category,
      description,
      data,
    };
    this.breadcrumbs.push(event);
    if (this.breadcrumbs.length > this.maxBreadcrumbs) {
      this.breadcrumbs.shift();
    }
  }

  public getReplayData() {
    return {
      breadcrumbs: [...this.breadcrumbs],
      totalEvents: this.breadcrumbs.length,
      durationSeconds: Math.round((Date.now() - this.startTime) / 1000),
    };
  }

  public clear() {
    this.breadcrumbs = [];
    this.startTime = Date.now();
  }
}

export const crashReplayRecorder = new CrashReplayRecorder();
