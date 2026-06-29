import React, { useState, useEffect } from 'react';
import { Award, CheckCircle, ExternalLink, ShieldCheck, Download } from 'lucide-react';
import { api } from '../../lib/api';

interface Certificate {
  certificate_token: string;
  learner_name: string;
  path_title: string;
  creator_name: string;
  space_name: string;
  issued_at: string;
  completion_pct: number;
}

export const CertificateViewer = ({ token }: { token: string }) => {
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCert = async () => {
      try {
        const res = await api.get(`/community/certificates/verify/${token}`);
        if (res.data.valid) {
          setCert(res.data.certificate);
        } else {
          setError(res.data.reason || 'Invalid certificate.');
        }
      } catch {
        setError('Error verifying certificate.');
      } finally {
        setLoading(false);
      }
    };
    if (token) fetchCert();
  }, [token]);

  if (loading) return <div className="p-12 text-center text-muted">Verifying certificate...</div>;
  if (error || !cert) return (
    <div className="max-w-md mx-auto mt-12 bg-surface border border-border rounded-card p-8 text-center shadow-sm">
      <div className="text-4xl mb-4">⚠️</div>
      <h2 className="text-xl font-bold text-heading mb-2">Verification Failed</h2>
      <p className="text-sm text-muted">{error}</p>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto mt-8 mb-12">
      {/* Verification Banner */}
      <div className="bg-success/10 border border-success/20 rounded-xl p-4 mb-6 flex items-center justify-between text-success">
        <div className="flex items-center gap-2 font-bold text-sm">
          <ShieldCheck size={18} /> Official NoteStandard Certificate
        </div>
        <div className="text-xs opacity-80">
          ID: {cert.certificate_token.substring(0,12).toUpperCase()}
        </div>
      </div>

      {/* Certificate Card */}
      <div className="relative bg-surface border border-border rounded-2xl shadow-xl overflow-hidden aspect-[1.414/1] flex flex-col items-center justify-center p-12 text-center">
        {/* Background Decorations */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-primary via-blue-500 to-primary" />
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at center, #000 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
        
        <Award size={64} className="text-primary mb-6" strokeWidth={1.5} />
        
        <div className="uppercase tracking-widest text-xs font-bold text-muted mb-2">Certificate of Completion</div>
        <h2 className="text-4xl font-extrabold text-heading mb-8 font-serif italic">
          {cert.learner_name}
        </h2>
        
        <p className="text-sm text-body mb-2">has successfully completed the learning path</p>
        <h3 className="text-2xl font-bold text-primary mb-8 leading-tight">
          {cert.path_title}
        </h3>
        
        <div className="grid grid-cols-2 gap-12 w-full max-w-md mt-auto pt-8 border-t border-border">
          <div>
            <div className="text-xs text-muted mb-1 uppercase tracking-wider">Issued By</div>
            <div className="font-bold text-sm text-heading">{cert.creator_name}</div>
            <div className="text-xs text-muted">{cert.space_name}</div>
          </div>
          <div>
            <div className="text-xs text-muted mb-1 uppercase tracking-wider">Date</div>
            <div className="font-bold text-sm text-heading">{new Date(cert.issued_at).toLocaleDateString()}</div>
            <div className="text-xs text-success font-medium">Score: {cert.completion_pct}%</div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex justify-center gap-4">
        <button className="bg-primary text-white hover:bg-primary-hover px-6 py-2.5 rounded-button font-bold text-sm flex items-center gap-2 transition-colors">
          <Download size={16}/> Download PDF
        </button>
        <button className="bg-elevated border border-border text-heading hover:bg-border px-6 py-2.5 rounded-button font-bold text-sm flex items-center gap-2 transition-colors">
          <ExternalLink size={16}/> Copy Link
        </button>
      </div>
    </div>
  );
};
