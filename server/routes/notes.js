const express = require('express');
const router = express.Router();
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
  deleteNotePermission
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

module.exports = router;
