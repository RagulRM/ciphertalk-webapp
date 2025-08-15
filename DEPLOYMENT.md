# CipherTalk - Deployment Guide

## 🚀 Quick Railway Deployment

### Prerequisites
1. GitHub account
2. Railway account (free)

### Step 1: Prepare Your Repository
```bash
git init
git add .
git commit -m "Initial commit for deployment"
```

### Step 2: Push to GitHub
1. Create a new repository on GitHub
2. Push your code:
```bash
git remote add origin <your-github-repo-url>
git push -u origin main
```

### Step 3: Deploy on Railway
1. Go to [railway.app](https://railway.app)
2. Sign in with GitHub
3. Click "New Project"
4. Select "Deploy from GitHub repo"
5. Choose your CipherTalk repository
6. Railway will automatically detect and deploy!

### Step 4: Configure Environment Variables
In Railway dashboard:
1. Go to your project → Variables
2. Add these variables:
```
MONGODB_URI=mongodb+srv://Ragul:RagulCipher@useridcluster.fmyfom3.mongodb.net/ciphertalk?retryWrites=true&w=majority
NODE_ENV=production
```

### Step 5: Get Your Live URL
- Railway will provide a URL like: `https://your-app-name.railway.app`
- Your app will be live at this URL!

## 🌐 Alternative: Vercel (Frontend Only)

If you want to use Vercel, you'll need to:
1. Deploy frontend to Vercel
2. Deploy backend separately (Railway/Heroku)
3. Update environment variables

## 📱 Your App Features
- ✅ RSA-AES Hybrid Encryption
- ✅ Image Steganography
- ✅ Real-time Messaging
- ✅ Secure File Upload
- ✅ User Authentication

## 🔧 Troubleshooting
If deployment fails:
1. Check build logs in Railway dashboard
2. Ensure all dependencies are in package.json
3. Verify MongoDB connection string
4. Check environment variables

## 📞 Need Help?
- Railway Docs: https://docs.railway.app
- GitHub Issues: Create an issue in your repo
