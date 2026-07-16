const fs = require('fs');
const path = require('path');
const supabase = require('../server/config/database');

const ROOT_DIR = path.join(__dirname, '..');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const SERVER_DIR = path.join(ROOT_DIR, 'server');

const REQUIRED_TABLES = [
  'community_posts',
  'community_comments',
  'community_likes',
  'community_bookmarks',
  'community_follows',
  'community_reports',
  'community_polls',
  'community_poll_options',
  'community_poll_votes',
  'community_hashtags',
  'community_post_hashtags',
  'community_mentions'
];

const REQUIRED_ROUTES = [
  '/feed',
  '/post',
  '/post/:postId',
  '/post/:postId/bookmark',
  '/post/:postId/comments',
  '/comment',
  '/comment/:commentId',
  '/like',
  '/report',
  '/profile/:profileId/follow',
  '/suggested-creators',
  '/profile/:profileId'
];

const REQUIRED_WS_EVENTS = [
  'community:join_post',
  'community:leave_post',
  'community:post_created',
  'community:post_edited',
  'community:post_deleted',
  'community:like_toggled',
  'community:comment_added',
  'community:comment_deleted'
];

function readFilesRecursively(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(readFilesRecursively(file));
    } else {
      results.push(file);
    }
  });
  return results;
}

async function runAudit() {
  console.log('🔍 Starting Community Module Production Audit...\n');
  let hasErrors = false;

  const logPass = (msg) => console.log(`✅ PASS: ${msg}`);
  const logFail = (msg) => {
    console.error(`❌ FAIL: ${msg}`);
    hasErrors = true;
  };

  try {
    // 1. Database Table Audit
    console.log('--- Database Audit ---');
    for (const table of REQUIRED_TABLES) {
      const { error } = await supabase.from(table).select('id').limit(1);
      if (error && error.code === '42P01') {
        logFail(`Table missing: ${table}`);
      } else {
        logPass(`Table exists: ${table}`);
      }
    }

    // 2. API Endpoint Audit
    console.log('\n--- API Routes Audit ---');
    const routesContent = fs.readFileSync(path.join(SERVER_DIR, 'routes', 'community.js'), 'utf-8');
    for (const route of REQUIRED_ROUTES) {
      if (routesContent.includes(`"${route}"`) || routesContent.includes(`'${route}'`)) {
        logPass(`Route registered: ${route}`);
      } else {
        logFail(`Route missing: ${route}`);
      }
    }

    // 3. WebSocket Event Audit
    console.log('\n--- WebSocket Gateway Audit ---');
    const wsContent = fs.readFileSync(path.join(ROOT_DIR, 'realtime-gateway', 'events', 'community.js'), 'utf-8');
    for (const event of REQUIRED_WS_EVENTS) {
      if (wsContent.includes(event)) {
        logPass(`WebSocket event registered: ${event}`);
      } else {
        logFail(`WebSocket event missing: ${event}`);
      }
    }

    // 4. Static Codebase Checks
    console.log('\n--- Codebase Quality Audit ---');
    const searchTerms = [
      { term: 'TODO', desc: 'No TODOs remaining' },
      { term: 'Coming Soon', desc: 'No "Coming Soon" text' },
      {
        term: 'console.error',
        desc: 'No unclassified console.error() calls',
        // Allowed in: ErrorBoundary classes, plugin sandboxes, fatal init failures
        whitelistedFiles: [
          'PluginErrorBoundary.tsx',
          'RegistryHealth.ts',
          'ContentResolver.tsx',
        ]
      },
      { term: 'mockData', desc: 'No mock data arrays' },
      { term: 'dummy', desc: 'No dummy data placeholders' },
    ];

    const dirsToSearch = [
      path.join(CLIENT_DIR, 'src', 'components', 'community'),
      path.join(CLIENT_DIR, 'src', 'pages', 'dashboard', 'Feed.tsx'),
      path.join(CLIENT_DIR, 'src', 'pages', 'dashboard', 'Space.tsx'),
      path.join(CLIENT_DIR, 'src', 'services', 'communityService.ts'),
      path.join(CLIENT_DIR, 'src', 'hooks', 'useCommunityFeed.ts'),
      path.join(SERVER_DIR, 'controllers', 'communityController.js'),
    ];

    let allFiles = [];
    dirsToSearch.forEach(dir => {
      if (fs.existsSync(dir)) {
        if (fs.statSync(dir).isDirectory()) {
          allFiles = allFiles.concat(readFilesRecursively(dir));
        } else {
          allFiles.push(dir);
        }
      }
    });

    for (const { term, desc, ignoreList, whitelistedFiles } of searchTerms) {
      let found = false;
      for (const file of allFiles) {
        if (file.includes('community_audit.js')) continue;
        // Skip whitelisted files for this specific term
        if (whitelistedFiles && whitelistedFiles.some(wf => file.endsWith(wf))) continue;
        const content = fs.readFileSync(file, 'utf-8');
        if (content.includes(term)) {
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            if (line.includes(term)) {
              let ignored = false;
              if (ignoreList) {
                for (const ignore of ignoreList) {
                  if (line.includes(ignore)) { ignored = true; break; }
                }
              }
              if (!ignored) {
                logFail(`Found "${term}" in ${file}:${index + 1}\n  -> ${line.trim()}`);
                found = true;
              }
            }
          });
        }
      }
      if (!found) {
        logPass(desc);
      }
    }

    console.log('\n--- Summary ---');
    if (hasErrors) {
      console.log('🚨 Audit finished with errors. Please fix the issues above.');
      process.exit(1);
    } else {
      console.log('🎉 Audit passed perfectly! The Community module is production-ready.');
      process.exit(0);
    }
  } catch (err) {
    console.error('Audit script failed to execute properly:', err);
    process.exit(1);
  }
}

runAudit();
