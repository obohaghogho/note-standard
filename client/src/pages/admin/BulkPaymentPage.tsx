import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { bulkTransferService, PayoutBatch, PayoutBatchItem } from '../../services/bulkTransferService';
import { toast } from 'react-hot-toast';
import {
  Send,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  ShieldCheck,
  FileText,
  Upload,
  User,
  DollarSign,
  ChevronRight,
  Eye,
  Play,
  Check,
  X,
  ShieldAlert,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import './BulkPaymentPage.css';

interface RecipientRow {
  recipient_identifier: string;
  amount: string;
  item_index: number;
}

export const BulkPaymentPage: React.FC = () => {
  const { session, user } = useAuth();
  const token = session?.access_token || '';

  // State: List & Filters
  const [batches, setBatches] = useState<PayoutBatch[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [currencyFilter, setCurrencyFilter] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // State: Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isReviewExecuteModalOpen, setIsReviewExecuteModalOpen] = useState(false);

  // Selected Batch for View or Execution
  const [selectedBatch, setSelectedBatch] = useState<PayoutBatch | null>(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState<PayoutBatchItem[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Create Batch Form Wizard State
  const [createStep, setCreateStep] = useState<'FORM' | 'PREVIEW'>('FORM');
  const [sourceWalletId, setSourceWalletId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [idempotencyKeyInput, setIdempotencyKeyInput] = useState('');
  const [recipientRows, setRecipientRows] = useState<RecipientRow[]>([
    { recipient_identifier: '', amount: '', item_index: 0 },
    { recipient_identifier: '', amount: '', item_index: 1 },
  ]);

  // Load Batches
  const fetchBatches = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await bulkTransferService.getBatches(token, {
        page,
        limit: 15,
        status: statusFilter || undefined,
        currency: currencyFilter || undefined,
      });
      setBatches(res.batches || []);
      setTotalCount(res.total || 0);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load bulk payment batches');
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter, currencyFilter]);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  // Handle Detail Modal View
  const handleViewDetail = async (batch: PayoutBatch) => {
    setSelectedBatch(batch);
    setIsDetailModalOpen(true);
    setLoadingDetail(true);
    try {
      const res = await bulkTransferService.getBatchDetail(token, batch.id);
      setSelectedBatch(res.batch);
      setSelectedBatchItems(res.items || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch batch items');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Open Execution Review Modal
  const handleOpenExecuteReview = async (batch: PayoutBatch) => {
    setSelectedBatch(batch);
    setIsReviewExecuteModalOpen(true);
    setLoadingDetail(true);
    try {
      const res = await bulkTransferService.getBatchDetail(token, batch.id);
      setSelectedBatch(res.batch);
      setSelectedBatchItems(res.items || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to fetch batch items for review');
    } finally {
      setLoadingDetail(false);
    }
  };

  // Confirm & Execute Batch
  const handleConfirmExecute = async () => {
    if (!selectedBatch || !token) return;
    setActionLoading(true);
    try {
      // API call sends ONLY the batch ID in the URL path.
      // Body payload is intentionally empty so execution financial logic remains 100% backend-authoritative.
      const res = await bulkTransferService.executeBatch(token, selectedBatch.id);
      toast.success(res.message || `Batch ${selectedBatch.batch_reference} executed successfully!`);
      setIsReviewExecuteModalOpen(false);
      fetchBatches();
    } catch (err: any) {
      toast.error(err.message || 'Execution failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Approve Batch
  const handleApprove = async (batchId: string) => {
    if (!token) return;
    setActionLoading(true);
    try {
      await bulkTransferService.approveBatch(token, batchId);
      toast.success('Batch approved successfully');
      fetchBatches();
    } catch (err: any) {
      toast.error(err.message || 'Approval failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Reconcile Batch (EXECUTING recovery)
  const handleReconcile = async (batchId: string) => {
    if (!token) return;
    setActionLoading(true);
    try {
      const res = await bulkTransferService.reconcileBatch(token, batchId);
      toast.success(res.message || 'Batch reconciled');
      fetchBatches();
    } catch (err: any) {
      toast.error(err.message || 'Reconciliation failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Cancel Batch
  const handleCancel = async (batchId: string) => {
    if (!token) return;
    if (!window.confirm('Are you sure you want to cancel this bulk payment batch?')) return;
    setActionLoading(true);
    try {
      await bulkTransferService.cancelBatch(token, batchId);
      toast.success('Batch cancelled');
      fetchBatches();
    } catch (err: any) {
      toast.error(err.message || 'Cancellation failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Add Dynamic Recipient Row
  const handleAddRecipientRow = () => {
    setRecipientRows((prev) => [
      ...prev,
      { recipient_identifier: '', amount: '', item_index: prev.length },
    ]);
  };

  // Remove Recipient Row
  const handleRemoveRecipientRow = (index: number) => {
    if (recipientRows.length <= 1) {
      toast.error('Batch must have at least one recipient');
      return;
    }
    const updated = recipientRows.filter((_, i) => i !== index).map((row, idx) => ({ ...row, item_index: idx }));
    setRecipientRows(updated);
  };

  // CSV File Upload Parser
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;

      const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const parsedRows: RecipientRow[] = [];

      lines.forEach((line, idx) => {
        // Skip header if line contains 'identifier' or 'recipient'
        if (idx === 0 && (line.toLowerCase().includes('identifier') || line.toLowerCase().includes('email'))) {
          return;
        }
        const parts = line.split(',').map((p) => p.trim());
        if (parts.length >= 2) {
          const ident = parts[0];
          const amt = parts[1];
          if (ident && !isNaN(parseFloat(amt))) {
            parsedRows.push({
              recipient_identifier: ident,
              amount: amt,
              item_index: parsedRows.length,
            });
          }
        }
      });

      if (parsedRows.length > 0) {
        setRecipientRows(parsedRows);
        toast.success(`Imported ${parsedRows.length} recipients from CSV file`);
      } else {
        toast.error('No valid recipient rows found in CSV. Format: identifier,amount');
      }
    };
    reader.readAsText(file);
  };

  // Create Form Pre-validation & Preview Transition
  const handleProceedToPreview = () => {
    if (!sourceWalletId.trim()) {
      toast.error('Source wallet ID is required');
      return;
    }
    if (!currency.trim()) {
      toast.error('Currency is required');
      return;
    }

    // Validate rows
    const seenIdents = new Set<string>();
    for (let i = 0; i < recipientRows.length; i++) {
      const r = recipientRows[i];
      if (!r.recipient_identifier.trim()) {
        toast.error(`Row #${i + 1}: Recipient identifier is required`);
        return;
      }
      const numAmt = parseFloat(r.amount);
      if (isNaN(numAmt) || numAmt <= 0) {
        toast.error(`Row #${i + 1}: Amount must be a positive number`);
        return;
      }
      const cleanIdent = r.recipient_identifier.trim().toLowerCase();
      if (seenIdents.has(cleanIdent)) {
        toast.error(`Duplicate recipient identifier "${r.recipient_identifier}" across rows`);
        return;
      }
      seenIdents.add(cleanIdent);
    }

    setCreateStep('PREVIEW');
  };

  // Submit Create Batch Payload to API
  const handleCreateBatchSubmit = async () => {
    if (!token) return;
    setActionLoading(true);

    try {
      const entries = recipientRows.map((r, idx) => ({
        recipient_identifier: r.recipient_identifier.trim(),
        amount: parseFloat(r.amount),
        item_index: idx,
      }));

      const res = await bulkTransferService.createBatch(token, {
        source_wallet_id: sourceWalletId.trim(),
        currency: currency.trim().toUpperCase(),
        idempotency_key: idempotencyKeyInput.trim() || undefined,
        entries,
      });

      toast.success(
        res.is_retry
          ? `Idempotent Retry: Loaded existing batch ${res.batch.batch_reference}`
          : `Payout Batch ${res.batch.batch_reference} created and submitted for approval!`
      );
      setIsCreateModalOpen(false);
      setCreateStep('FORM');
      fetchBatches();
    } catch (err: any) {
      toast.error(err.message || 'Batch creation failed');
    } finally {
      setActionLoading(false);
    }
  };

  // Computed Totals for Preview
  const computedTotalAmount = recipientRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

  return (
    <div className="bulk-payment-container">
      {/* Header */}
      <div className="bulk-header">
        <div className="bulk-header-title">
          <h1>
            <Send className="text-emerald-400" size={28} />
            Internal Bulk Payments
          </h1>
          <p>Create, approve, and execute multi-user internal wallet payout batches</p>
        </div>
        <div className="bulk-header-actions">
          <button className="btn-secondary" onClick={fetchBatches} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setCreateStep('FORM');
              setIsCreateModalOpen(true);
            }}
          >
            <Plus size={18} />
            New Bulk Payout
          </button>
        </div>
      </div>

      {/* Stats Summary Bar */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon green">
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-info">
            <h3>{batches.filter((b) => b.status === 'COMPLETED').length}</h3>
            <p>Completed Batches</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon amber">
            <Clock size={22} />
          </div>
          <div className="stat-info">
            <h3>{batches.filter((b) => b.status === 'PENDING_APPROVAL').length}</h3>
            <p>Pending Approval</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <ShieldCheck size={22} />
          </div>
          <div className="stat-info">
            <h3>{batches.filter((b) => b.status === 'APPROVED').length}</h3>
            <p>Approved (Ready to Execute)</p>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            <FileText size={22} />
          </div>
          <div className="stat-info">
            <h3>{totalCount}</h3>
            <p>Total Batches</p>
          </div>
        </div>
      </div>

      {/* Main Table Glass Panel */}
      <div className="glass-panel">
        <div className="filter-bar">
          <SlidersHorizontal size={18} className="text-gray-400" />
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Statuses</option>
            <option value="PENDING_APPROVAL">Pending Approval</option>
            <option value="APPROVED">Approved</option>
            <option value="EXECUTING">Executing</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
          </select>

          <select
            className="filter-select"
            value={currencyFilter}
            onChange={(e) => {
              setCurrencyFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Currencies</option>
            <option value="USD">USD</option>
            <option value="NGN">NGN</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        {/* Batches Table */}
        <div className="table-responsive">
          <table className="bulk-table">
            <thead>
              <tr>
                <th>Batch Ref</th>
                <th>Status</th>
                <th>Currency</th>
                <th>Recipients</th>
                <th>Total Amount</th>
                <th>Created By</th>
                <th>Approved By</th>
                <th>Created At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {batches.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#9ca3af' }}>
                    {loading ? 'Loading payout batches...' : 'No bulk payment batches found.'}
                  </td>
                </tr>
              ) : (
                batches.map((batch) => {
                  const isCreator = user?.id === batch.created_by;

                  return (
                    <tr key={batch.id}>
                      <td style={{ fontWeight: 700, color: '#ffffff' }}>{batch.batch_reference}</td>
                      <td>
                        <span className={`status-badge ${batch.status}`}>{batch.status}</span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{batch.currency}</td>
                      <td style={{ fontWeight: 600 }}>{batch.recipient_count}</td>
                      <td style={{ fontWeight: 700, color: '#34d399' }}>
                        {batch.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {batch.currency}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                        {batch.created_by ? `${batch.created_by.substring(0, 8)}...` : 'System'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                        {batch.approved_by ? `${batch.approved_by.substring(0, 8)}...` : '-'}
                      </td>
                      <td style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                        {new Date(batch.created_at).toLocaleString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                          <button
                            className="btn-secondary"
                            style={{ padding: '0.4rem 0.6rem', fontSize: '0.75rem' }}
                            onClick={() => handleViewDetail(batch)}
                            title="View Details"
                          >
                            <Eye size={14} />
                          </button>

                          {/* Approval Guard */}
                          {batch.status === 'PENDING_APPROVAL' && (
                            <button
                              className={`btn-approve ${isCreator ? 'btn-disabled' : ''}`}
                              disabled={isCreator || actionLoading}
                              onClick={() => !isCreator && handleApprove(batch.id)}
                              title={
                                isCreator
                                  ? 'Creator cannot approve own batch (Dual Authorization Required)'
                                  : 'Approve Batch'
                              }
                            >
                              <Check size={14} /> Approve
                            </button>
                          )}

                          {/* Execute Button opens Prominent Review Modal */}
                          {batch.status === 'APPROVED' && (
                            <button
                              className="btn-execute"
                              disabled={actionLoading}
                              onClick={() => handleOpenExecuteReview(batch)}
                              title="Review & Execute Batch"
                            >
                              <Play size={14} /> Execute
                            </button>
                          )}

                          {/* Reconcile Button for EXECUTING state */}
                          {batch.status === 'EXECUTING' && (
                            <button
                              className="btn-reconcile"
                              disabled={actionLoading}
                              onClick={() => handleReconcile(batch.id)}
                              title="Reconcile Executing Batch"
                            >
                              <RefreshCw size={14} /> Reconcile
                            </button>
                          )}

                          {/* Cancel Button */}
                          {['PENDING_APPROVAL', 'APPROVED'].includes(batch.status) && (
                            <button
                              className="btn-cancel"
                              disabled={actionLoading}
                              onClick={() => handleCancel(batch.id)}
                              title="Cancel Batch"
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE BATCH MODAL (Wizard Flow) */}
      {isCreateModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>
                {createStep === 'FORM' ? 'Create Bulk Internal Payout' : 'Validation & Authoritative Preview'}
              </h2>
              <button className="close-btn" onClick={() => setIsCreateModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            {createStep === 'FORM' ? (
              <div>
                <div className="form-group">
                  <label>Source Wallet ID (Admin Treasury / Liquidity Wallet)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. 2b279341-a96e-46f0-951b-bc0ca7ae366e"
                    value={sourceWalletId}
                    onChange={(e) => setSourceWalletId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Currency</label>
                  <select
                    className="form-control"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  >
                    <option value="USD">USD - US Dollar</option>
                    <option value="NGN">NGN - Nigerian Naira</option>
                    <option value="EUR">EUR - Euro</option>
                    <option value="GBP">GBP - British Pound</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Optional Client Idempotency Key</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="e.g. batch_payroll_sept_2026"
                    value={idempotencyKeyInput}
                    onChange={(e) => setIdempotencyKeyInput(e.target.value)}
                  />
                </div>

                {/* CSV File Upload Section */}
                <div className="form-group">
                  <label>Import Recipients via CSV File</label>
                  <label className="upload-area">
                    <Upload size={24} className="mx-auto text-emerald-400" />
                    <p>Click to select or drag a CSV file (format: <code>identifier,amount</code>)</p>
                    <input type="file" accept=".csv,.txt" onChange={handleFileUpload} style={{ display: 'none' }} />
                  </label>
                </div>

                {/* Recipient Rows Section */}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, color: '#d1d5db', marginBottom: '0.5rem' }}>
                    Recipient Payout List ({recipientRows.length} items)
                  </label>
                  {recipientRows.map((row, idx) => (
                    <div key={idx} className="recipient-row">
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Username, Email, or User UUID"
                        value={row.recipient_identifier}
                        onChange={(e) => {
                          const updated = [...recipientRows];
                          updated[idx].recipient_identifier = e.target.value;
                          setRecipientRows(updated);
                        }}
                      />
                      <input
                        type="number"
                        step="0.01"
                        className="form-control"
                        style={{ width: '140px' }}
                        placeholder="Amount"
                        value={row.amount}
                        onChange={(e) => {
                          const updated = [...recipientRows];
                          updated[idx].amount = e.target.value;
                          setRecipientRows(updated);
                        }}
                      />
                      <button
                        type="button"
                        className="remove-row-btn"
                        onClick={() => handleRemoveRecipientRow(idx)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: '0.5rem', width: '100%', justifyContent: 'center' }}
                    onClick={handleAddRecipientRow}
                  >
                    <Plus size={16} /> Add Recipient Row
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
                  <button className="btn-secondary" onClick={() => setIsCreateModalOpen(false)}>
                    Cancel
                  </button>
                  <button className="btn-primary" onClick={handleProceedToPreview}>
                    Preview & Validate <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            ) : (
              /* PREVIEW SCREEN */
              <div>
                <div className="review-callout">
                  <ShieldCheck className="review-callout-icon" size={24} />
                  <div className="review-callout-text">
                    <h4>Pre-Submission Server Validation Check</h4>
                    <p>
                      The summary below reflects calculated payload values. On submission, the backend will atomically
                      validate identities, resolve wallets, and insert header + item rows in a single RPC transaction.
                    </p>
                  </div>
                </div>

                <div className="spec-grid">
                  <div className="spec-item">
                    <label>Source Wallet</label>
                    <span style={{ fontSize: '0.85rem' }}>{sourceWalletId}</span>
                  </div>
                  <div className="spec-item">
                    <label>Currency</label>
                    <span>{currency}</span>
                  </div>
                  <div className="spec-item">
                    <label>Total Recipients</label>
                    <span>{recipientRows.length} users</span>
                  </div>
                  <div className="spec-item">
                    <label>Total Payout Amount</label>
                    <span style={{ color: '#34d399' }}>
                      {computedTotalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currency}
                    </span>
                  </div>
                </div>

                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem' }}>
                    Recipient Payout Items Summary
                  </label>
                  <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '0.5rem', padding: '0.75rem' }}>
                    {recipientRows.map((r, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          fontSize: '0.8125rem',
                          padding: '0.35rem 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}
                      >
                        <span>
                          #{idx + 1} — <strong>{r.recipient_identifier}</strong>
                        </span>
                        <span style={{ color: '#34d399', fontWeight: 700 }}>
                          {parseFloat(r.amount || '0').toFixed(2)} {currency}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1.5rem' }}>
                  <button className="btn-secondary" onClick={() => setCreateStep('FORM')}>
                    Back to Edit
                  </button>
                  <button className="btn-primary" disabled={actionLoading} onClick={handleCreateBatchSubmit}>
                    {actionLoading ? 'Creating Batch...' : 'Submit Batch for Approval'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PROMINENT EXECUTION REVIEW MODAL (Before Execution Gate) */}
      {isReviewExecuteModalOpen && selectedBatch && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f59e0b' }}>
                <AlertTriangle size={24} /> Review & Confirm Financial Execution
              </h2>
              <button className="close-btn" onClick={() => setIsReviewExecuteModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="review-callout danger">
              <ShieldAlert className="review-callout-icon" size={26} />
              <div className="review-callout-text">
                <h4>Irreversible Financial Mutation Warning</h4>
                <p>
                  You are about to execute a live bulk internal payment. This operation will debits the source wallet
                  and atomically credit recipient user wallets. The request sends <strong>only the batch ID</strong>;
                  financial calculations and amounts are authoritatively loaded from persisted database records.
                </p>
              </div>
            </div>

            <div className="spec-grid">
              <div className="spec-item">
                <label>Batch Reference</label>
                <span>{selectedBatch.batch_reference}</span>
              </div>
              <div className="spec-item">
                <label>Status</label>
                <span className={`status-badge ${selectedBatch.status}`}>{selectedBatch.status}</span>
              </div>
              <div className="spec-item">
                <label>Source Wallet ID</label>
                <span style={{ fontSize: '0.85rem' }}>{selectedBatch.source_wallet_id}</span>
              </div>
              <div className="spec-item">
                <label>Total Batch Amount</label>
                <span style={{ color: '#34d399', fontSize: '1.3rem' }}>
                  {selectedBatch.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })} {selectedBatch.currency}
                </span>
              </div>
              <div className="spec-item">
                <label>Approved By Admin</label>
                <span style={{ fontSize: '0.85rem' }}>{selectedBatch.approved_by || 'N/A'}</span>
              </div>
              <div className="spec-item">
                <label>Approval Timestamp</label>
                <span style={{ fontSize: '0.85rem' }}>
                  {selectedBatch.approved_at ? new Date(selectedBatch.approved_at).toLocaleString() : 'N/A'}
                </span>
              </div>
            </div>

            {/* Itemized Recipient Breakdown */}
            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.5rem', color: '#d1d5db' }}>
                Itemized Recipient Breakdown ({selectedBatchItems.length} items)
              </label>
              {loadingDetail ? (
                <p style={{ color: '#9ca3af', fontSize: '0.875rem' }}>Loading batch items...</p>
              ) : (
                <div style={{ maxHeight: '220px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem', padding: '0.5rem' }}>
                  <table className="bulk-table" style={{ fontSize: '0.8125rem' }}>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Recipient User ID</th>
                        <th>Wallet ID</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBatchItems.map((item) => (
                        <tr key={item.id}>
                          <td>#{item.item_index + 1}</td>
                          <td>{item.recipient_user_id}</td>
                          <td style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{item.recipient_wallet_id}</td>
                          <td style={{ fontWeight: 700, color: '#34d399' }}>
                            {item.amount} {item.currency}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.5rem' }}>
              <button
                className="btn-secondary"
                disabled={actionLoading}
                onClick={() => setIsReviewExecuteModalOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn-execute"
                disabled={actionLoading}
                style={{ padding: '0.75rem 1.5rem', fontSize: '0.9375rem' }}
                onClick={handleConfirmExecute}
              >
                {actionLoading ? 'Executing via Ledger RPC...' : 'Confirm & Execute Financial Mutation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DETAIL MODAL */}
      {isDetailModalOpen && selectedBatch && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '780px' }}>
            <div className="modal-header">
              <h2>Batch Details — {selectedBatch.batch_reference}</h2>
              <button className="close-btn" onClick={() => setIsDetailModalOpen(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="spec-grid">
              <div className="spec-item">
                <label>Batch ID</label>
                <span style={{ fontSize: '0.8rem' }}>{selectedBatch.id}</span>
              </div>
              <div className="spec-item">
                <label>Status</label>
                <span className={`status-badge ${selectedBatch.status}`}>{selectedBatch.status}</span>
              </div>
              <div className="spec-item">
                <label>Total Amount</label>
                <span style={{ color: '#34d399' }}>
                  {selectedBatch.total_amount} {selectedBatch.currency}
                </span>
              </div>
              <div className="spec-item">
                <label>Ledger Transaction ID</label>
                <span style={{ fontSize: '0.8rem', color: '#60a5fa' }}>
                  {selectedBatch.ledger_transaction_id || 'Not Executed Yet'}
                </span>
              </div>
            </div>

            {selectedBatch.failure_reason && (
              <div className="review-callout danger">
                <XCircle className="review-callout-icon" size={24} />
                <div className="review-callout-text">
                  <h4>Failure Reason</h4>
                  <p>{selectedBatch.failure_reason}</p>
                </div>
              </div>
            )}

            <div style={{ marginBottom: '1.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                Batch Items ({selectedBatchItems.length})
              </h3>
              {loadingDetail ? (
                <p style={{ color: '#9ca3af' }}>Loading items...</p>
              ) : (
                <div style={{ maxHeight: '250px', overflowY: 'auto', background: 'rgba(0,0,0,0.3)', borderRadius: '0.75rem' }}>
                  <table className="bulk-table" style={{ fontSize: '0.8125rem' }}>
                    <thead>
                      <tr>
                        <th>Index</th>
                        <th>Recipient User ID</th>
                        <th>Recipient Wallet ID</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedBatchItems.map((item) => (
                        <tr key={item.id}>
                          <td>#{item.item_index + 1}</td>
                          <td>{item.recipient_user_id}</td>
                          <td style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{item.recipient_wallet_id}</td>
                          <td style={{ fontWeight: 700, color: '#34d399' }}>
                            {item.amount} {item.currency}
                          </td>
                          <td>
                            <span className={`status-badge ${item.status}`}>{item.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setIsDetailModalOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BulkPaymentPage;
