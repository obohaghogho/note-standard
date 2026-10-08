-- Migration 503: Phase 13 Daily Creator Analytics Snapshot Function
-- Computes daily learning impact metrics (quiz completions, avg quiz score,
-- learning path completions, 7d/30d started_at retention) for all creators.

CREATE OR REPLACE FUNCTION generate_daily_creator_analytics(p_snapshot_date DATE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    WITH creator_nodes AS (
        SELECT id AS node_id, 'quiz' AS node_type, created_by AS creator_id FROM quizzes WHERE created_by IS NOT NULL
        UNION ALL
        SELECT id AS node_id, 'post' AS node_type, author_id AS creator_id FROM community_posts WHERE author_id IS NOT NULL
        UNION ALL
        SELECT id AS node_id, 'flashcard' AS node_type, created_by AS creator_id FROM flashcards WHERE created_by IS NOT NULL
        UNION ALL
        SELECT id AS node_id, 'summary' AS node_type, created_by AS creator_id FROM knowledge_summaries WHERE created_by IS NOT NULL
        UNION ALL
        SELECT id AS node_id, 'wiki' AS node_type, author_id AS creator_id FROM space_wiki_pages WHERE author_id IS NOT NULL
    ),
    quiz_metrics AS (
        SELECT
            cn.creator_id,
            COUNT(DISTINCT (ls.user_id, ls.node_id)) AS quiz_completions,
            ROUND(AVG(ls.accuracy)::numeric, 2) AS avg_quiz_score
        FROM learning_sessions ls
        JOIN creator_nodes cn ON ls.node_id = cn.node_id AND ls.node_type = cn.node_type
        WHERE ls.node_type = 'quiz'
          AND ls.completed_at IS NOT NULL
          AND (ls.completed_at AT TIME ZONE 'UTC')::date = p_snapshot_date
        GROUP BY cn.creator_id
    ),
    path_completion_events AS (
        SELECT
            lp.creator_id,
            ukp.user_id,
            ukp.path_id,
            MAX((ukp.completed_at AT TIME ZONE 'UTC')::date) AS max_completed_date
        FROM user_knowledge_progress ukp
        JOIN learning_path_nodes lpn ON ukp.node_id = lpn.id
        JOIN learning_paths lp ON lpn.path_id = lp.id
        WHERE ukp.status = 'completed'
          AND lpn.is_required = true
          AND lp.creator_id IS NOT NULL
        GROUP BY lp.creator_id, ukp.user_id, ukp.path_id
        HAVING COUNT(DISTINCT lpn.id) = (
            SELECT COUNT(*)
            FROM learning_path_nodes req_lpn
            WHERE req_lpn.path_id = ukp.path_id AND req_lpn.is_required = true
        )
    ),
    path_metrics AS (
        SELECT
            creator_id,
            COUNT(DISTINCT (user_id, path_id)) AS learning_path_completions
        FROM path_completion_events
        WHERE max_completed_date = p_snapshot_date
        GROUP BY creator_id
    ),
    creator_sessions AS (
        SELECT DISTINCT
            cn.creator_id,
            ls.user_id,
            (ls.started_at AT TIME ZONE 'UTC')::date AS started_date
        FROM learning_sessions ls
        JOIN creator_nodes cn ON ls.node_id = cn.node_id AND ls.node_type = cn.node_type
    ),
    cohort_7d AS (
        SELECT DISTINCT creator_id, user_id
        FROM creator_sessions
        WHERE started_date = p_snapshot_date - 7
    ),
    returns_7d AS (
        SELECT DISTINCT c7.creator_id, c7.user_id
        FROM cohort_7d c7
        JOIN creator_sessions cs ON c7.creator_id = cs.creator_id AND c7.user_id = cs.user_id
        WHERE cs.started_date = p_snapshot_date
    ),
    ret_7d AS (
        SELECT
            c7.creator_id,
            COUNT(c7.user_id) AS cohort_size,
            COUNT(r7.user_id) AS returned_size,
            CASE
                WHEN COUNT(c7.user_id) > 0 THEN ROUND((COUNT(r7.user_id)::numeric / COUNT(c7.user_id)::numeric) * 100.0, 2)
                ELSE NULL
            END AS retention_7d_pct
        FROM cohort_7d c7
        LEFT JOIN returns_7d r7 ON c7.creator_id = r7.creator_id AND c7.user_id = r7.user_id
        GROUP BY c7.creator_id
    ),
    cohort_30d AS (
        SELECT DISTINCT creator_id, user_id
        FROM creator_sessions
        WHERE started_date = p_snapshot_date - 30
    ),
    returns_30d AS (
        SELECT DISTINCT c30.creator_id, c30.user_id
        FROM cohort_30d c30
        JOIN creator_sessions cs ON c30.creator_id = cs.creator_id AND c30.user_id = cs.user_id
        WHERE cs.started_date = p_snapshot_date
    ),
    ret_30d AS (
        SELECT
            c30.creator_id,
            COUNT(c30.user_id) AS cohort_size,
            COUNT(r30.user_id) AS returned_size,
            CASE
                WHEN COUNT(c30.user_id) > 0 THEN ROUND((COUNT(r30.user_id)::numeric / COUNT(c30.user_id)::numeric) * 100.0, 2)
                ELSE NULL
            END AS retention_30d_pct
        FROM cohort_30d c30
        LEFT JOIN returns_30d r30 ON c30.creator_id = r30.creator_id AND c30.user_id = r30.user_id
        GROUP BY c30.creator_id
    ),
    eligible_creators AS (
        SELECT id AS creator_id
        FROM profiles
        WHERE is_creator = true OR creator_mode_enabled = true
    ),
    all_creators AS (
        SELECT creator_id FROM eligible_creators
        UNION
        SELECT creator_id FROM quiz_metrics
        UNION
        SELECT creator_id FROM path_metrics
        UNION
        SELECT creator_id FROM ret_7d
        UNION
        SELECT creator_id FROM ret_30d
    )
    INSERT INTO creator_analytics_snapshots (
        creator_id,
        snapshot_date,
        quiz_completions,
        avg_quiz_score,
        learning_path_completions,
        retention_7d_pct,
        retention_30d_pct
    )
    SELECT
        ac.creator_id,
        p_snapshot_date,
        COALESCE(qm.quiz_completions, 0),
        qm.avg_quiz_score,
        COALESCE(pm.learning_path_completions, 0),
        r7.retention_7d_pct,
        r30.retention_30d_pct
    FROM all_creators ac
    LEFT JOIN quiz_metrics qm ON ac.creator_id = qm.creator_id
    LEFT JOIN path_metrics pm ON ac.creator_id = pm.creator_id
    LEFT JOIN ret_7d r7 ON ac.creator_id = r7.creator_id
    LEFT JOIN ret_30d r30 ON ac.creator_id = r30.creator_id
    ON CONFLICT (creator_id, snapshot_date) DO UPDATE SET
        quiz_completions = EXCLUDED.quiz_completions,
        avg_quiz_score = EXCLUDED.avg_quiz_score,
        learning_path_completions = EXCLUDED.learning_path_completions,
        retention_7d_pct = EXCLUDED.retention_7d_pct,
        retention_30d_pct = EXCLUDED.retention_30d_pct;
END;
$$;
