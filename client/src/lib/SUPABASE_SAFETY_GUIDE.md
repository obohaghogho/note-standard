# Supabase Safety System Guide

## Overview

This guide explains how to safely interact with Supabase in a way that **never
crashes the UI**, even when:

- Tables don't exist
- Network errors occur
- Rate limits are hit
- Concurrent requests happen

All functions in `supabaseSafe.ts` implement:

1. ✅ **Rate limiting & Cooldowns** - Prevents spam requests
2. ✅ **In-Flight Protection** - Prevents duplicate concurrent requests
3. ✅ **Error Handling** - Catches all errors, returns safe defaults
4. ✅ **Table Fallbacks** - Automatically tries backup tables
5. ✅ **Developer Feedback** - Toast notifications for warnings
6. ✅ **TypeScript Safety** - Fully typed with generics

---

## Core Functions

### 1. `safeCall<T>` - Generic Safe Wrapper

Wraps any async function with rate limiting, error handling, and optional
fallback values.

```typescript
const result = await safeCall<User[]>(
  "fetch-users", // Unique key for rate limiting
  async () => { // Your async function
    return await fetchUsers();
  },
  1000, // Cooldown in ms (default: 500)
  [], // Fallback value if error/cooldown (default: null)
);
```

**Features:**

- Prevents calling same key within `cooldown` period
- Returns `fallback` value on error or during cooldown
- Logs all errors to console
- Shows toast notification on errors

---

### 2. `safeTableQuery<T>` - Query with Table Fallback

Queries a Supabase table with automatic fallback to a secondary table if the
primary doesn't exist.

```typescript
const stats = await safeTableQuery<DashboardStat[]>(
  "dashboard_stats", // Primary table
  "daily_stats", // Fallback table (or null for no fallback)
  (table) => table.select("*").limit(10), // Query builder
  [], // Default value on all errors
);
```

**Features:**

- Detects missing tables (PostgreSQL error code `42P01`)
- Automatically tries fallback table
- Shows developer toast when fallback occurs
- Returns default value if both tables fail
- Never throws errors

**Use Cases:**

- Dashboard stats with multiple table versions
- Migration scenarios (old_table → new_table)
- Multi-tenant systems with varying schemas

---

## Predefined Safe Functions

### Auth

```typescript
const session = await safeAuth();
// Returns: Session | null
// Cooldown: 500ms
```

### Profile

```typescript
const profile = await safeProfile(userId);
// Returns: Profile | null
// Cooldown: 500ms
// Uses: maybeSingle() for safe single-row queries
```

### Subscription

```typescript
const subscription = await safeSubscription(userId);
// Returns: Subscription | null
// Cooldown: 500ms
```

### Dashboard Stats (with Fallback)

```typescript
const stats = await safeDashboardStats();
// Returns: DashboardStat[] (never null!)
// Cooldown: 1000ms
// Fallback: dashboard_stats → daily_stats → []
```

### Billing

```typescript
const billing = await safeBilling(userId);
// Returns: BillingInfo | null
// Cooldown: 500ms
```

---

## Generic Wrapper for Dynamic Operations

For one-off operations like Login, Signup, or custom API calls:

```typescript
const result = await supabaseSafe<AuthResponse>(
  "auth-login",
  async () => {
    return await supabase.auth.signInWithPassword({ email, password });
  },
  2000, // Custom cooldown
);
```

**Auto-Unwraps Supabase Responses:**

```typescript
// If your function returns { data, error }:
const data = await supabaseSafe("update-profile", async () => {
  return await supabase.from("profiles").update({ name }).eq("id", userId);
});
// `data` is already unwrapped, no need to check .data or .error
```

---

## WebSocket Safety

```typescript
const ws = createSafeWebSocket(
  "ws://localhost:5000/socket",
  () => console.log("Connected"), // onOpen
  (data) => handleMessage(data), // onMessage
  3, // maxRetries (default: 3)
  1000, // retryDelay (default: 1000ms)
);

// Later:
ws.send("Hello");
ws.close();
```

**Features:**

- Exponential backoff retries (1s, 2s, 4s...)
- Auto-reconnect on disconnect
- Graceful error handling
- Clean API with `.send()` and `.close()`

---

## Usage Patterns

### Pattern 1: Simple Data Fetch

```typescript
useEffect(() => {
  const load = async () => {
    const profile = await safeProfile(user.id);
    if (profile) setProfile(profile);
  };
  load();
}, [user]);
```

### Pattern 2: Component-Level Guard (Optional)

```typescript
const fetchRef = useRef(false);

const fetchData = async () => {
  if (fetchRef.current) return;
  fetchRef.current = true;

  try {
    const data = await safeProfile(user.id);
    setProfile(data);
  } finally {
    fetchRef.current = false;
  }
};
```

