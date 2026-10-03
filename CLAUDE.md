# Norse Whiteboard: Build Spec

This file is the source of truth for building Norse Whiteboard. Read all of it before writing code. Build only what is in scope; the Stretch section at the end is for awareness, not for building now.

---

## 1. What we are building

Norse Whiteboard is an AI study whiteboard for Northern Kentucky University (NKU) students, built for a hackathon with the theme **#community**.

- Students upload notes, slides, PDFs or images onto a shared whiteboard.
- An AI tutor explains anything they circle or ask about, and can teach a page step by step, drawing on the board and speaking out loud.
- If a student writes on the board mid-lesson, the AI pauses, reads what they wrote, and redirects the lesson to their confusion.
- Students find each other by class tags (imported from Canvas), study on the same board live, post in-person meetups as sticky notes, and message each other.

**Community hook:** people who already took a class can find and help people taking it now, and every study session leaves a saved board behind for the next group.

---

## 2. Rules for building

1. Follow the build order in section 12. Finish and check each milestone before starting the next.
2. Do not build anything in section 15 (Stretch).
3. Keep it simple. No extra libraries beyond the stack below unless a feature cannot work without one. No abstractions with a single use.
4. Secrets never go in client code. Gemini key and any Canvas token handling live only in Supabase Edge Functions.
5. All database access is protected by Row Level Security. Never rely on the client to enforce permissions.
6. Every page must work at phone width (360px) and desktop.
7. Match the design system in section 6 and the reference images in section 7.

---

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Frontend | React + Vite (JavaScript or TypeScript) | Single page app |
| Routing | React Router with `HashRouter` | Hash routes avoid 404s on GitHub Pages refresh |
| Whiteboard | `@excalidraw/excalidraw` | Drawing tools, images, export to PNG |
| PDF rendering | `pdfjs-dist` | Render each page to an image |
| Backend | Supabase (free tier) | Postgres, Auth, Storage, Realtime, Edge Functions |
| AI | Google Gemini Flash (free tier, current Flash model in AI Studio) | Called only from Edge Functions; supports images, PDFs, JSON output |
| Voice | Browser Web Speech API (`speechSynthesis`) | Free, no key |
| Hosting | GitHub Pages via GitHub Actions | Repo: `THAND123/norse-whiteboard`, URL `https://thand123.github.io/norse-whiteboard/` |

Vite `base` must be `/norse-whiteboard/`. Deploy with a GitHub Actions workflow that builds and publishes `dist/` to Pages (switch Pages source to "GitHub Actions"). Keep the existing `docs/` folder as reference material only.

---

## 4. Architecture

```
Browser (React app on GitHub Pages)
  ├─ Supabase JS client (anon key, RLS enforced)
  │    ├─ Auth: email + password, @nku.edu only
  │    ├─ Postgres tables (section 8)
  │    ├─ Storage bucket: board-files
  │    └─ Realtime
  │         ├─ channel board:{id}   broadcast scene changes + lesson playback
  │         ├─ Postgres changes     messages, meetup_rsvps, meetups
  │         └─ presence via board_presence heartbeat table
  └─ Edge Functions (server side, hold secrets)
       ├─ ai-ask          image + question  -> answer text
       ├─ ai-lesson       page image        -> lesson steps JSON
       ├─ ai-redirect     board + student writing + lesson state -> new steps JSON
       └─ canvas-import   Canvas token      -> { taking: [], took: [] }
```

### Folder structure

```
/
├─ CLAUDE.md                 this spec
├─ README.md                 public project page
├─ docs/images/              reference sketches, mockups, logo
├─ index.html
├─ vite.config.js
├─ src/
│  ├─ main.jsx, App.jsx      routes + auth guard + bottom nav
│  ├─ lib/supabase.js        client from env vars
│  ├─ lib/voice.js           speech helpers
│  ├─ lib/tags.js            course code normalizer
│  ├─ pages/                 Login, Reset, Onboarding, Whiteboard, Community, Profile, Settings
│  ├─ components/            BoardSwitcher, ChatHistory, LessonControls, StickyNote,
│  │                         CreateNoteForm, Messages, ChatView, TagChip, PersonPopup
│  └─ styles.css             design tokens (section 6)
└─ supabase/
   ├─ migrations/            schema, RLS, triggers (section 8)
   ├─ seed.sql               demo data (section 13)
   └─ functions/             ai-ask, ai-lesson, ai-redirect, canvas-import
```

