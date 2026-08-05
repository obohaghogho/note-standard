const logger = require('../utils/logger');
const fetch = require('node-fetch');

class FeedbackConnectors {
  /**
   * Dispatch Webhook to Slack channel
   */
  async sendSlackNotification(webhookUrl, report) {
    if (!webhookUrl) return;
    try {
      const payload = {
        text: `🚨 *[NoteStandard ${report.priority.toUpperCase()} Issue]*: ${report.title}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*New Issue Reported (#${report.report_number || 'N/A'})*\n*Category:* ${report.category_id}\n*Priority:* ${report.priority}\n*Title:* ${report.title}\n*Description:* ${report.description.substring(0, 150)}...`
            }
          }
        ]
      };
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      logger.info(`[FeedbackConnectors] Slack notification dispatched for report ${report.id}`);
    } catch (err) {
      logger.error('[FeedbackConnectors] Slack dispatch failed:', err.message);
    }
  }

  /**
   * Dispatch Webhook to Discord channel
   */
  async sendDiscordNotification(webhookUrl, report) {
    if (!webhookUrl) return;
    try {
      const payload = {
        username: 'NoteStandard Feedback Bot',
        embeds: [{
          title: `[${report.priority.toUpperCase()}] ${report.title}`,
          description: report.description.substring(0, 300),
          color: report.priority === 'critical' ? 14423100 : report.priority === 'high' ? 16098816 : 3447003,
          fields: [
            { name: 'Category', value: report.category_id, inline: true },
            { name: 'Status', value: report.status, inline: true },
            { name: 'Version', value: report.introduced_in_version || 'v1.0.5', inline: true }
          ],
          timestamp: new Date().toISOString()
        }]
      };
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      logger.info(`[FeedbackConnectors] Discord notification dispatched for report ${report.id}`);
    } catch (err) {
      logger.error('[FeedbackConnectors] Discord dispatch failed:', err.message);
    }
  }

  /**
   * Sync issue to GitHub Issues API
   */
  async createGitHubIssue(repoOwner, repoName, token, report) {
    if (!repoOwner || !repoName || !token) return;
    try {
      const url = `https://api.github.com/repos/${repoOwner}/${repoName}/issues`;
      const payload = {
        title: `[${report.category_id}] ${report.title}`,
        body: `### Issue Description\n${report.description}\n\n### Priority\n${report.priority}\n\n### Introduced in Version\n${report.introduced_in_version || 'v1.0.5'}`,
        labels: [report.category_id, report.priority]
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'NoteStandard-App'
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      logger.info(`[FeedbackConnectors] GitHub Issue created: ${data.html_url}`);
      return data;
    } catch (err) {
      logger.error('[FeedbackConnectors] GitHub issue creation failed:', err.message);
    }
  }

  /**
   * Sync issue to Linear API
   */
  async createLinearIssue(linearApiKey, teamId, report) {
    if (!linearApiKey || !teamId) return;
    try {
      const query = `
        mutation CreateIssue($title: String!, $description: String!, $teamId: String!) {
          issueCreate(input: { title: $title, description: $description, teamId: $teamId }) {
            success
            issue { id title url }
          }
        }
      `;
      const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Authorization': linearApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query,
          variables: {
            title: `[${report.category_id}] ${report.title}`,
            description: report.description,
            teamId
          }
        })
      });
      const data = await res.json();
      logger.info('[FeedbackConnectors] Linear issue created:', data);
      return data;
    } catch (err) {
      logger.error('[FeedbackConnectors] Linear issue creation failed:', err.message);
    }
  }
}

module.exports = new FeedbackConnectors();
