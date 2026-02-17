import { ExternalLink } from 'lucide-react';
import { Card } from '../common/Card';
import SecureImage from '../common/SecureImage';
import { Link } from 'react-router-dom';

interface AdCardProps {
    ad: {
        title: string;
        content: string;
        image_url?: string;
        link_url?: string;
        destination_url?: string;
        media_url?: string;
    };
    compact?: boolean;
}

export const AdCard = ({ ad, compact = false }: AdCardProps) => {
    const targetUrl = ad.destination_url || ad.link_url || '#';
    const imageUrl = ad.media_url || ad.image_url;
    const isInternal = targetUrl.startsWith('/');

    return (
        <Card variant="glass" className={`overflow-hidden border border-primary/20 hover:border-primary/40 transition-colors ${compact ? 'p-3' : 'p-4'}`}>
            <div className="flex flex-col gap-3">
                {imageUrl && (
                    <SecureImage
                        src={imageUrl}
                        alt={ad.title}
                        className="w-full h-32 object-cover rounded-lg"
                    />
                )}

                <div>
                    <div className="flex items-start justify-between gap-2">
                        <h3 className={`font-semibold text-white ${compact ? 'text-sm' : 'text-base'}`}>
                            {ad.title}
                        </h3>
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 border border-gray-700 px-1 rounded">
                            Ad
                        </span>
                    </div>

                    <p className={`text-gray-400 mt-1 line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>
                        {ad.content}
                    </p>
                </div>

                {targetUrl && (
                    isInternal ? (
                        <Link
                            to={targetUrl}
                            className="text-primary hover:text-primary/80 text-xs flex items-center gap-1 font-medium mt-auto pt-2"
                        >
                            Learn More <ExternalLink size={12} />
                        </Link>
                    ) : (
                        <a
                            href={targetUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:text-primary/80 text-xs flex items-center gap-1 font-medium mt-auto pt-2"
                        >
                            Learn More <ExternalLink size={12} />
                        </a>
                    )
                )}
            </div>
        </Card>
    );
};
