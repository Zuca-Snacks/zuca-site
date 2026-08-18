# Zuca — What's Set Up and What You Do Next

Written for Emil. No prior git knowledge assumed. Nothing here requires you to
understand the commands — just to copy and paste them.

---

## The short version

You now have **four folders** on your Desktop instead of one. They are four copies
of the same website that share one history. Three specialist agents will each work
in their own folder at the same time, without stepping on each other. Your original
folder stays untouched until you decide to merge their work in.

Nothing has been sent to GitHub. Nothing has touched your live site.

---

## Your four folders

| Folder (full path) | What it's for | Prompt file to paste there |
|---|---|---|
| `/Users/emilnordin/Desktop/zuca-site` | **Your original.** The safe one. Leave it alone. | — |
| `/Users/emilnordin/Desktop/zuca-ux` | Look, feel, mobile layout | `01_UIUX_AGENT.md` |
| `/Users/emilnordin/Desktop/zuca-growth` | Getting more waitlist signups | `02_CONVERSION_AGENT.md` |
| `/Users/emilnordin/Desktop/zuca-sec` | Security and safety | `03_SECURITY_AGENT.md` |

All three prompt files are sitting in your **Downloads** folder right now.

---

## How to start an agent (do this three times, once per folder)

1. Open **VS Code**.
2. Top menu → **File** → **New Window**. (Important — a *new* window each time, so the
   three agents don't share one window.)
3. In that new window: **File** → **Open Folder…**
4. Navigate to your **Desktop** and pick one of the three folders above
   (`zuca-ux`, `zuca-growth`, or `zuca-sec`). Click **Open**.
5. If VS Code asks "Do you trust the authors of the files in this folder?" — click
   **Yes, I trust the authors**. It's your own folder.
6. Top menu → **Terminal** → **New Terminal**. A panel opens at the bottom.
7. Click into that panel, type `claude`, press **Enter**.
8. Open the matching prompt file from Downloads (double-click it), select all the
   text, copy it, and paste it into the Claude terminal. Press **Enter**.

Repeat for the other two folders. You can have all three running at once.

---

## How to preview a site on your phone

In the terminal for whichever folder you want to look at, type:

```
npm run dev -- --host
```

Press Enter. After a second or two you'll see two lines, something like:

```
➜  Local:   http://localhost:5173/
➜  Network: http://192.168.1.47:5173/
```

The **Network** line is the phone one. Type that full address (including the numbers
and the `:5173`) into Safari or Chrome on your phone. Your phone and your Mac must be
on the same Wi-Fi.

To stop the preview: click into that terminal and press **Ctrl + C**.

**If you want to run two previews at the same time**, give the second one a different
number so they don't collide:

```
npm run dev -- --host --port 3001
```

---

## OPEN ITEM: does merging into main auto-deploy to the live site?

**I could not confirm this, and I stopped looking rather than burn your time.**

Here is what I *do* know for certain:
- Your live site `zucasnacks.com` is hosted on **Vercel**. I confirmed this directly.
- There is **no Vercel settings file inside this project folder**, which means the
  connection is configured on Vercel's website, not in your code. I can't read that
  from here.

**Assume for now that it DOES auto-deploy**, because that is Vercel's default
behavior. Meaning: if you push a change to `main`, your live site probably changes
within a minute or two. Treat `main` as live until you've checked.

### How to check it yourself (about 2 minutes)

1. Go to **vercel.com** and log in.
2. You'll see a list of projects. Click the one for Zuca (likely named `zuca-site`).
3. Look at the tabs across the top: **Project → Settings → Git**.
4. On that page, look for:
   - **"Connected Git Repository."** If it shows `Zuca-Snacks/zuca-site`, then yes —
     GitHub is wired to Vercel and pushes trigger deploys. If it says *not connected*,
     then deploys are manual and merging changes nothing until you deploy by hand.
   - **"Production Branch."** Whatever branch is named here is the one that publishes
     to the real `zucasnacks.com`. It's almost certainly `main`.
5. Also click the **Deployments** tab. If you see a list of past deploys with commit
   messages that match your git history, that confirms auto-deploy is on.

Once you know, write the answer at the bottom of this file so you don't have to
look it up again.

---

## If something looks wrong

**First, don't panic, and don't delete anything.** Every version of this site is saved.

**If one agent's folder looks broken:** just close that VS Code window. The other two
folders and your original are completely unaffected. Nothing an agent does in
`zuca-ux` can reach `zuca-growth`, `zuca-sec`, or your original folder.

**If you want to throw away everything and go back to exactly how things were before
today**, open a terminal in your original folder (`zuca-site`) and paste this:

```
cd ~/Desktop/zuca-site
git worktree remove --force ../zuca-ux
git worktree remove --force ../zuca-growth
git worktree remove --force ../zuca-sec
git branch -D ux/mobile-redesign growth/waitlist-conversion sec/hardening
git reset --hard before-agents
```

In plain language: that deletes the three agent folders, throws away their work, and
rewinds your original folder to the exact state it was in before any of this started.
`before-agents` is the name of the bookmark I saved for you. It cannot be used up —
you can go back to it as many times as you want.

**Nothing above touches GitHub or your live site.** Your live site can only change if
you deliberately push to GitHub, which has not happened.

---

## Things worth knowing that I found along the way

**Your GitHub is fine.** GitHub showing "main updated 4 months ago" worried you, but
it's accurate and harmless — your last website change was **May 2, 2026**. Your folder
and GitHub are on the identical version. Nothing was lost, nothing is out of sync.

**Your waitlist form's address is public.** The form on your site sends signups to a
Google Apps Script that writes into a Google Sheet. That web address is written
directly into your website's code, which is published on GitHub for anyone to read.
It isn't a password, and nobody can read your existing signups with it — but someone
who found it could send junk entries into your sheet. **The security agent is the one
to raise this with.** I have not changed it.

**There are no secret/password files in this project** (no `.env` file), so there was
nothing to hand-copy into the three folders. I did add `.env` to the ignore list as a
precaution, so that if any agent creates one later, it won't accidentally get
published to GitHub.

---

## Your Vercel answer (fill this in after you check)

Auto-deploys on merge to `main`?  ______________
Production branch: ______________
Live URL it deploys to: ______________
