# OVERALL PRODUCT OVERVIEW

## App Type
SaaS Web Application

### Core Features:
- Multi-user note taking
- Secure login & signup
- Username-based note sharing
- Payments (subscriptions)
- Dashboard-only access (no URL bypass)
- Dark mode + glassmorphism UI
- Fintech-style multi-section landing page

## 2. TECH STACK (RECOMMENDED)

### Frontend
- Vite + React
- TypeScript
- Tailwind CSS (dark mode & glassmorphism)
- React Router
- Zustand or Context API (state)
- Axios
- Framer Motion (animations)

### Backend
- Node.js
- Express.js
- JWT Authentication
- Supabase Auth (recommended)
- Stripe (payments)

### Database
- PostgreSQL (Supabase)
- Row-level security (RLS)
- Indexed tables for performance

### Hosting
- Frontend: Vercel / Netlify
- Backend: Render / Railway
- Database: Supabase

## 3. SYSTEM ARCHITECTURE
Client (React)
   ↓
API Gateway (Express)
   ↓
Auth (Supabase Auth + JWT)
   ↓
Database (PostgreSQL)
   ↓
Storage (Supabase Storage)
   ↓
Payments (Stripe)

## 4. LANDING PAGE (FINTECH STYLE)

### Sections (Multi-Section Layout)
- **Hero Section**
  - Headline
  - Call-to-Action (Get Started)
  - Background blur + gradient
  - Glass card overlay
- **Features Section**
  - Secure Notes
  - Cloud Sync
  - Team Sharing
  - End-to-End Encryption (future)
- **How It Works**
  - Signup
  - Create Notes
  - Share
  - Upgrade Plan
- **Pricing Section**
  - Free Plan
  - Pro Plan
  - Team Plan
- **Security Section**
  - Encryption
  - Secure Payments
  - GDPR-like compliance
- **Testimonials**
  - Animated cards
- **Footer**
  - Links
  - Socials
  - Legal

### Design System
- Dark Mode First
- Glassmorphism
  - `backdrop-filter: blur(16px);`
  - `background: rgba(255,255,255,0.05);`
  - `border: 1px solid rgba(255,255,255,0.1);`

## 5. AUTHENTICATION FLOW (SECURE)

### Signup Flow
- User enters email + password
- Supabase creates auth user
- Prompt for username
- If skipped → auto-generate from email
- Save username in profiles table
- Redirect to dashboard

### Login Flow
- Email + password
- JWT stored securely
- Dashboard access only

### Route Protection
- Use Protected Routes
- Verify JWT on backend
- Redirect unauthorized users

## 6. DASHBOARD STRUCTURE
`/dashboard`
 ├── notes
 ├── shared
 ├── search
 ├── account
 ├── billing
 └── settings

### Features
- Create / Edit / Delete notes
- Markdown support
- Autosave
- Tags & folders
- Search
- Share via username

## 7. NOTE SHARING SYSTEM

### Sharing Logic
- User enters recipient username
- Backend verifies username
- Create record in shared_notes table

### Permissions
- Read only
- Read + edit
- Revoke access anytime

## 8. DATABASE DESIGN (IMPORTANT)

### Users Profile Table (`profiles`)
- id (uuid)
- username (unique)
- email
- created_at

### Notes Table (`notes`)
- id
- owner_id
- title
- content
- updated_at
- is_private

### Shared Notes (`shared_notes`)
- id
- note_id
- shared_with
- permission

### Payments (`subscriptions`)
- user_id
- plan
- status
- stripe_customer_id

### Performance
- Index user_id & note_id
- Enable Row Level Security (RLS)

## 9. PAYMENTS (STRIPE)

### Plans
- Free: limited notes
- Pro: unlimited
- Team: collaboration

### Payment Flow
- User selects plan
- Redirect to Stripe Checkout
- Stripe webhook confirms payment
- Update subscription table
- Unlock features

## 10. SECURITY BEST PRACTICES
- JWT expiry
- HTTPS only
- Rate limiting
- SQL injection protection
- RLS policies in Supabase
- No client-side trust

## 11. UI/UX DESIGN PRINCIPLES
- Minimal navigation
- Floating action button (Add note)
- Glass cards
- Smooth animations
- System dark mode support

## 12. FOLDER STRUCTURE

### Frontend
`src/`
 ├── components/
 ├── pages/
 ├── hooks/
 ├── services/
 ├── context/
 ├── styles/
 └── utils/

### Backend
`server/`
 ├── routes/
 ├── controllers/
 ├── middleware/
 ├── services/
 ├── utils/
 └── index.js

## 13. DEPLOYMENT PIPELINE
- GitHub Repo
- Frontend → Vercel
- Backend → Render
- Database → Supabase
- Payments → Stripe
- Domain + SSL

## 14. SCALABILITY (FUTURE)
- Real-time collaboration
- Offline support
- Mobile app (React Native)
- AI note summarization
- Role-based teams