### Config

- Client env (`.env`, safe to expose): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Edge Function secrets: `GEMINI_API_KEY`, `CANVAS_BASE_URL` (NKU Canvas URL, confirm before building)
- Never use the `service_role` key in the client.
- Supabase Auth: email confirmation **off** for now.

---

## 5. Navigation and flow

```
Sign in ──(first time, no classes)──> Onboarding (Canvas import + tags) ──> Whiteboard
   │                                                                          ▲
   └──(returning user)─────────────────────────────────────────────────────────┘

Bottom nav (all signed-in pages): Whiteboard | Community | Profile
Profile ── gear button ──> Settings ── back ──> Profile
```

- Not signed in: every route redirects to Sign in.
- Signed in with empty `classes`: redirect to Onboarding.
- Signed in from Sign in page: go to Whiteboard.

---

## 6. Design system

**Theme:** yellow and white, marker-on-whiteboard feel. Clean, bold, friendly.

| Token | Value | Use |
|---|---|---|
| `--yellow` | `#FFC72C` | Primary buttons, highlights, active tags, card shadow |
| `--yellow-deep` | `#E5A800` | Link underlines, hover |
| `--ink` | `#17181C` | Text, borders, dark buttons |
| `--muted` | `#5E6068` | Secondary text |
| `--paper` | `#FFFFFF` | Cards, board |
| `--line` | `#E9E6DC` | Input borders, dividers |
| `--dots` | `#E4E0D2` | Dotted grid background |
| `--red` | `#D2452C` | Student annotations, errors |
| `--blue` | `#2F6F8F` | AI diagrams, secondary tags |
| `--green` | `#1F8A5B` | Live dot |

**Fonts (Google Fonts):** Bricolage Grotesque (headings, 700–800), IBM Plex Sans (body), Caveat (handwriting on the board).

**Components:**

- Cards: white, 2px ink border, 16–24px radius, offset yellow shadow `8px 8px 0 var(--yellow)` on hero cards.
- Primary button: yellow fill, 2px ink border, ink shadow `4px 4px 0`, presses down on click. Min height 44px.
- Inputs: 50px tall, 12px radius, 2px `--line` border, yellow focus ring.
- Tag chips: **Taking** = solid yellow; **Took** = outlined with a check (✓ CSC260).
- Background: white with dotted grid.
- Avatars: circle with initials from display name.
- Sticky notes (Community): pastel paper square with a pin at top, slight rotation (±1.5deg).
- Icons: simple stroke SVGs. No emoji in UI.
- Accessibility: real buttons/links/labels, text contrast 4.5:1, focus visible, `prefers-reduced-motion` respected.

---

## 7. Reference images

All in `docs/images/`. Use them for layout; this spec wins where they differ.

| File | What it shows |
|---|---|
| `nku-norse.png` | NKU Norse logo for the Sign in page |
| `sketch-whiteboard.jpg` | Hand sketch of the whiteboard page (desktop layout) |
| `sketch-screens.jpg` | Early sketch: whiteboard + "Find your people" screens |
| `sketch-community.jpg` | Community page: Find Your People grid, sticky note form, Messages with Block/Report |
| `sketch-profile-settings.jpg` | Settings and Profile pages side by side |
| `mockup-whiteboard.png` | Polished whiteboard mockup (top bar, tools, chat history, board, AI answer card) |
| `mockup-community.png` | Earlier phone mockup of community (style reference) |

`docs/login.html` is a working static prototype of the Sign in page. Port its look and behavior into the React Login page.

---

## 8. Data model

All tables have RLS enabled. "Signed in" means `auth.uid() is not null`.

### Tables

