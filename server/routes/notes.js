const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB limit

const { requireAuth } = require('../middleware/auth');
const { 
  getNotes, 
  getNote, 
  createNote, 
  updateNote, 
  deleteNote, 
  shareNote, 
  searchNotes, 
  exportNote,
  getTrashNotes,
  restoreNote,
  deleteNotePermanently,
  getNotePermissions,
  updateNotePermission,
  createNoteComment,
  getNoteComments,
  deleteNotePermission,
  getNoteFiles,
  uploadNoteFile,
  downloadNoteFile,
  deleteNoteFile
} = require('../controllers/notesController');

router.use(requireAuth); // All note routes need authentication

router.get('/search', searchNotes);
router.get('/trash', getTrashNotes);
router.post('/:id/restore', restoreNote);
router.delete('/:id/permanent', deleteNotePermanently);

router.get('/:id/permissions', getNotePermissions);
router.post('/:id/permissions', updateNotePermission);
router.delete('/:id/permissions/:userPermissionId', deleteNotePermission);

router.get('/:id/comments', getNoteComments);
router.post('/:id/comments', createNoteComment);

router.get('/:id/export', exportNote);
router.get('/', getNotes);
router.get('/:id', getNote);
router.post('/', createNote);
router.post('/share', shareNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

// Attachment routes
router.get('/:id/files', getNoteFiles);
router.post('/:id/files', upload.single('file'), uploadNoteFile);
router.get('/:id/files/:fileId/download', downloadNoteFile);
router.delete('/:id/files/:fileId', deleteNoteFile);

module.exports = router;
