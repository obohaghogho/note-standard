const supabase = require('../config/database');
const activityService = require('../services/activityService');

exports.createSpace = async (req, res, next) => {
    try {
        const { name, description, visibility, banner_url, avatar_url } = req.body;
        const userId = req.user.id;

        if (!name) {
            return res.status(400).json({ error: 'Space name is required' });
        }

        // 1. Create the space
        const { data: space, error: spaceError } = await supabase
            .from('community_spaces')
            .insert({
                name,
                description,
                visibility: visibility || 'public',
                banner_url,
                avatar_url,
                owner_id: userId,
                member_count: 1
            })
            .select()
            .single();

        if (spaceError) throw spaceError;

        // 2. Add creator as owner in space_members
        const { error: memberError } = await supabase
            .from('space_members')
            .insert({
                space_id: space.id,
                user_id: userId,
                permission_role: 'owner'
            });

        if (memberError) throw memberError;

        // 3. Log activity
        await activityService.logActivity({
            userId,
            actionType: 'created_space',
            entityType: 'community_space',
            entityId: space.id,
            metadata: { space_name: name }
        });

        res.status(201).json(space);
    } catch (err) {
        next(err);
    }
};

exports.getSpaces = async (req, res, next) => {
    try {
        // Fetch public spaces
        const { data, error } = await supabase
            .from('community_spaces')
            .select('id, name, description, avatar_url, banner_url, member_count, category, tags, health_score, quality_score, mod_score, response_score, safety_score')
            .eq('visibility', 'public')
            .order('member_count', { ascending: false })
            .limit(50);

        if (error) {
            if (error.code === '42P01') return res.json([]); // migration not run
            throw error;
        }

        res.json(data);
    } catch (err) {
        next(err);
    }
};

exports.joinSpace = async (req, res, next) => {
    try {
        const { spaceId } = req.params;
        const userId = req.user.id;

        // Check if space exists
        const { data: space, error: spaceError } = await supabase
            .from('community_spaces')
            .select('id, visibility')
            .eq('id', spaceId)
            .single();

        if (spaceError || !space) return res.status(404).json({ error: 'Space not found' });

        if (space.visibility === 'private') {
            return res.status(403).json({ error: 'Cannot join private space directly' });
        }

        // Add member
        const { error: joinError } = await supabase
            .from('space_members')
            .insert({
                space_id: spaceId,
                user_id: userId,
                permission_role: 'member'
            });

        if (joinError) {
            if (joinError.code === '23505') {
                return res.status(400).json({ error: 'Already a member' });
            }
            throw joinError;
        }

        // Log activity
        await activityService.logActivity({
            userId,
            actionType: 'joined_space',
            entityType: 'community_space',
            entityId: spaceId
        });

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

exports.getSpaceById = async (req, res, next) => {
    try {
        const { spaceId } = req.params;
        const userId = req.user.id;

        // Fetch space details
        const { data: space, error: spaceError } = await supabase
            .from('community_spaces')
            .select('*')
            .eq('id', spaceId)
            .single();

        if (spaceError || !space) {
            return res.status(404).json({ error: 'Space not found' });
        }

        // Get caller's membership role
        const { data: member } = await supabase
            .from('space_members')
            .select('permission_role')
            .eq('space_id', spaceId)
            .eq('user_id', userId)
            .maybeSingle();

        const userRole = member ? member.permission_role : null;

        res.json({
            ...space,
            userRole
        });
    } catch (err) {
        next(err);
    }
};
