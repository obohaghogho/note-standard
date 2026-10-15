/**
 * Feed Video Coordinator — NoteStandard
 *
 * Ensures:
 * 1. Automatic playback of feed videos when scrolled into view.
 * 2. Strict mutual exclusion: only ONE video can play at any time.
 *    No two videos can ever play sound or video simultaneously.
 * 3. Automatic pause and sound stop as soon as a playing video is scrolled off.
 * 4. Graceful autoplay policy fallback (tries sound first, falls back to muted if restricted,
 *    and seamlessly unpauses/unmutes when user interacts).
 */

type VideoRegistration = {
  id: string;
  element: HTMLVideoElement;
  container: HTMLElement;
  ratio: number;
};

class FeedVideoCoordinator {
  private activeVideo: HTMLVideoElement | null = null;
  private activeId: string | null = null;
  private registrations = new Map<string, VideoRegistration>();
  private mutedPreference: boolean = false;
  private isUserInteracted: boolean = false;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('ns_feed_video_muted');
        if (stored !== null) {
          this.mutedPreference = stored === 'true';
        }
      } catch {
        // Safe fallback if localStorage is disabled
      }

      // Mark user interaction on first touch or click anywhere in window
      const handleUserGesture = () => {
        this.isUserInteracted = true;
        window.removeEventListener('pointerdown', handleUserGesture);
        window.removeEventListener('keydown', handleUserGesture);
      };
      window.addEventListener('pointerdown', handleUserGesture, { passive: true });
      window.addEventListener('keydown', handleUserGesture, { passive: true });

      // Pause playback when tab is backgrounded
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.pauseAll();
        }
      });
    }
  }

  get userPrefersMuted(): boolean {
    return this.mutedPreference;
  }

  setMutedPreference(muted: boolean) {
    this.mutedPreference = muted;
    try {
      localStorage.setItem('ns_feed_video_muted', String(muted));
    } catch {}
  }

  register(id: string, element: HTMLVideoElement, container: HTMLElement) {
    this.registrations.set(id, { id, element, container, ratio: 0 });
    // Apply user preference to initial element
    element.muted = this.mutedPreference;
  }

  unregister(id: string) {
    const reg = this.registrations.get(id);
    if (reg && reg.element === this.activeVideo) {
      this.pauseActive();
    }
    this.registrations.delete(id);
  }

  /**
   * Called whenever an IntersectionObserver entry reports a new ratio for a registered video.
   */
  updateVisibility(id: string, ratio: number) {
    const reg = this.registrations.get(id);
    if (!reg) return;

    reg.ratio = ratio;

    // RULE: If this video is currently playing and its visible ratio drops below 0.25,
    // IMMEDIATELY pause it and stop all sound!
    if (this.activeId === id && ratio < 0.25) {
      reg.element.pause();
      if (this.activeVideo === reg.element) {
        this.activeVideo = null;
        this.activeId = null;
      }
    }

    this.evaluatePlayback();
  }

  /**
   * Called whenever any video element fires 'play'.
   * Enforces mutual exclusion: pauses any other video immediately.
   */
  notifyPlay(element: HTMLVideoElement, id?: string) {
    if (this.activeVideo && this.activeVideo !== element) {
      this.activeVideo.pause();
    }
    this.activeVideo = element;

    if (id) {
      this.activeId = id;
    } else {
      for (const [regId, reg] of this.registrations.entries()) {
        if (reg.element === element) {
          this.activeId = regId;
          break;
        }
      }
    }
  }

  /**
   * Called whenever any video element fires 'pause'.
   */
  notifyPause(element: HTMLVideoElement) {
    if (this.activeVideo === element) {
      this.activeVideo = null;
      this.activeId = null;
    }
  }

  /**
   * Pauses the active video immediately.
   */
  pauseActive() {
    if (this.activeVideo) {
      try {
        this.activeVideo.pause();
      } catch {}
      this.activeVideo = null;
      this.activeId = null;
    }
  }

  /**
   * Pauses all registered videos.
   */
  pauseAll() {
    for (const reg of this.registrations.values()) {
      try {
        reg.element.pause();
      } catch {}
    }
    this.activeVideo = null;
    this.activeId = null;
  }

  /**
   * Determines the single most visible video and triggers auto-playback if eligible.
   */
  private evaluatePlayback() {
    let bestReg: VideoRegistration | null = null;
    let maxRatio = 0.35; // Must be at least 35% visible to initiate autoplay

    for (const reg of this.registrations.values()) {
      if (reg.ratio > maxRatio) {
        maxRatio = reg.ratio;
        bestReg = reg;
      }
    }

    if (bestReg) {
      // If the best video is already the active one and still playing, keep playing
      if (this.activeVideo === bestReg.element && !bestReg.element.paused) {
        return;
      }

      // If another video was active, check if new candidate is significantly more visible
      if (this.activeVideo && this.activeVideo !== bestReg.element) {
        const currentActiveReg = this.activeId ? this.registrations.get(this.activeId) : null;
        const currentRatio = currentActiveReg ? currentActiveReg.ratio : 0;

        // Don't preempt if current active is still >= 40% visible and close to candidate
        if (currentRatio >= 0.4 && bestReg.ratio - currentRatio < 0.2) {
          return;
        }
      }

      // Switch to the best video
      this.playVideo(bestReg.element, bestReg.id);
    }
  }

  /**
   * Safely plays a video with automatic fallback for browser autoplay policies.
   */
  async playVideo(video: HTMLVideoElement, id: string) {
    // Pause any other currently playing video first
    if (this.activeVideo && this.activeVideo !== video) {
      try {
        this.activeVideo.pause();
      } catch {}
    }

    this.activeVideo = video;
    this.activeId = id;

    // Apply mute preference:
    // If user explicitly muted, or if user hasn't interacted with document yet,
    // start muted to guarantee smooth autoplay.
    if (this.mutedPreference || !this.isUserInteracted) {
      video.muted = true;
    } else {
      video.muted = false;
    }

    try {
      await video.play();
    } catch (err: any) {
      // Autoplay blocked because unmuted sound was rejected by browser policy
      try {
        video.muted = true;
        await video.play();
      } catch (fallbackErr) {
        // If autoplay is completely disallowed without direct user tap, fail gracefully
      }
    }
  }
}

export const feedVideoCoordinator = new FeedVideoCoordinator();