**profiles** (one row per user, created by trigger on sign-up)
- `id uuid pk references auth.users on delete cascade`
- `email text not null`
- `full_name text` (account name, private, edited in Settings)
- `display_name text` (public, 2–20 chars, default "First L.", edited in Profile)
- `classes text[] default '{}'` (Taking)
- `past_classes text[] default '{}'` (Took)
- `hidden_tags text[] default '{}'` (tags not shown to others)
- `ghost_mode boolean default false`
- `tutor_style text default 'quick'` check in (`quick`,`slow`,`meditation`,`rage`)
- `voice_speed numeric default 1` check in (1, 1.5, 2)
- `language text default 'en'`
- `message_privacy text default 'everyone'` check in (`everyone`,`classmates`)
- `last_board_id uuid`
- `created_at timestamptz default now()`
- RLS: any signed-in user can select; only owner can update. Other users must never see `full_name`, `email` or hidden tags: expose a `public_profiles` view with `id, display_name, visible classes, visible past_classes` and read others through it.

**boards**
- `id uuid pk`, `owner uuid references profiles`, `title text`, `class_tag text`, `is_public boolean default true`, `scene jsonb` (Excalidraw elements + appState subset), `created_at`, `updated_at`
- RLS: select if public or owner or has the link (public boards are readable by any signed-in user; private boards by owner and by anyone in `board_members`); update if signed in and can read (anyone on the board can draw); delete owner only.

**board_members** (people who opened a private board via link)
- `board_id`, `user_id`, pk(board_id, user_id)

**board_files**
- `id`, `board_id`, `storage_path`, `file_type` (`image`,`pdf_page`), `page_number`, `excalidraw_file_id`, `created_at`
- Storage bucket `board-files`, path `{board_id}/{uuid}.png`. Read/write if the user can read the board.

**board_presence** (heartbeat for "live" and "N here")
- `board_id`, `user_id`, `last_seen timestamptz`, pk(board_id, user_id)
- Client upserts every 20s while the board is open (skip if `ghost_mode`). A board is **live** if any row has `last_seen > now() - interval '60 seconds'`.

**questions** (AI chat history per board)
- `id`, `board_id`, `asked_by`, `question text`, `answer text`, `page_number int`, `anchor jsonb` (x, y on board for jump-to), `created_at`
- RLS: read/insert if user can read the board.

**meetups** (sticky notes)
- `id`, `created_by`, `class_tag`, `title`, `building text`, `room text`, `starts_at timestamptz`, `max_people int default 5 check (max_people between 2 and 10)`, `board_id uuid null`, `created_at`
- RLS: any signed-in user can select; insert as self; update/delete creator only.
- Hidden from the grid 2 hours after `starts_at`.

**meetup_rsvps**
- `meetup_id`, `user_id`, `created_at`, pk(meetup_id, user_id)
- Trigger: before insert, lock the meetup row and reject if count >= `max_people` (prevents two people taking the last spot).
- Trigger: on meetup insert, auto-RSVP the creator.

**conversations**
- `id`, `type` (`dm`,`meetup`), `meetup_id null`, `created_at`
- Trigger: on meetup insert, create its `meetup` conversation. On RSVP insert/delete, add/remove the member.

**conversation_members**
- `conversation_id`, `user_id`, `last_read_at`, pk
- RLS: select/update own rows; members can see the member list of their conversations.

**messages**
- `id`, `conversation_id`, `sender`, `body text`, `board_id uuid null` (shared board card), `created_at`
- RLS: select/insert only if the user is a member of the conversation and not blocked by the other party (DMs).
- DM creation goes through a SQL function `start_dm(other_user)` that checks `message_privacy` (classmates = share at least one class) and blocks, then returns the existing or new conversation.

**blocks**
- `blocker`, `blocked`, pk. Owner-only access.

**reports**
- `id`, `reporter`, `reported_user`, `message_id null`, `reason text`, `created_at`. Insert only.

### Auth triggers

- `handle_new_user` (after insert on `auth.users`): reject if email does not end in `@nku.edu`; insert `profiles` row with `full_name` from sign-up metadata and default `display_name` "First L.".

---

## 9. Pages

Each page lists layout, behavior and a "Done when" checklist.

