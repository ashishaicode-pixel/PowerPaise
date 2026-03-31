# ⚡ PowerPaise — Community Edition

A mobile-first energy monitoring web app built with React + Vite + Supabase.
Track live power consumption, get AI-powered tips, view monthly reports, and engage with the community.

## 🚀 Live Demo

Deployed on Vercel — [View App](#)

## ✨ Features

- 📊 **Dashboard** — Real-time power usage, bill meter, appliance breakdown
- 🔴 **Live Data Monitor** — Supabase-powered live readings with sparkline charts
- 🤖 **AI Tips** — Personalized energy-saving recommendations
- 👥 **Community** — Share and compare with other users
- 📅 **Monthly Report** — Detailed usage and cost breakdown

## 🛠️ Tech Stack

- **React 18** + **TypeScript**
- **Vite 6** — Fast build tooling
- **Tailwind CSS v4** — Utility-first styling
- **Supabase** — Real-time database backend
- **React Router v7** — Client-side routing
- **Recharts / Radix UI / MUI** — UI components & charts
- **Motion (Framer)** — Animations

## 🏃 Running Locally

1. Clone the repo
2. Copy `.env.example` to `.env` and fill in your Supabase credentials:
   ```
   VITE_SUPABASE_PROJECT_ID=your_project_id
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the dev server:
   ```bash
   npm run dev
   ```

## 🚀 Deploying to Vercel

1. Push this repo to GitHub
2. Import the repo in [Vercel](https://vercel.com/)
3. Add environment variables in Vercel project settings:
   - `VITE_SUPABASE_PROJECT_ID`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy — Vercel auto-detects Vite and builds with `npm run build`

## 🔐 Security

- Supabase credentials are stored in `.env` (git-ignored)
- Only the **public anon key** is used (safe for client-side)
- Never commit `.env` to version control

## 📄 License

MIT