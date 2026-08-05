# NoteStandard Enterprise Feedback & Issue Tracking System Architecture

## System Overview

The Enterprise Feedback & Issue Tracking System is a mission-critical subsystem integrated directly into NoteStandard's Express backend and React 19 / TypeScript frontend. It handles user feedback, automated crash reporting, diagnostic telemetry harvesting, AI-assisted triage, release health metrics, and third-party integration connectors.

```mermaid
flowchart TD
    subgraph Client["Client Tier (React 19 + TypeScript)"]
        UI["EnterpriseFeedbackModal.tsx"]
        Tracker["UserIssueTracker.tsx"]
        Collector["feedbackCollector.ts"]
        Replay["crashReplayRecorder.ts"]
        AIHelper["aiFeedbackAssistant.ts"]
        Store["Zustand Store (useFeedbackStore)"]
        Queue["IndexedDB / LocalStorage Offline Queue"]
    end

    subgraph API["Backend API Tier (Express 5)"]
        Router["/api/v1/feedback Routes"]
        RateLimit["Rate Limiter Middleware"]
        Sanitizer["DOMPurify XSS Sanitizer"]
        Controller["feedbackController.js"]
        Service["feedbackService.js"]
        Connectors["feedbackConnectors.js"]
    end

    subgraph Data["Data & Storage Tier (Supabase / Postgres)"]
        DB[(PostgreSQL Database)]
        RLS["Row Level Security Policies"]
        Storage["Supabase Storage Buckets"]
    end

    subgraph External["External Integrations"]
        Slack["Slack Webhooks"]
        Discord["Discord Webhooks"]
        GitHub["GitHub Issues API"]
        Linear["Linear GraphQL API"]
        Sentry["Sentry Error Bridge"]
    end

    UI --> Collector
    UI --> Replay
    UI --> AIHelper
    UI --> Store
    Collector --> Router
    Queue -.->|Auto Sync when Online| Router

    Router --> RateLimit
    RateLimit --> Sanitizer
    Sanitizer --> Controller
    Controller --> Service
    Controller --> Connectors

    Service --> DB
    Service --> RLS
    Service --> Storage

    Connectors --> Slack
    Connectors --> Discord
    Connectors --> GitHub
    Connectors --> Linear
    Connectors --> Sentry
```

---

## Database Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    PROFILES ||--o{ FEEDBACK_REPORTS : "submits / assigned to"
    FEEDBACK_CATEGORIES ||--o{ FEEDBACK_REPORTS : "categorizes"
    FEEDBACK_REPORTS ||--|| FEEDBACK_RATINGS : "contains"
    FEEDBACK_REPORTS ||--|| FEEDBACK_TELEMETRY : "captures"
    FEEDBACK_REPORTS ||--o{ FEEDBACK_ATTACHMENTS : "includes"
    FEEDBACK_REPORTS ||--o{ FEEDBACK_COMMENTS : "has"
    FEEDBACK_REPORTS ||--o{ FEEDBACK_AUDIT_LOGS : "logs"
    FEEDBACK_REPORTS ||--|| FEEDBACK_CRASH_REPLAYS : "records"
    FEEDBACK_REPORTS ||--o| FEEDBACK_POSTMORTEMS : "archives"

    FEEDBACK_REPORTS {
        uuid id PK
        int report_number UK
        uuid user_id FK
        text category_id FK
        text type
        text priority
        text status
        text roadmap_status
        text title
        text description
        numeric spam_score
        uuid assigned_to FK
        timestamptz created_at
    }

    FEEDBACK_TELEMETRY {
        uuid id PK
        uuid report_id FK
        text app_version
        text device_model
        text screen_resolution
        text operating_system
        text browser_name
        jsonb wallet_context
        jsonb chat_context
        text error_message
        text stack_trace
    }

    FEEDBACK_CRASH_REPLAYS {
        uuid id PK
        uuid report_id FK
        text session_id
        jsonb breadcrumbs
        int total_events
    }

    FEEDBACK_POSTMORTEMS {
        uuid id PK
        uuid report_id FK
        text root_cause
        text solution
    }
```

---

## Security & Data Redaction Layer

```mermaid
sequenceDiagram
    participant User as User Browser
    participant Collector as feedbackCollector.ts
    participant API as Express API
    participant DB as Postgres DB

    User->>Collector: Submit Feedback / Trigger Error
    Note over Collector: Intercepts Telemetry & Console Logs
    Collector->>Collector: Execute sanitizeSensitiveData()
    Note over Collector: Redacts Bearer JWTs, Passwords,<br/>Credit Card numbers, PINs
    Collector->>API: Send Clean Payload
    API->>API: DOMPurify XSS Filter & Honeypot Check
    API->>DB: Insert into feedback_reports & telemetry
    DB-->>API: Insertion OK
    API-->>User: HTTP 201 Created
```
