export type FeedbackCategoryType =
  | 'bug_report'
  | 'feature_request'
  | 'improvement'
  | 'general'
  | 'performance'
  | 'payment'
  | 'wallet'
  | 'chat'
  | 'community'
  | 'security';

export type PriorityLevel = 'low' | 'medium' | 'high' | 'critical';

export type IssueStatus =
  | 'open'
  | 'triaged'
  | 'in_progress'
  | 'testing'
  | 'resolved'
  | 'closed'
  | 'rejected'
  | 'duplicate';

export type RoadmapStatus =
  | 'planned'
  | 'under_review'
  | 'in_progress'
  | 'released'
  | 'declined';

export type AttachmentFileType = 'screenshot' | 'recording' | 'image' | 'pdf';

export interface FeedbackCategory {
  id: FeedbackCategoryType;
  name: string;
  description: string;
  iconName: string;
  colorHex: string;
  badgeColorClass: string;
  displayOrder: number;
}

export interface GranularRatings {
  overallExperience: number; // 1-5
  performance: number;       // 1-5
  design: number;            // 1-5
  easeOfUse: number;         // 1-5
  reliability: number;       // 1-5
}

export interface DiagnosticTelemetry {
  appVersion: string;
  buildNumber: string;
  deviceModel: string;
  screenResolution: string;
  viewportSize: string;
  browserName: string;
  browserVersion: string;
  operatingSystem: string;
  osVersion: string;
  sessionId: string;
  currentRoute: string;
  lastAction: string;
  networkType: string;
  isOnline: boolean;
  apiTraceId: string;
  requestId: string;
  featureFlags: Record<string, boolean>;
  locale: string;
  timezone: string;

  // Context Enrichment
  walletContext?: {
    walletType?: string;
    currency?: string;
    transactionId?: string;
    transactionStatus?: string;
    provider?: string;
    paymentGateway?: string;
    settlementProvider?: string;
  };
  chatContext?: {
    conversationId?: string;
    messageId?: string;
    deliveryState?: string;
    socketStatus?: string;
    pushNotificationStatus?: string;
  };
  communityContext?: {
    postId?: string;
    commentId?: string;
    feedVersion?: string;
  };

  // Error Context
  errorMessage?: string;
  errorName?: string;
  stackTrace?: string;
  consoleLogs?: string[];
  failedApiEndpoint?: string;
  httpStatus?: number;
  requestDurationMs?: number;
}

export interface FeedbackAttachment {
  id: string;
  fileName: string;
  fileType: AttachmentFileType;
  mimeType: string;
  fileSizeBytes: number;
  storageUrl: string;
  thumbnailUrl?: string;
  isCompressed: boolean;
  originalSizeBytes?: number;
  createdAt: string;
}

export interface FeedbackComment {
  id: string;
  reportId: string;
  authorId: string;
  authorName?: string;
  authorAvatar?: string;
  content: string;
  isInternal: boolean;
  mentionedUserIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackStatusHistoryItem {
  id: string;
  reportId: string;
  changedBy: string;
  changedByName?: string;
  previousStatus?: IssueStatus;
  newStatus?: IssueStatus;
  previousPriority?: PriorityLevel;
  newPriority?: PriorityLevel;
  changeReason?: string;
  createdAt: string;
}

export interface FeedbackReport {
  id: string;
  reportNumber: number;
  userId: string | null;
  userProfile?: {
    username: string;
    fullName: string;
    avatarUrl: string;
    role?: string;
  };
  categoryId: FeedbackCategoryType;
  type: 'bug' | 'feature' | 'improvement' | 'general' | 'crash' | 'security';
  priority: PriorityLevel;
  status: IssueStatus;
  roadmapStatus?: RoadmapStatus;

  title: string;
  description: string;
  reproductionSteps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;

  // AI Assistance
  aiGeneratedTitle?: string;
  aiSuggestedCategory?: FeedbackCategoryType;
  aiConfidenceScore?: number;
  aiReproductionSteps?: string[];
  spamScore?: number;

  // Duplicate Tracking
  isDuplicate?: boolean;
  duplicateOfId?: string;

  // Version Management
  introducedInVersion?: string;
  fixedInVersion?: string;
  isRegression?: boolean;
  isHotfix?: boolean;

  // Developer Assignment
  assignedTo?: string | null;
  assigneeProfile?: {
    username: string;
    fullName: string;
    avatarUrl: string;
  };
  resolutionNotes?: string;
  internalNotes?: string;
  tags?: string[];

  voteCount: number;
  viewCount: number;
  hasVoted?: boolean;
  isWatching?: boolean;

  ratings?: GranularRatings;
  telemetry?: DiagnosticTelemetry;
  attachments?: FeedbackAttachment[];
  comments?: FeedbackComment[];

  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
}

export interface AIAssistanceResult {
  suggestedTitle: string;
  suggestedCategory: FeedbackCategoryType;
  estimatedPriority: PriorityLevel;
  confidenceScore: number;
  extractedSteps: string[];
  potentialDuplicates: Array<{
    id: string;
    title: string;
    status: IssueStatus;
    similarityScore: number;
  }>;
}

export interface BetaTester {
  id: string;
  userId: string;
  username: string;
  fullName: string;
  avatarUrl: string;
  status: 'pending' | 'approved' | 'active' | 'suspended';
  testingGroup: 'general' | 'fintech_vip' | 'early_adopters' | 'security_auditors';
  invitedBy?: string;
  approvedAt?: string;
  reportsSubmitted: number;
  lastActiveAt: string;
  createdAt: string;
}

export interface AnalyticsSummary {
  totalReports: number;
  openBugs: number;
  crashFreeSessionRate: number; // percentage, e.g. 99.4
  averageRating: number;
  ratingsBreakdown: GranularRatings;
  topReportedCategories: Array<{ categoryId: string; count: number; percentage: number }>;
  topAffectedDevices: Array<{ device: string; count: number }>;
  topAffectedBrowsers: Array<{ browser: string; count: number }>;
  topAffectedOs: Array<{ os: string; count: number }>;
  topReportedPages: Array<{ page: string; count: number }>;
  averageResolutionTimeHours: number;
  versionStabilityScore: number;
}

export interface FeedbackAuditLog {
  id: string;
  reportId: string;
  actorId?: string;
  actorName: string;
  actionType: 'status_change' | 'priority_change' | 'assigned' | 'note_added' | 'regression_detected' | 'closed';
  description: string;
  createdAt: string;
}

export interface CrashReplayBreadcrumb {
  timestamp: string;
  category: 'navigation' | 'click' | 'api_failure' | 'console_error' | 'user_action';
  description: string;
  data?: Record<string, unknown>;
}

export interface FeedbackPostmortem {
  id: string;
  reportId: string;
  authorId?: string;
  authorName?: string;
  rootCause: string;
  solution: string;
  lessonsLearned?: string;
  createdAt: string;
}

export interface ReleaseHealthMetrics {
  version: string;
  releaseDate: string;
  crashFreeRate: number;
  averageRating: number;
  openIssuesCount: number;
  resolvedIssuesCount: number;
  regressionCount: number;
  walletSuccessRate: number;
  paymentSuccessRate: number;
  chatDeliveryRate: number;
  pushNotificationRate: number;
}

export interface FeedbackSystemAlert {
  id: string;
  alertType: 'payment_failure_spike' | 'crash_rate_high' | 'latency_spike' | 'regression_detected';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  isAcknowledged: boolean;
  createdAt: string;
}

export interface ViewerPresence {
  reportId: string;
  userId: string;
  username: string;
  lastPingAt: string;
}

