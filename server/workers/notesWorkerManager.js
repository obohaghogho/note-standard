const NotesAnalyticsWorker = require("./NotesAnalyticsWorker");
const ReminderWorker = require("./ReminderWorker");
const SearchIndexWorker = require("./SearchIndexWorker");
const NotificationWorker = require("./NotificationWorker");
const AIWorker = require("./AIWorker");
const logger = require("../utils/logger");

function start() {
  logger.info("[NotesWorkerManager] Initializing background task processors...");
  try {
    NotesAnalyticsWorker.start();
    ReminderWorker.start();
    SearchIndexWorker.start();
    NotificationWorker.start();
    AIWorker.start();
    logger.info("[NotesWorkerManager] All note workers initiated successfully.");
  } catch (err) {
    logger.error("[NotesWorkerManager] Initialization failed:", err.message);
  }
}

module.exports = {
  start,
};
