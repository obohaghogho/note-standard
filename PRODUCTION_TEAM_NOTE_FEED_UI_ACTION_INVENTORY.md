# PRODUCTION TEAM, NOTE & FEED UI ACTION INVENTORY

**Application Subsystems:** Team Workspace, Note Taking, Community Feed
**Audit Campaign:** Team + Note + Feed Dashboard Forensic QA
**Audit Date:** August 10, 2026

---

## Action Inventory Table

| ID | Area | Element | Action | Expected Behavior | Actual Behavior | API Endpoint | DB Table | Persistence | Security Check | Result |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **TEAM-001** | Team | Team List Item | Click | Navigates to selected team workspace | Workspace loads cleanly | `GET /api/v1/teams/my-teams` | `teams` | Yes | Member check | **PASS** |
| **TEAM-002** | Team | Create Team Button | Click | Opens create team modal | Modal displays form | None | None | No | No | **PASS** |
| **TEAM-003** | Team | Submit Create Team | Click | Creates team & adds owner member | Team created | `POST /api/v1/teams` | `teams`, `team_members` | Yes | Owner role | **PASS** |
| **TEAM-004** | Team | Invite Member Button| Click | Sends invite to member email | Pending invite created | `POST /api/v1/teams/:teamId/members` | `team_members` | Yes | Admin check | **PASS** |
| **TEAM-005** | Team | Remove Member Button| Click | Revokes member from workspace | Member removed | `DELETE /api/v1/teams/:teamId/members/:userId` | `team_members` | Yes | Owner check | **PASS** |
| **TEAM-006** | Team | Team Chat Input | Submit | Sends message to team channel | Message appears in stream | `POST /api/v1/teams/:teamId/messages` | `team_messages` | Yes | Member check | **PASS** |
| **TEAM-007** | Team | Upload File Button | Upload | Uploads document to team files | File listed in cabinet | `POST /api/v1/teams/:teamId/files` | `team_files` | Yes | Member check | **PASS** |
| **TEAM-008** | Team | Recycle File Button | Click | Soft-deletes file to recycled bin | Moves to recycled view | `DELETE /api/v1/teams/:teamId/files/:fileId` | `team_files` | Yes | Member check | **PASS** |
| **TEAM-009** | Team | Restore File Button | Click | Restores recycled file to cabinet | Restored to cabinet | `POST /api/v1/teams/:teamId/files/:fileId/restore` | `team_files` | Yes | Member check | **PASS** |
| **TEAM-010** | Team | Create Sync Button | Click | Starts video meeting session | Meeting session created | `POST /api/v1/teams/:teamId/syncs` | `team_syncs` | Yes | Member check | **PASS** |
| **TEAM-011** | Team | Post Bulletin Button| Click | Publishes team announcement | Bulletin displayed | `POST /api/v1/teams/:teamId/bulletins` | `team_bulletins` | Yes | Admin check | **PASS** |
| **NOTE-001** | Note | Create Note Button | Click | Opens editor for new document | Editor loaded | `POST /api/v1/notes` | `notes` | Yes | Owner check | **PASS** |
| **NOTE-002** | Note | Rich Editor Typing | Change | Autosaves document content | Content autosaved | `PUT /api/v1/notes/:id` | `notes` | Yes | Owner check | **PASS** |
| **NOTE-003** | Note | Note Title Input | Change | Updates note title | Title updated | `PUT /api/v1/notes/:id` | `notes` | Yes | Owner check | **PASS** |
| **NOTE-004** | Note | Search Notes Field | Input | Filters notes by keyword/tag | Filtered scroller | `GET /api/v1/notes/search` | `notes` | No | User-scoped | **PASS** |
| **NOTE-005** | Note | Trash Note Button | Click | Soft-deletes note to trash | Note moved to trash | `DELETE /api/v1/notes/:id` | `notes` | Yes | Owner check | **PASS** |
| **NOTE-006** | Note | Restore Note Button | Click | Restores note from trash | Note restored | `POST /api/v1/notes/:id/restore` | `notes` | Yes | Owner check | **PASS** |
| **NOTE-007** | Note | Permanent Delete | Click | Hard deletes note & attachments | Note permanently removed| `DELETE /api/v1/notes/:id/permanent` | `notes` | Yes | Owner check | **PASS** |
| **NOTE-008** | Note | Share Note Button | Click | Grants user permission | Share permission saved | `POST /api/v1/notes/share` | `note_permissions` | Yes | Owner check | **PASS** |
| **NOTE-009** | Note | AI Summarize Button| Click | Generates AI document summary | AI summary returned | `POST /api/v1/notes-ai/summarize` | None | No | Read check | **PASS** |
| **FEED-001** | Feed | Post Composer Field| Input | Enters post text content | Text updated | None | None | No | No | **PASS** |
| **FEED-002** | Feed | Publish Post Button| Click | Creates community feed post | Post displayed in feed | `POST /api/v1/community/post` | `community_posts` | Yes | Auth check | **PASS** |
| **FEED-003** | Feed | Like Post Button | Click | Toggles post reaction | Like count updated | `POST /api/v1/community/like` | `community_likes` | Yes | Auth check | **PASS** |
| **FEED-004** | Feed | Comment Input | Submit | Adds comment to post | Comment displayed | `POST /api/v1/community/comment` | `community_comments` | Yes | Auth check | **PASS** |
| **FEED-005** | Feed | Follow Creator Btn | Click | Toggles follow state | Follow status updated | `POST /api/v1/community/profile/:id/follow`| `community_follows` | Yes | Rate limited | **PASS** |
| **FEED-006** | Feed | Bookmark Post Btn | Click | Bookmarks post for user | Bookmarked status set | `POST /api/v1/community/post/:id/bookmark` | `community_bookmarks`| Yes | Auth check | **PASS** |
| **FEED-007** | Feed | Report Post Button | Click | Submits content moderation report | Report registered | `POST /api/v1/community/report` | `community_reports` | Yes | Rate limited | **PASS** |

---

## Action Metrics Tally
- **Total Mapped Actions:** 27
- **Total Tested:** 27
- **Total Pass Rate:** 100%
