# Deploying Elements Festival Planner to Vercel

This guide will help you deploy your Elements Festival Planner application to Vercel.

## Prerequisites

1. **GitHub Account**: Make sure your code is pushed to a GitHub repository
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)

## Deployment Steps

### Option 1: Deploy via Vercel Dashboard (Recommended)

1. **Push to GitHub**:

   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Connect to Vercel**:

   - Go to [vercel.com](https://vercel.com) and sign in
   - Click "New Project"
   - Import your GitHub repository
   - Vercel will automatically detect it's a static site

3. **Configure Project**:

   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave as default)
   - **Build Command**: Leave empty (not needed for static sites)
   - **Output Directory**: Leave empty (not needed for static sites)

4. **Deploy**:
   - Click "Deploy"
   - Vercel will build and deploy your site
   - You'll get a URL like: `https://your-project-name.vercel.app`

### Option 2: Deploy via Vercel CLI

1. **Install Vercel CLI**:

   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:

   ```bash
   vercel login
   ```

3. **Deploy**:

   ```bash
   vercel
   ```

4. **Follow the prompts**:
   - Link to existing project or create new one
   - Confirm deployment settings
   - Deploy!

## Firebase Configuration for Deployment

### Common Deployment Issues

If Firebase works locally but not in production, it's usually due to one of these issues:

1. **Domain Not Authorized** (Most Common)
2. **HTTPS/HTTP Protocol Issues**
3. **CORS Configuration**
4. **Firestore Security Rules**

### Fixing Domain Authorization

1. **Go to Firebase Console**:

   - Visit [Firebase Console](https://console.firebase.google.com/)
   - Select your project (`elements-0`)

2. **Add Authorized Domains**:

   - Click the gear icon (⚙️) next to "Project Overview"
   - Select "Project settings"
   - Scroll down to "Your apps" section
   - Click on your web app
   - Scroll down to "Authorized domains"
   - Click "Add domain"
   - Add your deployed domain (e.g., `your-project-name.vercel.app`)

3. **Alternative: Add All Domains** (for testing):
   - Add `localhost` (for local development)
   - Add `*.vercel.app` (for all Vercel deployments)
   - Add your specific domain

### Example Domain Configuration

```
Authorized domains:
- localhost
- your-project-name.vercel.app
- your-custom-domain.com (if using custom domain)
```

### Testing Firebase in Production

1. **Check Browser Console**:

   - Open your deployed site
   - Open browser developer tools (F12)
   - Check the console for Firebase-related messages

2. **Expected Messages**:

   - ✅ "Firebase initialized successfully" - Firebase is working
   - ⚠️ "Firebase not available, falling back to localStorage" - Domain not authorized
   - ❌ Error messages - Check the specific error

3. **Common Error Messages**:
   - `permission-denied` - Check Firestore security rules
   - `unavailable` - Check internet connection
   - `CORS` - Domain not authorized
   - `auth` - Firebase configuration issue

### Firestore Security Rules

Make sure your Firestore security rules allow access:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /attendees/{document} {
      allow read, write: if true; // Allow all access for now
    }
    match /comments/{document} {
      allow read, write: if true; // Allow all access for now
    }
    match /test/{document} {
      allow read, write: if true; // Allow test collection access
    }
  }
}
```

#### How to Update Security Rules

1. **Go to Firebase Console**:

   - Visit [Firebase Console](https://console.firebase.google.com/)
   - Select your project (`elements-0`)

2. **Navigate to Firestore Rules**:

   - Click "Firestore Database" in the left sidebar
   - Click the "Rules" tab

3. **Update the Rules**:

   - Replace the existing rules with the ones above
   - Click "Publish" to save the changes

4. **Test the Rules**:
   - Wait a few minutes for the rules to propagate
   - Refresh your deployed application
   - Check the browser console for Firebase success messages

#### Alternative: Test Mode Rules

If you want to allow all access temporarily (for testing):

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

**⚠️ Warning**: These rules allow anyone to read and write to your database. Only use for testing or development.

### Environment Variables (Optional)

If you're using Firebase, you might want to set environment variables in Vercel:

1. Go to your project dashboard in Vercel
2. Navigate to Settings > Environment Variables
3. Add any Firebase configuration variables if needed

## Custom Domain (Optional)

1. Go to your project dashboard in Vercel
2. Navigate to Settings > Domains
3. Add your custom domain
4. Follow the DNS configuration instructions

## File Structure

Your deployment will include these key files:

```
├── index.html              # Main entry point
├── styles.css              # Styles
├── script.js               # Main JavaScript
├── firebase-config.js      # Firebase configuration
├── csv-parser.js           # CSV parsing logic
├── load-schedule.js        # Schedule loading
├── Elements_Festival_Full_Schedule__All_Days_.csv  # Festival data
├── vercel.json             # Vercel configuration
├── package.json            # Project metadata
└── .gitignore              # Git ignore rules
```

## Troubleshooting

### Common Issues

1. **Build Errors**:

   - Check that all files are committed to Git
   - Ensure `index.html` is in the root directory
   - Verify all JavaScript files are properly referenced

2. **404 Errors**:

   - Make sure `vercel.json` is configured correctly
   - Check that all file paths are correct

3. **CORS Issues**:

   - Vercel handles CORS automatically for static sites
   - If you're loading external resources, ensure they allow CORS

4. **Firebase Not Working in Production**:
   - Check if the domain is authorized in Firebase project settings
   - Verify Firestore security rules allow access
   - Check browser console for specific error messages
   - Ensure HTTPS is being used (Firebase requires HTTPS in production)

### Support

- [Vercel Documentation](https://vercel.com/docs)
- [Vercel Support](https://vercel.com/support)
- [Firebase Documentation](https://firebase.google.com/docs)

## Post-Deployment

After successful deployment:

1. **Test the Application**:

   - Visit your deployed URL
   - Test all features (comments, schedule, etc.)
   - Check mobile responsiveness
   - Verify Firebase functionality (if configured)

2. **Monitor Performance**:

   - Use Vercel Analytics (if enabled)
   - Check for any console errors
   - Monitor Firebase usage in Firebase Console

3. **Share Your App**:
   - Share the Vercel URL with your team
   - Consider adding a custom domain for easier access

## Firebase Deployment Checklist

- [ ] Firebase project created and configured
- [ ] Firestore database enabled
- [ ] Security rules configured
- [ ] Domain authorized in Firebase project settings
- [ ] Firebase configuration updated in `firebase-config.js`
- [ ] Tested locally with Firebase
- [ ] Tested deployed version with Firebase
- [ ] Fallback to localStorage working (if Firebase fails)
