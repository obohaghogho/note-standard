const express = require("express");
const router = express.Router();
const collaborationController = require("../controllers/collaborationController");
const { requireAuth } = require("../middleware/authMiddleware");

router.use(requireAuth);

// Projects
router.get("/teams/:teamId/projects", collaborationController.getProjects);
router.post("/teams/:teamId/projects", collaborationController.createProject);
router.patch("/teams/:teamId/projects/:projectId", collaborationController.updateProject);
router.delete("/teams/:teamId/projects/:projectId", collaborationController.deleteProject);

// Tasks
router.get("/projects/:projectId/tasks", collaborationController.getTasks);
router.post("/teams/:teamId/projects/:projectId/tasks", collaborationController.createTask);
router.patch("/teams/:teamId/tasks/:taskId", collaborationController.updateTask);
router.delete("/teams/:teamId/tasks/:taskId", collaborationController.deleteTask);

// Task Checklists
router.get("/tasks/:taskId/checklist", collaborationController.getTaskChecklist);
router.post("/tasks/:taskId/checklist", collaborationController.addTaskChecklistItem);
router.patch("/checklist/:itemId", collaborationController.updateTaskChecklistItem);
router.delete("/checklist/:itemId", collaborationController.deleteTaskChecklistItem);

// Task Comments
router.get("/tasks/:taskId/comments", collaborationController.getTaskComments);
router.post("/tasks/:taskId/comments", collaborationController.addTaskComment);

// Departments
router.get("/departments", collaborationController.getDepartments);
router.post("/departments", collaborationController.createDepartment);
router.patch("/teams/:teamId/members/:userId/department", collaborationController.updateMemberDepartment);

// Roles
router.get("/teams/:teamId/roles", collaborationController.getCustomRoles);
router.post("/teams/:teamId/roles", collaborationController.createCustomRole);
router.patch("/teams/:teamId/members/:userId/role", collaborationController.updateMemberCustomRole);

// File Manager — NOTE: /recycled must come BEFORE the generic GET route
router.get("/teams/:teamId/files/recycled", collaborationController.getRecycledFiles);
router.get("/teams/:teamId/files", collaborationController.getWorkspaceFiles);
router.post("/teams/:teamId/folders", collaborationController.createFolder);
router.post("/teams/:teamId/files", collaborationController.uploadFileMetadata);
router.patch("/files/:fileId/favorite", collaborationController.toggleFileFavorite);
router.patch("/teams/:teamId/files/:fileId/recycle", collaborationController.recycleFile);

// Meetings
router.get("/teams/:teamId/meetings", collaborationController.getMeetings);
router.post("/teams/:teamId/meetings", collaborationController.createMeeting);
router.patch("/teams/:teamId/meetings/:meetingId/status", collaborationController.updateMeetingStatus);

// Announcements
router.get("/teams/:teamId/announcements", collaborationController.getAnnouncements);
router.post("/teams/:teamId/announcements", collaborationController.createAnnouncement);

// Activity Feed
router.get("/teams/:teamId/activities", collaborationController.getWorkspaceActivities);

// Analytics
router.get("/teams/:teamId/analytics", collaborationController.getAnalytics);

// Webhook Secret (deterministic HMAC — safe to expose to workspace owners)
router.get("/teams/:teamId/webhook-secret", collaborationController.getWebhookSecret);

module.exports = router;
