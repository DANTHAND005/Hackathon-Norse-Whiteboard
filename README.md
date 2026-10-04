# Norse Whiteboard

An AI study whiteboard for NKU students. Upload notes, slides or PDFs, draw on them together, and ask the AI tutor about anything you circle. Find classmates through sticky notes on a community cork board, meet up, and message each other.

**Live site:** https://danthand005.github.io/Hackathon-Norse-Whiteboard/#/login

## What it does

- **Whiteboard:** Excalidraw canvas with uploads (images and PDFs), live drawing with other people, Ask AI on a selection, and "Teach me this page" lessons that draw and speak.
- **Community:** a cork board of sticky notes (meetups, live boards, saved boards) filtered by your classes. Create, join and leave, with live counts.
- **Messages:** one-on-one chats and meetup group chats, with Block and Report.
- **Profile and Settings:** display name, which tags others can see, ghost mode, tutor voice, Canvas re-import, password, blocked people.

## Documentation

- [**Setup guide**: run it, or build the whole backend from scratch](docs/SETUP.md)
- [Architecture, data flow and live updates (with UML diagrams)](docs/ARCHITECTURE.md)
- [Build spec](CLAUDE.md)

## Quick start

1. Install Node.js and Git, then:
   ```
   git clone https://github.com/DANTHAND005/Hackathon-Norse-Whiteboard.git
   cd Hackathon-Norse-Whiteboard
   npm install
   ```
2. Create your private `.env` file from the template:
   - Windows PowerShell: `Copy-Item .env.example .env`
   - Mac or Linux: `cp .env.example .env`
3. Open `.env` and fill in both lines (ask a teammate privately for the key):
   ```
   VITE_SUPABASE_URL=https://hiuzbgdqurtatffvsdui.supabase.co
   VITE_SUPABASE_ANON_KEY=<publishable key>
   ```
4. `npm run dev`, then open http://localhost:5173/norse-whiteboard/#/login

Getting "Failed to fetch" on sign in? Your `.env` is missing (it is never committed). Create it, then stop and restart `npm run dev`.

## Where the keys go

| Key | Goes in | Public? |
|---|---|---|
| Supabase URL and **publishable** key | `.env` on your computer, and the two GitHub Actions secrets for the live site | yes, safe (database rules protect the data) |
| **Gemini API key** | Supabase Edge Function secret only (`npx supabase secrets set GEMINI_API_KEY=...`) | **no, never in code, `.env` or GitHub** |
| Canvas address | Supabase Edge Function secret `CANVAS_BASE_URL` | keep with the secrets |
| A student's Canvas token | typed into the page once, never stored | never share |

The `.env` file is git-ignored, so keys never reach GitHub. Never use Supabase's `service_role` or secret key anywhere. Full details, backend setup from nothing (database, sign-in settings, server functions, deploy) and troubleshooting are in the [setup guide](docs/SETUP.md).

## Project layout

```
src/
  pages/        Login, Reset, Onboarding, Whiteboard, Community, Profile, Settings
  components/   StickyNote, CreateNoteForm, Messages, ChatView, PersonPopup, ChatHistory, LessonControls
  lib/          supabase client, auth, useLesson, useMessages, voice, files, tags
supabase/
  migrations/   database schema, rules, triggers (run in order)
  functions/    Edge Functions: canvas-import, ai-ask, ai-lesson, ai-redirect
docs/
  ARCHITECTURE.md   how everything fits together
  images/           mockups and sketches
.github/workflows/  deploy to GitHub Pages
```

## Stack

React + Vite, Excalidraw, pdf.js, Supabase (Postgres, Auth, Storage, Realtime, Edge Functions), Google Gemini, Web Speech API, GitHub Pages.

## Mockups

![Whiteboard screen](docs/images/mockup-whiteboardv2.png)

![Find your people screen](docs/images/mockup-community.png)

## Original sketches

![Whiteboard sketch](docs/images/sketch-whiteboard.jpg)

![Community sketch](docs/images/sketch-community.jpg)

![Profile and settings sketch](docs/images/sketch-profile-settings.jpg)
