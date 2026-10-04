# Setup guide

Two situations:

- **Part A: join the existing project** (you were given the Supabase project). About 5 minutes. Most teammates only need this.
- **Part B: build the whole backend from scratch** (your own Supabase project, your own keys). About 30 minutes.

Before either part, install **Node.js** (the LTS version) and **Git**.

---

## The most important thing: keys and `.env`

There are four different kinds of key in this project. They are stored in different places on purpose.

| What | Example name | Where it goes | Safe to share or commit? |
|---|---|---|---|
| Supabase project address | `VITE_SUPABASE_URL` | your local `.env` file, and a GitHub Actions secret for the live site | yes, it is public |
| Supabase **publishable** (anon) key | `VITE_SUPABASE_ANON_KEY` | your local `.env` file, and a GitHub Actions secret for the live site | yes, it is public by design; the database rules (RLS) protect the data |
| **Gemini API key** | `GEMINI_API_KEY` | **Supabase Edge Function secret only** | **never**: not in `.env`, not in the code, not in GitHub, not in chat |
| NKU Canvas address | `CANVAS_BASE_URL` | Supabase Edge Function secret | yes, but keep it with the other secrets |
| A student's Canvas token | none | typed into the page once, never stored | never share |

Rules:

1. The file `.env` is **git-ignored**. It never goes to GitHub. That is why a fresh clone has no `.env` and shows "Failed to fetch" on sign in until you create one.
2. `.env.example` is the template (it is committed). Copy it to `.env` and fill it in.
3. **Never use the `service_role` or "secret" key** from Supabase anywhere in this project.
4. If any secret is ever shown in a screenshot, a chat or GitHub, make a new one and delete the old one (see "If a key leaks" at the bottom).

---

## Part A: join the existing project

1. Clone the repo and open the folder:
   ```
   git clone https://github.com/DANTHAND005/Hackathon-Norse-Whiteboard.git
   cd Hackathon-Norse-Whiteboard
   ```
2. Install the packages:
   ```
   npm install
   ```
3. Create your `.env` from the template:
   - **Windows (PowerShell):** `Copy-Item .env.example .env`
   - **Mac or Linux:** `cp .env.example .env`
4. Open `.env` and fill in the two lines. Ask a teammate privately for the key (do not post it in a public channel):
   ```
   VITE_SUPABASE_URL=https://hiuzbgdqurtatffvsdui.supabase.co
   VITE_SUPABASE_ANON_KEY=<the publishable key>
   ```
5. Start the app:
   ```
   npm run dev
   ```
   If it was already running, stop it with `Ctrl+C` and start it again. `.env` is only read when the server starts.
6. Open **http://localhost:5173/norse-whiteboard/#/login** and sign in or create an account (any address ending in `@nku.edu`).

You do **not** need the Gemini key or the Canvas address. They live in Supabase, so the AI and the Canvas import work for you automatically once you are signed in.

---

## Part B: build the whole backend from scratch

### B1. Create the Supabase project

1. Go to https://supabase.com/dashboard and click **New project**. Name it, set a database password (save it), pick a region, and wait for it to finish.
2. Open **Project Settings, API Keys** and copy:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **publishable / anon** key
   - the **project reference**: the `abcd1234` part of the URL
3. Put the first two in `.env` (see Part A, steps 3 and 4).

### B2. Connect the command-line tool

Run these in the project folder. No separate install is needed (`npx` fetches it).

```
npx supabase login
npx supabase link --project-ref <your project reference>
```

`login` opens a browser page to approve. `link` may ask for the database password you set in B1.

### B3. Create the database

Run the four migration files **in order, once**, on a new empty project:

```
npx supabase db query --linked -f supabase/migrations/0001_schema.sql
npx supabase db query --linked -f supabase/migrations/0002_board_read_owner.sql
npx supabase db query --linked -f supabase/migrations/0003_questions_realtime.sql
npx supabase db query --linked -f supabase/migrations/0004_dm_context.sql
```

Or without the command line: open **SQL Editor, New query** in the Supabase dashboard, paste the contents of each file, and click **Run**, in the same order.

What this creates: all tables, the `public_profiles` and `board_live` views, the triggers (NKU-only sign up, meetup cap, group chats), all Row Level Security rules, the private storage bucket `board-files`, and the Realtime settings.

If `0001` says something already exists, the database is not empty. Use a new project, or ask before dropping tables.

### B4. Sign-in settings

In the Supabase dashboard, open **Authentication**:

