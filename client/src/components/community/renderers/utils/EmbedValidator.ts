const ALLOWED_EMBED_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'codepen.io',
  'figma.com',
  'open.spotify.com'
];

export class EmbedValidator {
  
  static isAllowedProvider(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.replace('www.', '');
      return ALLOWED_EMBED_DOMAINS.includes(hostname);
    } catch {
      return false;
    }
  }

  static getSafeIframeProps(url: string) {
    return {
      src: url,
      sandbox: 'allow-scripts allow-same-origin allow-popups allow-presentation', // Strict iframe sandbox
      loading: 'lazy' as const,
      referrerPolicy: 'no-referrer' as const
    };
  }
}
