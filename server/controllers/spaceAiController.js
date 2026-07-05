const supabase = require('../config/database');
const Groq = require('groq-sdk');
const features = require('../config/features');
const graphService = require('../services/graph/GraphService');

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

exports.askSpaceAi = async (req, res, next) => {
    try {
        const { spaceId } = req.params;
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ error: 'Query is required' });
        }

        if (!features.LEARNING_MODE_ENABLED && !process.env.GROQ_API_KEY) {
            return res.status(503).json({ error: 'AI Assistant is currently unavailable' });
        }

        // 1. Check Space Manifest if AI is enabled
        const { data: space, error: spaceError } = await supabase
            .from('community_spaces')
            .select('name, description, manifest')
            .eq('id', spaceId)
            .single();

        if (spaceError || !space) return res.status(404).json({ error: 'Space not found' });
        
        if (space.manifest && space.manifest.features && space.manifest.features.ai === false) {
            return res.status(403).json({ error: 'AI Assistant is disabled for this space' });
        }

        // 2. Build enriched context from Knowledge Graph (Phase 2.5 upgrade)
        const graphContext = await graphService.buildAiContext({ spaceId, query });

        // 3. Also fetch recent posts as lightweight supplemental context
        const { data: recentPosts } = await supabase
            .from('community_posts')
            .select('title, content, category, post_type, profiles(username)')
            .eq('space_id', spaceId)
            .eq('status', 'public')
            .order('created_at', { ascending: false })
            .limit(5);

        let contextString = `Space: ${space.name}\nDescription: ${space.description}\n`;
        contextString += `\nKnowledge Graph: ${graphContext.totalEdges} verified knowledge connections in this space.`;

        if (graphContext.topNodes?.length) {
            contextString += `\nTop connected content nodes:\n`;
            graphContext.topNodes.forEach(edge => {
                contextString += `  - ${edge.source_type}: ${edge.source_id} → ${edge.edge_type} → ${edge.target_type}\n`;
            });
        }

        if (recentPosts?.length) {
            contextString += `\nRecent Discussions:\n`;
            recentPosts.forEach(p => {
                contextString += `  [${p.category}] ${p.profiles?.username || 'User'}: ${(p.title || p.content || '').substring(0, 80)}...\n`;
            });
        }

        // 3. Query Groq
        const systemPrompt = `You are the AI Assistant for the NoteStandard Space named "${space.name}". 
Your goal is to help users find information, summarize discussions, and answer questions based on the space context.
Keep your answers helpful, concise, and professional.

Context of recent posts:
${contextString}`;

        const chatCompletion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: query }
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.3,
            max_tokens: 500
        });

        const responseText = chatCompletion.choices[0]?.message?.content || "I'm unable to process that request right now.";

        res.json({ answer: responseText });
    } catch (err) {
        next(err);
    }
};
