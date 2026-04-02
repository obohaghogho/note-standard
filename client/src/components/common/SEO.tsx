import { useEffect } from 'react';

interface SEOProps {
  title: string;
  description?: string;
  keywords?: string;
}

export const SEO = ({ title, description, keywords }: SEOProps) => {
  useEffect(() => {
    // Set Document Title
    const fullTitle = `${title} | NoteStandard`;
    document.title = fullTitle;

    // Meta tags to update
    const metaTags = [
      { name: 'description', content: description },
      { name: 'keywords', content: keywords },
      { property: 'og:title', content: fullTitle },
      { property: 'og:description', content: description },
      { property: 'twitter:title', content: fullTitle },
      { property: 'twitter:description', content: description },
    ];

    metaTags.forEach(({ name, property, content }) => {
      if (!content) return;
      
      const selector = name ? `meta[name="${name}"]` : `meta[property="${property}"]`;
      let element = document.querySelector(selector);
      
      if (element) {
        element.setAttribute('content', content);
      } else {
        element = document.createElement('meta');
        if (name) element.setAttribute('name', name);
        if (property) element.setAttribute('property', property);
        element.setAttribute('content', content);
        document.head.appendChild(element);
      }
    });

    // Cleanup: Reset to global defaults if needed (optional)
    // For now, let's just keep the last set values.
  }, [title, description, keywords]);

  return null;
};