### 9.1 Sign in

**Layout:** centered card on dotted background. Norse logo, then "Norse **Whiteboard**" with "Whiteboard" swiped by a yellow highlighter, tagline "Study together. Ask the board." Port from `docs/login.html`.

**Modes (same card, swap the form):**
1. Sign in: NKU email, password (show/hide eye), Forgot password link, Sign in button, "New here? Create an account".
2. Create account: account name, NKU email, password, confirm password, Create account button, "Have an account? Sign in".
3. Check your email: shown after a reset request, with Resend.
4. Reset password (`/reset` route, from email link): new password, confirm, Save.

**Rules:** @nku.edu only (client check for message, DB trigger is the real gate). Password min 8. Plain-English errors ("Wrong email or password", "Use your @nku.edu email", "That email already has an account", "Link expired, request a new one"). Button shows spinner and disables while waiting. Enter submits. Correct `autocomplete` attributes.

**Done when:**
- [ ] New NKU user signs up and lands on Onboarding.
- [ ] Gmail is rejected even if the form check is bypassed.
- [ ] Wrong password shows a clear error.
- [ ] Forgot password → email → reset page → new password → signed in.
- [ ] Refresh keeps the session.

### 9.2 Onboarding: classes from Canvas

**Layout:** one card. "What are you taking this semester?"

**Option A, Import from Canvas (main path):**
1. Button opens a short how-to: "In Canvas: Account → Settings → New Access Token, then paste it here."
2. Paste token → "Find my classes" → calls `canvas-import`.
3. Shows two groups of checked chips: **Taking now** and **Already took**. User unchecks anything that isn't a real class (orientation, advising shells).
4. "Let's go" saves `classes` and `past_classes`, then goes to Whiteboard.

**Option B, type them:** chip input; Enter adds a chip; × removes. Show popular tags from the DB to tap.

**Rules:** tags normalized to uppercase, no spaces (`ase 420` → `ASE420`). Max 8 Taking tags. Can't skip (needs at least one class). Token is never stored anywhere. Bad token → "That token didn't work. Try making a new one" and fall back to typing.

**Done when:**
- [ ] Real token imports real current and past classes.
- [ ] Bad token shows the error and manual entry still works.
- [ ] Token is not saved in DB, localStorage or logs.
- [ ] `ase 420` saves as `ASE420`.

### 9.3 Whiteboard (home)

**Layout (desktop, see `mockup-whiteboard.png` and `sketch-whiteboard.jpg`):**
- **Top bar:** `● Live · N here` + avatars (left), **Upload**, centered title + class tag (click to rename / change tag, with **board switcher** dropdown: my boards + "+ New board"), **Share** (copy link, public/private toggle), **Ask AI** (right).
- **Tools row:** pen, highlighter, eraser, lasso/select, text, shapes, colors (Excalidraw tools, restyled to theme). Right side: current file + "page 2 of 5".
- **Left panel, Chat history:** newest first; each entry shows who asked, which page, the question, the AI answer; click jumps the board to the anchor. Text box at the bottom: "Ask about the board".
- **Board:** Excalidraw canvas with dotted background. Page arrows (‹ 2/5 ›) bottom right when a PDF is loaded.
- **Lesson controls** (shown while a lesson plays): caption bar with the current sentence, Pause/Resume, Skip, Mute.
- **Bottom nav.**
- **Phone:** chat history becomes a slide-up drawer; tools row scrolls horizontally.

**Landing:** first visit opens a new blank board "My board" with hint "Upload notes or a PDF to get started". Later visits open `profiles.last_board_id`.

**Feature: Upload**
- Images (PNG/JPG) and PDFs up to 20 pages.
- PDF pages rendered with pdf.js to PNG, uploaded to Storage, added to the board as image elements laid out left to right like slides; page arrows scroll between them.
- Everyone on the board sees uploaded files (load from Storage by `board_files`).

