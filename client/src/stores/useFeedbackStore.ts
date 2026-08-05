import { create } from 'zustand';
import type { 
  FeedbackReport, 
  FeedbackCategoryType, 
  PriorityLevel, 
  IssueStatus,
  AnalyticsSummary,
  BetaTester
} from '../types/feedback';

interface FeedbackStoreState {
  reports: FeedbackReport[];
  selectedReport: FeedbackReport | null;
  userReports: FeedbackReport[];
  analytics: AnalyticsSummary | null;
  betaTesters: BetaTester[];
  
  isLoading: boolean;
  isSubmitting: boolean;
  error: string | null;
  
  // Filters
  categoryFilter: FeedbackCategoryType | 'all';
  priorityFilter: PriorityLevel | 'all';
  statusFilter: IssueStatus | 'all';
  searchQuery: string;

  // Actions
  setReports: (reports: FeedbackReport[]) => void;
  setSelectedReport: (report: FeedbackReport | null) => void;
  setUserReports: (reports: FeedbackReport[]) => void;
  setAnalytics: (analytics: AnalyticsSummary | null) => void;
  setBetaTesters: (testers: BetaTester[]) => void;
  
  setCategoryFilter: (category: FeedbackCategoryType | 'all') => void;
  setPriorityFilter: (priority: PriorityLevel | 'all') => void;
  setStatusFilter: (status: IssueStatus | 'all') => void;
  setSearchQuery: (query: string) => void;
  
  updateReportStatusLocally: (id: string, newStatus: IssueStatus) => void;
  updateReportAssigneeLocally: (id: string, assigneeId: string | null, assigneeProfile?: any) => void;
  addCommentLocally: (reportId: string, comment: any) => void;
  toggleVoteLocally: (reportId: string) => void;
}

export const useFeedbackStore = create<FeedbackStoreState>((set) => ({
  reports: [],
  selectedReport: null,
  userReports: [],
  analytics: null,
  betaTesters: [],
  
  isLoading: false,
  isSubmitting: false,
  error: null,

  categoryFilter: 'all',
  priorityFilter: 'all',
  statusFilter: 'all',
  searchQuery: '',

  setReports: (reports) => set({ reports }),
  setSelectedReport: (report) => set({ selectedReport: report }),
  setUserReports: (userReports) => set({ userReports }),
  setAnalytics: (analytics) => set({ analytics }),
  setBetaTesters: (betaTesters) => set({ betaTesters }),

  setCategoryFilter: (categoryFilter) => set({ categoryFilter }),
  setPriorityFilter: (priorityFilter) => set({ priorityFilter }),
  setStatusFilter: (statusFilter) => set({ statusFilter }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  updateReportStatusLocally: (id, newStatus) =>
    set((state) => ({
      reports: state.reports.map((r) => (r.id === id ? { ...r, status: newStatus } : r)),
      userReports: state.userReports.map((r) => (r.id === id ? { ...r, status: newStatus } : r)),
      selectedReport: state.selectedReport?.id === id ? { ...state.selectedReport, status: newStatus } : state.selectedReport,
    })),

  updateReportAssigneeLocally: (id, assigneeId, assigneeProfile) =>
    set((state) => ({
      reports: state.reports.map((r) =>
        r.id === id ? { ...r, assignedTo: assigneeId, assigneeProfile } : r
      ),
      selectedReport:
        state.selectedReport?.id === id
          ? { ...state.selectedReport, assignedTo: assigneeId, assigneeProfile }
          : state.selectedReport,
    })),

  addCommentLocally: (reportId, comment) =>
    set((state) => ({
      reports: state.reports.map((r) =>
        r.id === reportId ? { ...r, comments: [...(r.comments || []), comment] } : r
      ),
      selectedReport:
        state.selectedReport?.id === reportId
          ? { ...state.selectedReport, comments: [...(state.selectedReport.comments || []), comment] }
          : state.selectedReport,
    })),

  toggleVoteLocally: (reportId) =>
    set((state) => ({
      reports: state.reports.map((r) => {
        if (r.id !== reportId) return r;
        const newVoted = !r.hasVoted;
        return {
          ...r,
          hasVoted: newVoted,
          voteCount: newVoted ? r.voteCount + 1 : Math.max(0, r.voteCount - 1),
        };
      }),
      userReports: state.userReports.map((r) => {
        if (r.id !== reportId) return r;
        const newVoted = !r.hasVoted;
        return {
          ...r,
          hasVoted: newVoted,
          voteCount: newVoted ? r.voteCount + 1 : Math.max(0, r.voteCount - 1),
        };
      }),
      selectedReport:
        state.selectedReport?.id === reportId
          ? {
              ...state.selectedReport,
              hasVoted: !state.selectedReport.hasVoted,
              voteCount: !state.selectedReport.hasVoted
                ? state.selectedReport.voteCount + 1
                : Math.max(0, state.selectedReport.voteCount - 1),
            }
          : state.selectedReport,
    })),
}));
