# Alma Care Client Matcher - Vercel Deployment

## Quick Deploy to Vercel (5 minutes!)

### Step 1: Download These Files
Download all files in this folder:
- `index.html`
- `styles.css`
- `app.js`
- `vercel.json`

### Step 2: Sign Up for Vercel
1. Go to https://vercel.com/signup
2. Sign up with GitHub (recommended) or email
3. It's **completely free** for this project!

### Step 3: Deploy

**Option A: Drag and Drop (Easiest)**
1. Go to https://vercel.com/new
2. Click "Browse" or drag your folder
3. Select all 4 files
4. Click "Deploy"
5. Done! You'll get a URL like: `https://alma-care-matcher.vercel.app`

**Option B: Using Vercel CLI**
1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. Navigate to this folder in terminal:
   ```bash
   cd path/to/vercel-deployment
   ```
3. Run:
   ```bash
   vercel
   ```
4. Follow the prompts
5. Done!

### Step 4: Use Your Matcher
1. Visit your new URL
2. Enter your Airtable credentials
3. Start matching!

## Features
✅ No CORS issues - runs on a real domain
✅ Filters clients: Matching Stage = Unmatched, Deposit Received, Status ≠ Cancelled
✅ Displays "Mama's Full Name"
✅ Matches on: Status (Active/Ready for Review), Distance (<60km), Care Type
✅ Date filtering
✅ Email generation
✅ Saves settings in browser

## How It Works
- **Client-side matching algorithm** - fast, no AI API calls needed
- **Direct Airtable integration** - reads your data in real-time
- **Smart distance estimation** - uses Canadian postal code proximity
- **Automatic scoring** - ranks best matches first

## Troubleshooting

**Q: I get a 404 error**
A: Make sure all 4 files are uploaded to Vercel

**Q: Airtable connection fails**
A: Check your API key and Base ID in settings

**Q: No matches found**
A: Verify care team members have Status = "Active" or "Ready for Review"

## Need Help?
Contact the person who gave you this tool!