**Note:** Component-level guards are optional since `safeCall` already has
built-in rate limiting. Add them only if you need extra protection during React
Strict Mode.

### Pattern 3: Custom Table with Fallback

```typescript
export async function safeUserActivity(userId: string): Promise<Activity[]> {
  const result = await safeCall<Activity[]>(
    `user-activity-${userId}`,
    async () => {
      return await safeTableQuery<Activity[]>(
        "user_activity_v2", // Prefer new table
        "user_activity", // Fallback to old table
        (table) =>
          table.select("*").eq("user_id", userId).order("created_at", {
            ascending: false,
          }),
        [],
      );
    },
    2000, // 2 second cooldown
    [], // Empty array on error
  );

  return result || [];
}
```

---

## Error Handling Strategy

### Never Crash the UI

All functions return safe defaults:

- Arrays: `[]`
- Objects: `null`
- Booleans: `false`

### Developer Feedback

Errors are logged in 3 levels:

1. **Console Error** - Full error details for debugging
2. **Toast Warning** - User-friendly message for fallbacks
3. **Toast Error** - Critical errors (rate limits, network issues)

### Cooldown Behavior

When a function is in cooldown:

- Returns the `fallback` value immediately
- Logs warning to console (throttled to avoid spam)
- Does NOT show toast to user (avoid UI noise)

---

## Best Practices

### ✅ DO

```typescript
// Use predefined safe functions when available
const profile = await safeProfile(userId);

// Always provide sensible fallback values
const stats = await safeDashboardStats(); // Returns [] on error

// Use safeTableQuery for tables that might not exist
const data = await safeTableQuery(
  "new_table",
  "old_table",
  (t) => t.select("*"),
  [],
);
```

### ❌ DON'T

```typescript
// Don't call Supabase directly in components
const { data } = await supabase.from('profiles').select('*'); // NO!

// Don't use .single() - use .maybeSingle()
.single()      // ❌ Throws error if no row
.maybeSingle() // ✅ Returns null if no row

// Don't ignore cooldown warnings
if (cooldownPassed) await safeProfile(userId); // ❌ Trust the system
await safeProfile(userId);                     // ✅ Let safeCall handle it
```

---

## Migration Guide

### Before (Unsafe)

```typescript
const { data, error } = await supabase.from("profiles").select("*").eq(
  "id",
  userId,
).single();
if (error) {
  console.error(error);
  toast.error("Failed to load profile");
  return;
}
setProfile(data);
```

### After (Safe)

```typescript
const profile = await safeProfile(userId);
if (profile) setProfile(profile);
// That's it! All error handling, rate limiting, and fallbacks are automatic.
```

---

## Troubleshooting

### "Skipping (Cooling Down)" in console

**Cause:** Function called too quickly after previous call.

**Fix:** This is expected behavior! The cooldown prevents spam. If you need the
data immediately, increase the cooldown time or use a different key.

### Table fallback toast keeps appearing

**Cause:** Primary table doesn't exist in your Supabase schema.

**Fix:**

1. Create the missing table, OR
2. Update the function to use the correct table name, OR
3. Accept the fallback (it's working as designed!)

### Data is always `null` or `[]`

**Cause:** Either table is empty, query is wrong, or user lacks RLS permissions.

**Fix:**

1. Check Supabase RLS policies
2. Verify table has data
3. Check console for error logs
4. Test query in Supabase SQL editor

---

## Advanced: Creating Custom Safe Functions

```typescript
export interface CustomData {
  id: string;
  value: string;
}

export async function safeCustomData(
  userId: string,
  includeArchived = false,
): Promise<CustomData[]> {
  return safeCall<CustomData[]>(
    `custom-data-${userId}-${includeArchived}`, // Unique key
    async () => {
      return await safeTableQuery<CustomData[]>(
        "custom_data_v3",
        "custom_data_v2",
        (table) => {
          let query = table.select("*").eq("user_id", userId);
          if (!includeArchived) {
            query = query.eq("archived", false);
          }
          return query.order("created_at", { ascending: false });
        },
        [],
      );
    },
    2000, // 2 second cooldown
    [], // Empty array fallback
  ) || [];
}
```

---

## Summary

**The Supabase Safety System ensures:**

1. UI never crashes from database errors
2. Users see graceful loading states, not error screens
3. Developers get clear feedback in console and toasts
4. Rate limits and cooldowns prevent API abuse
5. Table migrations are seamless with automatic fallbacks

**Remember:** Trust the system. All error handling, retries, and fallbacks are
built-in. Just call the safe functions and focus on your UI logic! 🎉
