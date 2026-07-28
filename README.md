# ZipShare — Complete Setup Guide

A website where anyone can upload a ZIP file and anyone can view/download it.
This guide takes you from zero to a live website, in order, once.

---

## 0. What's in this project

```
ZipShare/
├── server.js              # Entry point
├── package.json
├── .env.example            # Copy to .env and fill in
├── .gitignore
├── models/
│   └── File.js              # MongoDB schema
├── routes/
│   └── fileRoutes.js        # Upload / list / delete API
├── public/
│   ├── index.html
│   ├── script.js
│   └── style.css
└── uploads/                 # Where zip files land locally
```

Keep this exact structure — the paths inside the code depend on it.

---

## 1. Run it locally

```bash
cd ZipShare
npm install
```

Create a real `.env` file (copy `.env.example`) and point `MONGO_URI` at a local
or Atlas database for now:

```
MONGO_URI=mongodb://localhost:27017/zipshare
PORT=5000
```

Start it:

```bash
npm run dev
```

You should see:

```
MongoDB connected
Server running on port 5000
```

Open `http://localhost:5000`, upload a `.zip`, confirm it shows up in the list
and can be downloaded/deleted. Once this works, move to Atlas.

---

## 2. Move the database to MongoDB Atlas (free cloud DB)

1. Go to https://www.mongodb.com/atlas and create an account.
2. **Create a free cluster** (any name, pick the region closest to your users).
3. **Security → Database Access → Add New Database User**
   - Authentication method: Password
   - Pick a username and password you'll remember (avoid `@ / : #` in the
     password — they break the connection string unless URL-encoded).
   - Give it **Read and write to any database**.
4. **Security → Network Access → Add IP Address → Allow Access From Anywhere**
   (`0.0.0.0/0`). Fine for a small/free project; tighten later if needed.
5. **Database → Connect → Drivers → Node.js**, copy the connection string. It
   looks like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Replace `<password>` with your real password, and add the database name
   right after `.mongodb.net/`:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/zipshare?retryWrites=true&w=majority
   ```
7. Put that full string into your `.env` as `MONGO_URI`. Restart `npm run dev`
   and confirm `MongoDB connected` still prints, and that a test upload shows
   up under **Atlas → Database → Browse Collections → zipshare → files**.

---

## 3. Push the code to GitHub

```bash
git init
git add .
git commit -m "ZipShare"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ZipShare.git
git push -u origin main
```

`.env` and `uploads/` are already in `.gitignore`, so your password and
uploaded files won't be pushed. Good — never commit them.

---

## 4. Deploy the backend (Render)

1. Go to https://render.com, sign in with GitHub.
2. **New → Web Service**, pick your `ZipShare` repo.
3. Settings:
   - Build command: `npm install`
   - Start command: `npm start`
4. **Environment → Add Environment Variable**:
   - `MONGO_URI` = your Atlas connection string
   - `PORT` = `5000` (Render sets its own `PORT`, but it doesn't hurt to have it)
5. Click **Deploy**. When it finishes you'll get a URL like:
   ```
   https://zipshare-xxxx.onrender.com
   ```
6. Open it — you should see the same site that worked locally.

---

## 5. Fix file storage before you rely on it (important)

Render's filesystem is **temporary** — uploaded ZIPs can disappear on restart
or redeploy. For a real deployment, move file storage to Cloudinary instead
of the local `uploads/` folder:

```bash
npm install cloudinary multer-storage-cloudinary
```

Then in `routes/fileRoutes.js`, swap the `multer.diskStorage` for a
Cloudinary storage engine, and add `CLOUD_NAME`, `API_KEY`, `API_SECRET` to
Render's environment variables (from your free Cloudinary dashboard). Ask if
you'd like this wired up — it's a ~20 line change and worth doing before
sharing the link publicly.

---

## 6. Basic security (do before sharing the link widely)

- ✅ Already done: only `.zip` files accepted, 100 MB size cap, filenames are
  renamed on upload so uploads can't overwrite each other or use
  attacker-supplied paths.
- Add rate limiting (`express-rate-limit`) to stop upload spam.
- Add an admin login (JWT) so only you can delete files — right now anyone
  with the link can delete anything.
- Consider scanning uploads with an antivirus API before serving them.

---

## Order to actually do this in

1. Run locally with local Mongo → confirm upload/list/download/delete work.
2. Switch to Atlas → confirm the same still works.
3. Push to GitHub.
4. Deploy on Render, set env vars there.
5. Swap storage to Cloudinary.
6. Add admin login + rate limiting before wide sharing.

Do these one at a time, testing after each step — don't jump ahead.
