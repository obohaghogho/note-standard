const supabase = require('../config/database');
const logger = require('../utils/logger');

/**
 * Support & Ticket Controller (B-12)
 * Handles user feedback ticket creation and ticket history retrieval.
 */
exports.createTicket = async (req, res) => {
  try {
    const userId = req.user.id;
    const { category, description } = req.body;

    if (!description || typeof description !== 'string' || description.trim().length < 5) {
      return res.status(400).json({ error: 'Ticket description must be at least 5 characters long' });
    }

    const validCategory = ['bug', 'feature', 'wallet', 'general'].includes(category) ? category : 'general';

    // Insert feedback ticket
    const ticketData = {
      user_id: userId,
      category: validCategory,
      description: description.trim(),
      status: 'OPEN',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error } = await supabase
      .from('user_feedback')
      .insert(ticketData)
      .select('id, category, description, status, created_at')
      .single();

    if (error) {
      // Fallback table check if user_feedback schema is named feedback_reports
      const { data: createdFallback, error: fallbackErr } = await supabase
        .from('feedback_reports')
        .insert({
          user_id: userId,
          category: validCategory,
          description: description.trim(),
          status: 'OPEN',
        })
        .select('id, category, description, status, created_at')
        .single();

      if (fallbackErr) {
        logger.error('[Support] Ticket persistence error:', fallbackErr.message);
        throw fallbackErr;
      }

      return res.status(201).json({
        success: true,
        ticket: createdFallback,
      });
    }

    logger.info(`[Support] Ticket created successfully: ${created.id} by user: ${userId}`);

    res.status(201).json({
      success: true,
      ticket: created,
    });
  } catch (err) {
    logger.error('[Support] Error creating feedback ticket:', err);
    res.status(500).json({ error: 'Failed to submit feedback ticket', message: err.message });
  }
};

exports.getMyTickets = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: tickets, error } = await supabase
      .from('user_feedback')
      .select('id, category, description, status, created_at, updated_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      // Fallback table query
      const { data: fallbackTickets } = await supabase
        .from('feedback_reports')
        .select('id, category, description, status, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      return res.json({
        success: true,
        tickets: fallbackTickets || [],
      });
    }

    res.json({
      success: true,
      tickets: tickets || [],
    });
  } catch (err) {
    logger.error('[Support] Error fetching user tickets:', err);
    res.status(500).json({ error: 'Failed to retrieve tickets', message: err.message });
  }
};
