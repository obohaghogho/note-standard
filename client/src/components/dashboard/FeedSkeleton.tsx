export const FeedSkeleton = () => (
    <div className="space-y-4">
        {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-white/5 bg-white/[0.02] p-5 animate-pulse">
                {/* Author row */}
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-9 h-9 rounded-full bg-white/10" />
                    <div className="space-y-1.5">
                        <div className="h-3 w-28 rounded bg-white/10" />
                        <div className="h-2.5 w-20 rounded bg-white/5" />
                    </div>
                </div>
                {/* Title */}
                <div className="h-5 w-3/4 rounded bg-white/10 mb-3" />
                {/* Content lines */}
                <div className="space-y-2 mb-4">
                    <div className="h-3 w-full rounded bg-white/5" />
                    <div className="h-3 w-5/6 rounded bg-white/5" />
                    <div className="h-3 w-2/3 rounded bg-white/5" />
                </div>
                {/* Tags */}
                <div className="flex gap-2 mb-4">
                    <div className="h-4 w-12 rounded-full bg-white/5" />
                    <div className="h-4 w-16 rounded-full bg-white/5" />
                    <div className="h-4 w-10 rounded-full bg-white/5" />
                </div>
                {/* Actions */}
                <div className="flex gap-4 pt-4 border-t border-white/5">
                    <div className="h-4 w-10 rounded bg-white/5" />
                    <div className="h-4 w-10 rounded bg-white/5" />
                </div>
            </div>
        ))}
    </div>
);
