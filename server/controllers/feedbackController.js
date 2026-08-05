const feedbackService = require('../services/feedbackService');
const feedbackConnectors = require('../services/feedbackConnectors');
const logger = require('../utils/logger');
const dompurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const DOMPurify = dompurify(window);

class FeedbackController {
  /**
   * Submit report
   */
  async createReport(req, res) {
    try {
      const userId = req.user?.id || null;
      const { report, ratings, telemetry, honeypot } = req.body;

      // Spam Honeypot validation
      if (honeypot) {
        logger.warn('[FeedbackController] Spam bot detected via honeypot field');
        return res.status(400).json({ success: false, error: 'Invalid submission' });
      }

      if (!report || !report.description) {
        return res.status(400).json({ success: false, error: 'Report title and description are required' });
      }

      // Input sanitization
      const cleanReport = {
        ...report,
        title: DOMPurify.sanitize(report.title || 'Untitled Feedback'),
        description: DOMPurify.sanitize(report.description),
        expectedBehavior: report.expectedBehavior ? DOMPurify.sanitize(report.expectedBehavior) : undefined,
        actualBehavior: report.actualBehavior ? DOMPurify.sanitize(report.actualBehavior) : undefined,
      };

      const result = await feedbackService.createReport(userId, cleanReport, ratings, telemetry);

      // Dispatch Webhook notifications if critical or high
      if (cleanReport.priority === 'critical' || cleanReport.priority === 'high') {
        if (process.env.SLACK_WEBHOOK_URL) {
          feedbackConnectors.sendSlackNotification(process.env.SLACK_WEBHOOK_URL, result);
        }
        if (process.env.DISCORD_WEBHOOK_URL) {
          feedbackConnectors.sendDiscordNotification(process.env.DISCORD_WEBHOOK_URL, result);
        }
      }

      res.status(201).json({
        success: true,
        data: result,
        message: 'Feedback report submitted successfully'
      });
    } catch (err) {
      logger.error('[FeedbackController] createReport error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * List reports for admin dashboard
   */
  async getReports(req, res) {
    try {
      const filters = {
        category: req.query.category,
        priority: req.query.priority,
        status: req.query.status,
        type: req.query.type,
        assignedTo: req.query.assignedTo,
        search: req.query.search
      };
      const reports = await feedbackService.getReports(filters);
      res.json({ success: true, count: reports.length, data: reports });
    } catch (err) {
      logger.error('[FeedbackController] getReports error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Get user's own submitted reports
   */
  async getUserReports(req, res) {
    try {
      const userId = req.user.id;
      const reports = await feedbackService.getReports({ userId });
      res.json({ success: true, count: reports.length, data: reports });
    } catch (err) {
      logger.error('[FeedbackController] getUserReports error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Get single report
   */
  async getReportById(req, res) {
    try {
      const report = await feedbackService.getReportById(req.params.id);
      if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
      res.json({ success: true, data: report });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Update report status / assignee
   */
  async updateReport(req, res) {
    try {
      const id = req.params.id;
      const userId = req.user?.id;
      const { status, priority, assignedTo, roadmapStatus, fixedInVersion, resolutionNotes, internalNotes, reason } = req.body;

      const updated = await feedbackService.updateReport(id, userId, {
        status,
        priority,
        assignedTo,
        roadmapStatus,
        fixedInVersion,
        resolutionNotes,
        internalNotes
      }, reason);

      res.json({ success: true, data: updated, message: 'Report updated' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Add developer note / public reply
   */
  async addComment(req, res) {
    try {
      const reportId = req.params.id;
      const authorId = req.user?.id;
      const { content, isInternal, mentionedUserIds } = req.body;

      if (!content || !content.trim()) {
        return res.status(400).json({ success: false, error: 'Comment content is required' });
      }

      const comment = await feedbackService.addComment(
        reportId,
        authorId,
        DOMPurify.sanitize(content.trim()),
        Boolean(isInternal),
        mentionedUserIds || []
      );

      res.status(201).json({ success: true, data: comment });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Toggle Feature Request Vote
   */
  async toggleVote(req, res) {
    try {
      const reportId = req.params.id;
      const userId = req.user.id;
      const result = await feedbackService.toggleVote(reportId, userId);
      res.json({ success: true, data: result });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Ingest automatic Crash Report
   */
  async ingestCrash(req, res) {
    try {
      const userId = req.user?.id || null;
      const { errorName, errorMessage, stackTrace, route, telemetry } = req.body;

      const crashReportData = {
        title: `[AUTOMATIC CRASH] ${errorName || 'JavaScript Error'}: ${(errorMessage || '').substring(0, 60)}`,
        description: `Automated Crash Report captured.\nMessage: ${errorMessage}\nRoute: ${route || 'Unknown'}`,
        type: 'crash',
        category_id: 'bug_report',
        priority: 'high',
        status: 'open',
        tags: ['auto-crash', 'uncaught-error']
      };

      const fullTelemetry = {
        ...telemetry,
        errorName,
        errorMessage,
        stackTrace
      };

      const result = await feedbackService.createReport(userId, crashReportData, null, fullTelemetry);
      res.status(201).json({ success: true, data: result });
    } catch (err) {
      logger.error('[FeedbackController] ingestCrash error:', err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }

  /**
   * Analytics Endpoint
   */
  async getAnalytics(req, res) {
    try {
      const analytics = await feedbackService.getAnalyticsSummary();
      res.json({ success: true, data: analytics });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = new FeedbackController();
