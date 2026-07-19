import React, { useState, useEffect, useCallback } from 'react';
import axiosInstance from '../../api/axiosInstance';
import toast from 'react-hot-toast';

interface CurrencyRow {
  code: string;
  type: 'fiat' | 'crypto';
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  deposit_enabled: boolean;
  withdraw_enabled: boolean;
  transfer_enabled: boolean;
  buy_enabled: boolean;
  sell_enabled: boolean;
  swap_enabled: boolean;
  convert_enabled: boolean;
  provider?: string;
  updated_at?: string;
}

const CurrencyManagement: React.FC = () => {
  const [currencies, setCurrencies] = useState<CurrencyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<string>('');
  const [drafts, setDrafts] = useState<Record<string, Partial<CurrencyRow>>>({});
  const [savingRow, setSavingRow] = useState<string | null>(null);
  const [enablingInternational, setEnablingInternational] = useState(false);

  const fetchCurrencies = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await axiosInstance.get('/wallet/admin/currencies');
      setCurrencies(data.currencies || []);
      setSource(data.source || 'db');
      setDrafts({});
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to fetch currencies');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCurrencies();
  }, [fetchCurrencies]);

  const handleDraftChange = (code: string, field: keyof CurrencyRow, value: any) => {
    setDrafts(prev => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: value
      }
    }));
  };

  const handleSaveRow = async (code: string) => {
    const draft = drafts[code];
    if (!draft) return;
    
    setSavingRow(code);
    try {
      const { data } = await axiosInstance.patch(`/wallet/admin/currencies/${code}`, draft);
      toast.success(`${code} updated successfully`);
      
      // Update local state
      setCurrencies(prev => prev.map(c => c.code === code ? { ...c, ...data } : c));
      
      // Clear draft
      setDrafts(prev => {
        const newDrafts = { ...prev };
        delete newDrafts[code];
        return newDrafts;
      });
    } catch (error: any) {
      toast.error(error.response?.data?.error || `Failed to update ${code}`);
    } finally {
      setSavingRow(null);
    }
  };

  const handleEnableInternational = async () => {
    setEnablingInternational(true);
    const targetCodes = ['USD', 'EUR', 'GBP'];
    const payload = {
      status: 'active',
      deposit_enabled: true,
      withdraw_enabled: true,
      transfer_enabled: true,
      buy_enabled: true,
      sell_enabled: true,
      convert_enabled: true
    };
    
    try {
      await Promise.all(
        targetCodes.map(code => 
          axiosInstance.patch(`/wallet/admin/currencies/${code}`, payload)
        )
      );
      toast.success('International payments enabled successfully');
      await fetchCurrencies();
    } catch (error: any) {
      toast.error('Failed to enable international payments');
    } finally {
      setEnablingInternational(false);
    }
  };

  const fiatCurrencies = currencies.filter(c => c.type === 'fiat');
  const cryptoCurrencies = currencies.filter(c => c.type === 'crypto');

  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span style={styles.badgeActive}>Active</span>;
      case 'coming_soon':
        return <span style={styles.badgeComingSoon}>Coming Soon</span>;
      default:
        return <span style={styles.badgeDisabled}>Disabled</span>;
    }
  };

  const renderToggle = (label: string, field: keyof CurrencyRow, code: string, currency: CurrencyRow) => {
    const isDraft = drafts[code] && drafts[code][field] !== undefined;
    const value = isDraft ? drafts[code][field] : currency[field];
    
    return (
      <div style={styles.toggleContainer}>
        <span style={styles.toggleLabel}>{label}</span>
        <label style={styles.switch}>
          <input 
            type="checkbox" 
            className="currency-mgmt-switch-input"
            checked={!!value}
            onChange={(e) => handleDraftChange(code, field, e.target.checked)}
            style={styles.switchInput}
          />
          <span className="currency-mgmt-slider" style={{...styles.slider, backgroundColor: value ? '#10b981' : '#374151'}}></span>
        </label>
      </div>
    );
  };

  const renderRow = (c: CurrencyRow) => {
    const hasChanges = drafts[c.code] !== undefined && Object.keys(drafts[c.code] as object).length > 0;
    const isSaving = savingRow === c.code;

    return (
      <div key={c.code} style={styles.card}>
        <div style={styles.cardHeader}>
          <div style={styles.cardTitleArea}>
            <span style={styles.flag}>{c.flag}</span>
            <div style={styles.nameArea}>
              <h3 style={styles.codeText}>{c.code}</h3>
              <span style={styles.nameText}>{c.name}</span>
            </div>
          </div>
          <div style={styles.statusArea}>
            {renderStatusBadge((drafts[c.code]?.status as string) || c.status)}
            <select 
              style={styles.statusSelect}
              value={(drafts[c.code]?.status as string) || c.status}
              onChange={(e) => handleDraftChange(c.code, 'status', e.target.value)}
            >
              <option value="active">Active</option>
              <option value="coming_soon">Coming Soon</option>
              <option value="disabled">Disabled</option>
            </select>
            <button 
              style={{...styles.saveBtn, opacity: hasChanges && !isSaving ? 1 : 0.5}}
              disabled={!hasChanges || isSaving}
              onClick={() => handleSaveRow(c.code)}
            >
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
        
        <div style={styles.togglesGrid}>
          {renderToggle('Deposit', 'deposit_enabled', c.code, c)}
          {renderToggle('Withdraw', 'withdraw_enabled', c.code, c)}
          {renderToggle('Transfer', 'transfer_enabled', c.code, c)}
          {renderToggle('Buy', 'buy_enabled', c.code, c)}
          {renderToggle('Sell', 'sell_enabled', c.code, c)}
          {renderToggle('Swap', 'swap_enabled', c.code, c)}
          {renderToggle('Convert', 'convert_enabled', c.code, c)}
        </div>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Currency Management</h1>
          <p style={styles.pageSubtitle}>Manage wallet currencies, capabilities and status</p>
        </div>
        <div style={styles.headerActions}>
          <button 
            style={styles.internationalBtn}
            onClick={handleEnableInternational}
            disabled={enablingInternational}
          >
            {enablingInternational ? 'Enabling...' : '🌍 Enable International Payments'}
          </button>
          <button style={styles.refreshBtn} onClick={fetchCurrencies}>
            Refresh
          </button>
        </div>
      </div>

      {source === 'fallback' && (
        <div style={styles.warningBanner}>
          ⚠️ Warning: Database unavailable. Showing fallback static currency data. Changes will not be saved.
        </div>
      )}

      {loading ? (
        <div style={styles.loadingArea}>Loading currencies...</div>
      ) : (
        <div style={styles.content}>
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Fiat Currencies</h2>
            <div style={styles.grid}>
              {fiatCurrencies.map(renderRow)}
            </div>
          </div>
          
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>Crypto Currencies</h2>
            <div style={styles.grid}>
              {cryptoCurrencies.map(renderRow)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px',
    backgroundColor: '#0f172a',
    color: '#f8fafc',
    minHeight: '100%',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '32px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  pageTitle: {
    margin: 0,
    fontSize: '28px',
    fontWeight: 700,
    color: '#f1f5f9'
  },
  pageSubtitle: {
    margin: '8px 0 0',
    color: '#94a3b8',
    fontSize: '15px'
  },
  headerActions: {
    display: 'flex',
    gap: '12px'
  },
  internationalBtn: {
    backgroundColor: '#3b82f6',
    color: '#fff',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    fontWeight: 600,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.2)'
  },
  refreshBtn: {
    backgroundColor: '#1e293b',
    color: '#cbd5e1',
    border: '1px solid #334155',
    padding: '10px 16px',
    borderRadius: '8px',
    fontWeight: 500,
    cursor: 'pointer'
  },
  warningBanner: {
    backgroundColor: '#451a03',
    color: '#fde047',
    padding: '12px 16px',
    borderRadius: '8px',
    marginBottom: '24px',
    border: '1px solid #713f12',
    fontWeight: 500
  },
  loadingArea: {
    textAlign: 'center',
    padding: '48px',
    color: '#64748b',
    fontSize: '18px'
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: '40px'
  },
  section: {},
  sectionTitle: {
    margin: '0 0 20px',
    fontSize: '20px',
    fontWeight: 600,
    color: '#e2e8f0',
    borderBottom: '1px solid #1e293b',
    paddingBottom: '12px'
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px'
  },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: '12px',
    padding: '20px',
    border: '1px solid #334155',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  cardTitleArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  flag: {
    fontSize: '32px',
    lineHeight: 1
  },
  nameArea: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px'
  },
  codeText: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 700,
    color: '#f8fafc'
  },
  nameText: {
    color: '#94a3b8',
    fontSize: '14px'
  },
  statusArea: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  statusSelect: {
    backgroundColor: '#0f172a',
    color: '#e2e8f0',
    border: '1px solid #334155',
    padding: '6px 12px',
    borderRadius: '6px',
    outline: 'none',
    cursor: 'pointer'
  },
  saveBtn: {
    backgroundColor: '#10b981',
    color: '#fff',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '6px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'opacity 0.2s'
  },
  togglesGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
    backgroundColor: '#0f172a',
    padding: '16px',
    borderRadius: '8px'
  },
  toggleContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: '80px'
  },
  toggleLabel: {
    fontSize: '13px',
    color: '#94a3b8',
    fontWeight: 500
  },
  badgeActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    color: '#10b981',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid rgba(16, 185, 129, 0.2)'
  },
  badgeComingSoon: {
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    color: '#f59e0b',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid rgba(245, 158, 11, 0.2)'
  },
  badgeDisabled: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    color: '#ef4444',
    padding: '4px 10px',
    borderRadius: '9999px',
    fontSize: '12px',
    fontWeight: 600,
    border: '1px solid rgba(239, 68, 68, 0.2)'
  },
  switch: {
    position: 'relative',
    display: 'inline-block',
    width: '40px',
    height: '24px',
    cursor: 'pointer'
  },
  switchInput: {
    opacity: 0,
    width: 0,
    height: 0
  },
  slider: {
    position: 'absolute',
    cursor: 'pointer',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: '24px',
    transition: '0.4s',
    border: '2px solid transparent',
  }
};

// Add a little global CSS to style the slider thumb
const injectCSS = () => {
  if (typeof document !== 'undefined') {
    const styleId = 'currency-management-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.innerHTML = `
        .currency-mgmt-switch-input:checked + .currency-mgmt-slider:before {
          transform: translateX(16px);
        }
        .currency-mgmt-slider:before {
          position: absolute;
          content: "";
          height: 20px;
          width: 20px;
          left: 0px;
          bottom: 0px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }
      `;
      document.head.appendChild(style);
    }
  }
};

// Run CSS injection
injectCSS();

// Need to update the switch JSX slightly to use these classes
export default function WrappedCurrencyManagement() {
  return <CurrencyManagement />;
}

// Adjust the toggle render function internally in CurrencyManagement to apply the classes:
// <input className="currency-mgmt-switch-input" ... />
// <span className="currency-mgmt-slider" ...></span>
