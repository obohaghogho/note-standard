import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

interface SEOProps {
  title: string;
  description?: string;
  keywords?: string;
}

export const SEO = ({ title, description, keywords }: SEOProps) => {
  const location = useLocation();

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

    // Update canonical URL
    const canonicalUrl = `https://notestandard.com${location.pathname === '/' ? '' : location.pathname}`;
    let canonicalLink = document.querySelector('link[rel="canonical"]');
    if (canonicalLink) {
      canonicalLink.setAttribute('href', canonicalUrl);
    } else {
      canonicalLink = document.createElement('link');
      canonicalLink.setAttribute('rel', 'canonical');
      canonicalLink.setAttribute('href', canonicalUrl);
      document.head.appendChild(canonicalLink);
    }

  }, [title, description, keywords, location.pathname]);

  return null;
};
