const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
  ssl: { rejectUnauthorized: false },
});

async function exportNote(noteId, userId, format = "markdown") {
  try {
    // Security check: Verify user has access to this note (owner, shared, or public)
    const { rows } = await pool.query(
      `SELECT n.id, n.title, n.content, n.created_at, n.updated_at, n.tags, n.is_private, n.owner_id
       FROM notes n
       LEFT JOIN shared_notes s ON n.id = s.note_id AND s.shared_with_user_id = $2
       WHERE n.id = $1 AND n.deleted_at IS NULL AND (n.owner_id = $2 OR s.id IS NOT NULL OR n.is_private = false)
       LIMIT 1`,
      [noteId, userId]
    );

    if (rows.length === 0) {
      return { error: "Note not found or access denied", status: 403 };
    }

    const note = rows[0];
    const cleanTitle = note.title || "Untitled Note";
    const cleanContent = note.content || "";
    const createdStr = new Date(note.created_at).toLocaleString();
    const updatedStr = new Date(note.updated_at).toLocaleString();

    switch (format.toLowerCase()) {
      case "html":
        return {
          contentType: "text/html",
          filename: `${cleanTitle.replace(/[^\w\s]/gi, "").replace(/\s+/g, "_")}.html`,
          data: `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${cleanTitle}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      max-width: 800px;
      margin: 40px auto;
      padding: 0 20px;
      color: #1a1a1a;
      background-color: #ffffff;
    }
    h1 {
      border-bottom: 2px solid #eaeaea;
      padding-bottom: 12px;
      font-size: 2.2em;
    }
    .meta {
      color: #666;
      font-size: 0.9em;
      margin-bottom: 24px;
    }
    .content {
      font-size: 1.1em;
      white-space: pre-wrap;
    }
    .tags {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px dashed #eaeaea;
    }
    .tag {
      display: inline-block;
      background: #f3f4f6;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.85em;
      color: #4b5563;
      margin-right: 8px;
    }
  </style>
</head>
<body>
  <h1>${cleanTitle}</h1>
  <div class="meta">Created: ${createdStr} | Last Updated: ${updatedStr}</div>
  <div class="content">${cleanContent}</div>
  ${note.tags && note.tags.length > 0 ? `
  <div class="tags">
    ${note.tags.map(t => `<span class="tag">#${t}</span>`).join(" ")}
  </div>` : ""}
</body>
</html>`
        };

      case "json":
        return {
          contentType: "application/json",
          filename: `${cleanTitle.replace(/[^\w\s]/gi, "").replace(/\s+/g, "_")}.json`,
          data: JSON.stringify({
            id: note.id,
            title: cleanTitle,
            content: cleanContent,
            created_at: note.created_at,
            updated_at: note.updated_at,
            tags: note.tags || [],
            is_private: note.is_private,
            owner_id: note.owner_id
          }, null, 2)
        };

      case "markdown":
      default:
        return {
          contentType: "text/markdown",
          filename: `${cleanTitle.replace(/[^\w\s]/gi, "").replace(/\s+/g, "_")}.md`,
          data: `# ${cleanTitle}

*Created: ${createdStr} | Last Updated: ${updatedStr}*

---

${cleanContent}

${note.tags && note.tags.length > 0 ? `\n\n**Tags:** ${note.tags.map(t => `#${t}`).join(", ")}` : ""}
`
        };
    }
  } catch (err) {
    logger.error("[ExportService] exportNote error:", err.message);
    return { error: err.message, status: 500 };
  }
}

module.exports = {
  exportNote,
};