**Feature: Ask AI**
- Three ways: (1) select/lasso an area then Ask AI, (2) Ask AI with nothing selected = whole visible area, (3) type in the chat panel.
- Client exports the selection or viewport to PNG (`exportToBlob`), sends image + question + tutor_style + language to `ai-ask`.
- Answer appears as a dark card on the board next to the selection (ink background, white text, "AI TUTOR · answering {name}" label) and is saved in `questions`.
- Anyone on the board can ask; answers are visible to all.

**Feature: AI lesson ("Teach me this page")**
- Ask AI menu → "Teach me this page" sends the current page image to `ai-lesson`, which returns 5–8 steps (schema in section 10).
- Client plays steps one at a time: draw the element(s), show caption, speak it (section 11), wait for speech to end, next step.
- Lesson playback is broadcast on `board:{id}` so everyone on the board sees the same lesson; each person's browser speaks it and can mute locally.
- **Auto-pause:** if any user draws while a lesson plays, pause immediately (stop speech). Wait 2 seconds after their last stroke, export board + their new strokes, call `ai-redirect` with lesson state. Insert the returned steps next, then resume (or skip ahead if `resume_from` says so). Show "Got it, let me explain that" in the caption bar.
- Pause / Resume / Skip / Mute controls.

**Feature: Live together**
- Realtime channel `board:{id}`: broadcast changed elements; merge by element id keeping the higher `version` (tie-break `versionNonce`).
- Autosave `scene` to `boards` every 3 seconds when changed (debounced).
- Presence heartbeat to `board_presence`; avatars + count from rows seen in last 60s, excluding ghost mode users.
- Joining loads the saved scene first, then applies live changes.

**Done when:**
- [ ] New user lands on a blank board; returning user on their last board.
- [ ] 5-page PDF uploads and all pages show with working page arrows.
- [ ] Select an area → Ask AI → answer card on board + entry in history.
- [ ] Teach me this page plays steps with voice; drawing pauses it; it redirects based on what was written.
- [ ] Two windows on the same board see each other's strokes within ~1s.
- [ ] Refresh loses nothing.

### 9.4 Community ("Find Your People")

**Layout (see `sketch-community.jpg`):**
- **Header:** "Find Your People" + message bubble icon with unread count (opens Messages).
- **Toolbar:** **Tags** (filter dropdown of my Taking + Took tags, default All), **Create**, **All / Live / Saved** toggle, **Search** (title or tag).
- **Grid of pinned sticky notes**, scrollable. 3 columns desktop, 2 tablet, 1 phone.

**Sticky note contents:**
- Type badge: **Meetup** or **Live board**
- Tag (e.g. ASE220), title
- Meetup: where (building + room, e.g. GH 144), when (e.g. 9/17 10am), `N/max participants` + avatars
- Live board: "3 studying now" + avatars
- Label "You took this, help out" if the tag is in my `past_classes`
- Buttons:
  - Meetup: **Join** → becomes **Leave** (confirm dialog "Leave {title}?"); **Full** (disabled) when at cap; creator sees ⋮ menu with Edit / Remove instead of Join/Leave; **Open board** if a study board is attached
  - Live board: **Join** opens it on the Whiteboard tab

**Create form (sticky-note styled popup):**
- Tag (from my classes), Title, Where (NKU building dropdown: Steely Library, Student Union, Griffin Hall (GH), Norse Commons, Other + room text), When (date + time), Max people (2–10, default 5), "Add a study board" (none / new blank / one of my boards)
- **Attach** button pins the note to the grid (pin drop animation), auto-joins the creator, creates the meetup group chat.

**Saved view:** finished public boards for my tags, newest first ("UML walkthrough · built by 6 students"). Opens read-only with **Copy to my boards**.

**Ordering:** live first, then soonest meetups. Meetups disappear 2h after start. Counts and avatars update live (Realtime) without refresh.

**Empty state:** "Nobody's studying {TAG} yet. **Create** one."

#### Messages (panel from the bubble icon)

- Slides in from the right on desktop, full screen on phone.
- **Chat list:** display name, last message preview, time, unread dot; ⋮ menu with **Block** and **Report**.
- **Two chat types:** DMs; meetup group chats (auto-created, membership follows RSVPs).
- **Chat view:** message list (live), text box, send; **Share a board** button sends a board card with a Join button. DM header shows the other person's visible class tags; meetup chat header shows place and time.
- Start a DM from any avatar or person popup ("Message" button), respecting `message_privacy` and blocks.

