const { translateText, detectLanguage } = require('../services/translationService');
const path = require('path');
const supabase = require(path.join(__dirname, '..', 'config', 'supabase'));

exports.translateMessage = async (req, res) => {
    try {
        const { text, targetLang, sourceLang } = req.body;

        if (!text || !targetLang) {
            return res.status(400).json({ error: 'Text and targetLang are required' });
        }

        const translatedText = await translateText(text, targetLang, sourceLang);
        res.json({ translation: translatedText });

    } catch (error) {
        console.error('Translation endpoint error:', error);
        res.status(500).json({ error: 'Translation failed', original: req.body.text });
    }
};

exports.updatePreferredLanguage = async (req, res) => {
    try {
        const { language } = req.body;
        const userId = req.user.id;

        if (!language) {
            return res.status(400).json({ error: 'Language is required' });
        }

        const { data, error } = await supabase
            .from('profiles')
            .update({ preferred_language: language })
            .eq('id', userId)
            .select()
            .single();

        if (error) throw error;
        res.json(data);

    } catch (error) {
        console.error('Error updating language preference:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};

exports.reportTranslationError = async (req, res) => {
    try {
        const { messageId, originalText, translatedText, targetLang, comment } = req.body;
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('translation_reports')
            .insert([{
                user_id: userId,
                message_id: messageId,
                original_text: originalText,
                translated_text: translatedText,
                target_language: targetLang,
                comment: comment
            }])
            .select()
            .single();

        if (error) throw error;
        res.json({ success: true, report: data });

    } catch (error) {
        console.error('Error reporting translation:', error);
        res.status(500).json({ error: 'Server Error' });
    }
};
