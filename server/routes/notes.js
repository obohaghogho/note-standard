const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { getNotes, createNote, updateNote, deleteNote, shareNote } = require('../controllers/notesController');

router.use(requireAuth); // All note routes need authentication

router.get('/', getNotes);
router.post('/', createNote);
router.post('/share', shareNote);
router.put('/:id', updateNote);
router.delete('/:id', deleteNote);

module.exports = router;