**Done when:**
- [ ] Grid shows notes for my tags or the empty state; Tags, All/Live/Saved and Search filter correctly.
- [ ] Create → Attach pins a note, creator counted 1/5, group chat created.
- [ ] Join/Leave updates count live in another window; 6th person on a 5-cap gets Full, even if two click at once.
- [ ] Past-class notes show the help-out label.
- [ ] DM someone from their avatar; they see it instantly; unread counts correct.
- [ ] Block stops their messages; Report saves a row.
- [ ] Can't read a conversation you're not a member of, even via direct API calls.

### 9.5 Profile

**Layout (see right side of `sketch-profile-settings.jpg`):**
- Avatar (initials) + **Display name** (edit inline, shown to everyone everywhere)
- **Tags** with **Display** control: each Taking/Took chip has an eye toggle to show/hide it from others (`hidden_tags`)
- **Privacy:** Ghost / Offline toggle (hidden from live counts and avatars)
- **AI tutor voice:** style picker **Quick / Slow / Meditation / Rage**
- **Speed:** 1x / 1.5x / 2x
- **Preferred language:** English, Chinese, German, Spanish, Vietnamese, … (list from browser voices that exist + Gemini support)
- Gear button → Settings
- Optional small row: "My boards" and "My meetups" links

**Person popup (tapping anyone elsewhere):** display name, avatar, visible tags, shared classes highlighted, **Message** button (hidden if not allowed).

**Done when:**
- [ ] Display name change shows on boards, notes and messages.
- [ ] Hidden tags disappear from my popup for others.
- [ ] Ghost mode hides me from live counts in another window.
- [ ] Voice style, speed and language change the next AI answer/lesson.

### 9.6 Settings

**Layout (see left side of `sketch-profile-settings.jpg`):**
- **Name** (account name) + Change
- **Email** read-only
- **Tags**: Taking (solid) and Took (outlined) chips with × and +
- **Canvas token**: **Re-import from Canvas** button (opens paste box, imports, clears; never shows a stored token)
- **Password**: **Change** button (new + confirm)
- **Blocked people**: **View** → list with Unblock
- **Sign out** button
- **Delete account** (red, at bottom): confirm dialog, type DELETE; deletes profile, messages and owned boards
- Back to Profile

**Done when:**
- [ ] Tag edits show on Community immediately.
- [ ] Re-import updates both tag lists.
- [ ] Change password works.
- [ ] Unblock works.
- [ ] Sign out returns to Sign in; Delete account removes all user data.

---

## 10. Edge Functions and AI contracts

All functions require a signed-in user (verify the Supabase JWT). Use Gemini JSON output mode with the schemas below and validate before returning. Rate-limit per user (e.g. 20 AI calls/minute) to protect the free tier.

### `ai-ask`
- In: `{ image_base64, question?, tutor_style, language, page_context? }`
- Out: `{ answer: string }` (max ~120 words)
- System prompt: patient tutor for a college student; explain the concept in the image; guide rather than hand over homework answers; follow tutor_style and language.

### `ai-lesson`
- In: `{ page_image_base64, tutor_style, language }`
- Out:
```json
{
  "title": "Observer Pattern",
  "steps": [
    {
      "say": "The subject keeps a list of observers.",
      "draw": [
        { "type": "text", "id": "s1", "text": "Subject", "x": 40, "y": 40 },
        { "type": "rect", "id": "b1", "x": 30, "y": 30, "w": 140, "h": 50 },
        { "type": "arrow", "from": "b1", "to": "b2" },
        { "type": "highlight", "x": 0, "y": 0, "w": 0, "h": 0 }
      ]
    }
  ]
}
```
- `type` is one of `text`, `rect`, `ellipse`, `arrow`, `highlight`. Coordinates are relative to a lesson area the client places beside the current page. 5–8 steps, each `say` one or two short sentences.

