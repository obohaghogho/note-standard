# Safe API Call Pattern - Fail-Safe Implementation Guide

## Overview

This document provides the standard pattern for making fail-safe API calls in
the React app. All async operations should follow this pattern to ensure errors
never crash the UI.

## ✅ Safe API Call Pattern

```typescript
import { toast } from "react-hot-toast";
import { useState } from "react";

export const SafeComponent = () => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const fetchData = async () => {
    // Guard against duplicate calls
    if (loading) return;

    setLoading(true);

    try {
      const response = await fetch("/api/endpoint");

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);

      toast.success("Data loaded successfully");
    } catch (error: any) {
      console.error("Error fetching data:", error);

      // Handle specific error types
      if (
        error.message?.includes("429") || error.message?.includes("rate limit")
      ) {
        toast.error("Too many requests. Please wait a moment.");
      } else if (
        error.message?.includes("network") ||
        error.message?.includes("Failed to fetch")
      ) {
        toast.error("Network error. Please check your connection.");
      } else if (
        error.message?.includes("401") || error.message?.includes("auth")
      ) {
        toast.error("Authentication error. Please log in again.");
      } else {
        toast.error(error.message || "Failed to load data");
      }
    } finally {
      // ALWAYS reset loading state
      setLoading(false);
    }
  };

  return null; // Component UI
};
```

## ✅ Safe Supabase Call Pattern

```typescript
import { supabase } from "../lib/supabase";
import { toast } from "react-hot-toast";
import { useState } from "react";

export const SafeSupabaseComponent = () => {
  const [loading, setLoading] = useState(false);

  const fetchNotes = async () => {
    if (loading) return;

    setLoading(true);

    try {
      const { data, error } = await supabase
        .from("notes")
        .select("*");

      if (error) throw error;

      // Process data
      console.log("Notes loaded:", data);
      toast.success("Notes loaded");
    } catch (error: any) {
      console.error("Supabase error:", error);

      // Handle Supabase-specific errors
      if (error.code === "429" || error.message?.includes("rate limit")) {
        toast.error("Rate limit exceeded. Please wait.");
      } else if (error.code === "PGRST116") {
        toast.error("No data found");
      } else if (error.message?.includes("JWT")) {
        toast.error("Session expired. Please log in again.");
      } else {
        toast.error(error.message || "Failed to load notes");
      }
    } finally {
      setLoading(false);
    }
  };

  return null; // Component UI
};
```

## ✅ Safe Form Submission Pattern

```typescript
import { toast } from "react-hot-toast";
import { useState } from "react";

export const SafeForm = () => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", email: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Guard against duplicate submissions
    if (loading) return;

    // Validate
    if (!formData.name || !formData.email) {
      toast.error("Please fill all fields");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Submission failed");
      }

      const result = await response.json();

      toast.success("Form submitted successfully");

      // Reset form
      setFormData({ name: "", email: "" });
    } catch (error: any) {
      console.error("Form submission error:", error);
      toast.error(error.message || "Failed to submit form");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Form fields */}
      <button type="submit" disabled={loading}>
        {loading ? "Submitting..." : "Submit"}
      </button>
    </form>
  );
};
```

## ❌ Common Mistakes to Avoid

### 1. Missing try/catch

```typescript
// ❌ BAD - Uncaught errors will crash the app
const fetchData = async () => {
  const data = await fetch("/api/endpoint");
  return data.json();
};

// ✅ GOOD
const fetchData = async () => {
  try {
    const data = await fetch("/api/endpoint");
    return data.json();
  } catch (error) {
    console.error(error);
    toast.error("Failed to fetch data");
    return null;
  }
};
```

### 2. Missing finally block

```typescript
// ❌ BAD - Loading state won't reset on error
const fetchData = async () => {
  setLoading(true);
  try {
    const data = await fetch("/api/endpoint");
    setLoading(false);
  } catch (error) {
    // Loading never gets reset!
  }
};

// ✅ GOOD
const fetchData = async () => {
  setLoading(true);
  try {
    const data = await fetch("/api/endpoint");
  } catch (error) {
    console.error(error);
  } finally {
    setLoading(false); // ALWAYS runs
  }
};
```

### 3. Using alert() instead of toast

```typescript
// ❌ BAD - alert() blocks UI and looks unprofessional
catch (error) {
    alert(error.message);
}

// ✅ GOOD
catch (error) {
    toast.error(error.message);
}
```

### 4. No loading guard

```typescript
// ❌ BAD - Can trigger multiple requests
const handleClick = async () => {
  setLoading(true);
  await fetch("/api/endpoint");
  setLoading(false);
};

// ✅ GOOD
const handleClick = async () => {
  if (loading) return; // Guard
  setLoading(true);
  try {
    await fetch("/api/endpoint");
  } finally {
    setLoading(false);
  }
};
```

## Error Handling Checklist

- [ ] All async functions wrapped in try/catch
- [ ] finally block resets loading state
- [ ] Errors logged to console
- [ ] User-friendly toast messages shown
- [ ] Loading guard prevents duplicate calls
- [ ] No alert() usage anywhere
- [ ] Button disabled during loading
- [ ] Specific error types handled (429, network, auth)
- [ ] Component never throws uncaught errors

## Testing Error Scenarios

Test your components with these scenarios:

1. **Network Errors**: Disconnect internet
2. **Rate Limits**: Make rapid requests
3. **Auth Errors**: Expire session
4. **Validation Errors**: Submit invalid data
5. **Timeout**: Use slow network throttling

In all cases, the app should:

- ✅ Show toast error
- ✅ Log to console
- ✅ Continue rendering
- ✅ Never show blank screen