1. **Sign In / Providers**, then **Email**: make sure it is enabled. Set **Minimum password length** to 8 and save.
2. On the same page, in the **User Signups** section near the top, turn **Confirm email** **off** and save. (With it on, new accounts cannot sign in and Supabase's free email limit blocks you after a few sign-ups.) You can check it from outside with `https://<project>.supabase.co/auth/v1/settings`, which should show `"mailer_autoconfirm": true`.
3. **URL Configuration**:
   - **Site URL**: your live site address, for example `https://danthand005.github.io/Hackathon-Norse-Whiteboard/`
   - **Redirect URLs**: add the live address above **and** `http://localhost:5173/norse-whiteboard/`

### B5. The AI and Canvas secrets

1. Create a Gemini key at https://aistudio.google.com (Get API key, Create API key).
2. In **your own terminal**, store the secrets in Supabase (replace the placeholder; never paste the real key into chat or a file):
   ```
   npx supabase secrets set GEMINI_API_KEY=your_key_here
   npx supabase secrets set CANVAS_BASE_URL=https://nku.instructure.com
   ```
   Optional: `npx supabase secrets set GEMINI_MODEL=<model name>` to pick a different Gemini model. The default is `gemini-flash-latest`, with an automatic fallback to `gemini-flash-lite-latest` when Google is busy.
3. Check the names (values are hidden): `npx supabase secrets list`

### B6. Deploy the four server functions

```
npx supabase functions deploy canvas-import --no-verify-jwt --use-api
npx supabase functions deploy ai-ask --no-verify-jwt --use-api
npx supabase functions deploy ai-lesson --no-verify-jwt --use-api
npx supabase functions deploy ai-redirect --no-verify-jwt --use-api
```

`--no-verify-jwt` is used because each function checks the caller's login itself. Redeploy a function whenever you change its code (or the shared file `supabase/functions/_shared/ai.ts`, which all three AI functions use).

### B7. Run it locally and test

```
npm install
npm run dev
```

Open http://localhost:5173/norse-whiteboard/#/login, then check the following.

- [ ] You can create an account with an `@nku.edu` address, and a Gmail address is rejected.
- [ ] You land on Onboarding, paste a Canvas token, and your classes appear.
- [ ] The whiteboard opens, you can draw, refresh, and your drawing is still there.
- [ ] Upload a PDF: its pages appear and the arrows move between them.
- [ ] Select something and press Ask AI: an answer card appears and the chat history fills in.
- [ ] In a private browser window, sign in as a second account on the same board: strokes appear in both windows.
- [ ] On Community, create a note, join it from the second account, and send a message from an avatar.

### B8. Publish the website (GitHub Pages)

1. Push the code to a GitHub repository (`git push origin main`).
2. In the repository on github.com, open **Settings, Pages** and set **Source** to **GitHub Actions**.
3. Open **Settings, Secrets and variables, Actions, New repository secret** and add two secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   Do **not** add the Gemini key here. The website never needs it.
4. Open the **Actions** tab. The workflow "Deploy to Pages" runs on every push to `main`. If it ran before the secrets existed, open the run and press **Re-run all jobs**.
5. When the run is green, the site is at `https://<account>.github.io/<repository name>/#/login`.
6. Make sure that address is in the Supabase **Redirect URLs** (step B4), so password-reset links come back to it.

The website's address follows the repository name automatically (the workflow sets `VITE_BASE`). On your computer it stays `/norse-whiteboard/`.

---

## Changing things later

| You want to | Do this |
|---|---|
| Change the database | add a new file `supabase/migrations/0005_name.sql` and run it with `npx supabase db query --linked -f ...` |
| Change a server function | edit it under `supabase/functions/`, then run the deploy command from B6 for that function |
| Change a secret | run `npx supabase secrets set NAME=value` again |
| See what secrets exist | `npx supabase secrets list` (shows names and hashes, never the values) |
| Publish a code change | `git add -A`, `git commit -m "message"`, `git push origin main`; the site rebuilds itself |

---

## If a key leaks

- **Gemini key shown anywhere:** go to https://aistudio.google.com, create a new key, delete the old one, and run `npx supabase secrets set GEMINI_API_KEY=new_key` again.
- **Publishable (anon) key:** it is public by design, but you can rotate it in Supabase under **Project Settings, API Keys**. Then update `.env` and the GitHub secret.
- **`service_role` or secret key shown:** rotate it immediately in Supabase. This project never uses it, so nothing else breaks.
- **A Canvas token shown:** in Canvas, go to Account, Settings, and delete that token under Approved Integrations.

---

## Troubleshooting

| What you see | Why | Fix |
|---|---|---|
| "Failed to fetch" when signing in | the app cannot reach Supabase: no internet, or the `.env` file is missing or wrong | create `.env` (Part A), then stop and restart `npm run dev` |
| Sign-up says "Too many tries" | Confirm email is still on, or too many sign-ups in a short time | turn Confirm email off (B4), wait a few minutes |
| White page after a code change | the page hot-reloaded half of the sign-in code | press `Ctrl+Shift+R` |
| "Could not create a board" | you are signed in as an account that was deleted | open `#/login` and sign in again (the app now does this automatically) |
| The AI says "high demand" | Google's free tier is busy | wait a few seconds and try again; the function already retries and falls back |
| "API key not valid" from the AI | the Gemini secret is wrong | set it again (B5) |
| Community shows nothing for the second account | notes only show for classes you have | add a class you share (Settings, Tags) |
| No sound in "Teach me this page" | the browser has no speech voices | try Microsoft Edge, or Windows, Settings, Time and language, Speech |
| The live site loads but sign-in fails | the two GitHub secrets are missing | add them (B8) and re-run the workflow |
| A password-reset link opens a wrong page | the live address is missing from Supabase Redirect URLs | add it (B4) |