### `ai-redirect`
- In: `{ board_image_base64, student_strokes_image_base64, lesson_title, steps_done, current_step_index, tutor_style, language }`
- Out: `{ understanding: string, steps: [same step schema], resume_from: number | null }`
- `understanding` = one-sentence guess at what the student is confused about (shown in caption). `resume_from` = index of the original step to continue from, or null to end.

### `canvas-import`
- In: `{ token }`
- Calls `GET {CANVAS_BASE_URL}/api/v1/courses?enrollment_state=active&per_page=100` and `...?enrollment_state=completed&per_page=100` with `Authorization: Bearer {token}`.
- Normalizes `course_code` with regex `([A-Z]{2,4})\s*-?\s*(\d{3})` → `ASE420`. Dedupe; drop non-matching.
- Out: `{ taking: string[], took: string[] }`. Never log or store the token.

### Tutor style → prompt tone

| Style | Prompt tone |
|---|---|
| quick | Short, direct, minimum words |
| slow | Step by step, extra detail and examples |
| meditation | Calm, reassuring, gentle pacing |
| rage | Loud drill-sergeant energy, CAPS for emphasis, always encouraging, never insulting |

---

## 11. Voice

- `speechSynthesis` with `SpeechSynthesisUtterance`.
- `rate = voice_speed × style factor` (quick 1.1, slow 0.9, meditation 0.85, rage 1.15).
- `pitch`: meditation 0.8, rage 1.3, others 1.
- `lang` and voice chosen from `speechSynthesis.getVoices()` matching the user's language; prefer natural-sounding voices. If none exist for that language, show text only.
- Lesson waits for `onend` before the next step. Pause = `speechSynthesis.cancel()` and remember the step. Mute is per person and local only.

---

## 12. Build order (milestones)

1. Vite + React scaffold, routing, design tokens, GitHub Actions deploy to Pages.
2. Supabase schema, RLS, triggers, storage bucket (section 8).
3. Sign in, create account, reset password, session guard.
4. Onboarding: manual tags, then `canvas-import`.
5. Whiteboard: Excalidraw, board create/switch, autosave, last board.
6. Uploads: images, then PDFs via pdf.js.
7. Ask AI (`ai-ask`) + chat history panel.
8. AI lesson playback + voice + auto-pause + `ai-redirect`.
9. Live sync + presence.
10. Community grid, Create/Attach, Join/Leave/Full, filters, Saved.
11. Messages: DMs, meetup chats, share board, Block/Report.
12. Profile and Settings.
13. Seed demo data, phone layout pass, polish, empty states.

**Cut line if short on time:** 1–9 is the core demo; 10 is required for the #community theme; 11–12 can be minimal.

---

## 13. Demo seed data

- 6 fake NKU students with display names, Taking and Took tags across `ASE420`, `ASE220`, `MAT185`, `HCI230`, `CSC260`.
- 2 public boards marked live (fresh presence rows) and 2 saved boards with content.
- 3 meetups (Steely Library, Griffin Hall GH 144, Student Union) with varying RSVP counts, one full.
- A few DMs and a meetup chat with messages.

## 14. Demo script (2 minutes)

1. Sign in with an NKU email; paste a Canvas token and real classes appear.
2. Upload lecture slides; circle something; Ask AI → answer on the board.
3. "Teach me this page" in Rage mode; write a question on the board mid-lesson; it pauses and redirects.
4. Teammate joins from a second laptop; both draw live.
5. Community: live board for ASE420, a meetup at Steely, "You took this, help out" label; Join; message someone.
6. Close: every session leaves a board behind for the next group.

---

## 15. Stretch features (do NOT build now; keep the design open for them)

- More voice customization: accents, voice picker, more languages
- Talking to interrupt the lesson (Gemini Live API)
- Canvas sign-in through OAuth instead of pasting a token
- Search across people, notifications ("someone started an ASE420 board"), following people
- Class-wide group chats (an "ASE420" channel)
- Meetup map of campus
- Images/files in chat, typing indicators, read receipts, reactions, push notifications
- Profile photos, year (freshman, etc.)
- Exporting boards to PDF, comments on boards, per-board roles beyond public/private
- Moderation tools for reports
