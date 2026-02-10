# Note Standard

A secure, fintech-style SaaS note-taking application.

## Project Structure

- `client/`: React + Vite + Tailwind CSS
- `server/`: Node.js + Express + Supabase

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   npm run install:all
   ```

2. **Environment Setup**
   - **Client**: Update `client/.env` (if needed)
   - **Server**: Update `server/.env` with your Supabase credentials:
     ```env
     SUPABASE_URL=...
     SUPABASE_KEY=...
     STRIPE_SECRET_KEY=...
     ```

3. **Run Application**
   ```bash
   npm run dev
   ```
   - Client: http://localhost:5173
   - Server: http://localhost:5000

## Features
- Secure Authentication (Supabase)
- Real-time DB (PostgreSQL)
- Glassmorphism UI
- Stripe Payments (In Progress)
