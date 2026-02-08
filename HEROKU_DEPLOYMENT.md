# Heroku Deployment Guide

## Prerequisites
- Heroku account
- Heroku CLI installed
- GitHub repository: https://github.com/ahow/climate-valuation

## Deployment Steps

### 1. Create Heroku App
```bash
heroku create climate-scenario-analyzer
```

### 2. Add MySQL Database Add-on
```bash
heroku addons:create jawsdb:kitefin
```

### 3. Set Environment Variables

You'll need to set these environment variables in Heroku:

```bash
# Database (automatically set by JawsDB addon)
# DATABASE_URL will be set automatically

# JWT Secret (generate a random string)
heroku config:set JWT_SECRET=$(openssl rand -hex 32)

# Manus OAuth (if you want to keep OAuth functionality)
# Otherwise, the app works without authentication
heroku config:set OAUTH_SERVER_URL=https://api.manus.im
heroku config:set VITE_OAUTH_PORTAL_URL=https://portal.manus.im

# S3 Storage - You'll need to set up your own S3 bucket
# Option 1: Use AWS S3 directly
heroku config:set BUILT_IN_FORGE_API_URL=<your-s3-endpoint>
heroku config:set BUILT_IN_FORGE_API_KEY=<your-s3-access-key>

# Option 2: Use Heroku's S3 addon
heroku addons:create bucketeer:hobbyist
# Then configure the storage.ts file to use Bucketeer credentials
```

### 4. Deploy from GitHub

#### Option A: Automatic Deployment (Recommended)
1. Go to your Heroku dashboard: https://dashboard.heroku.com/apps/climate-scenario-analyzer
2. Click on the "Deploy" tab
3. Under "Deployment method", select "GitHub"
4. Connect to your GitHub account
5. Search for "climate-valuation" and connect
6. Enable "Automatic deploys" from the main branch
7. Click "Deploy Branch" to deploy now

#### Option B: Manual Deployment via CLI
```bash
# Add Heroku remote
heroku git:remote -a climate-scenario-analyzer

# Push to Heroku
git push heroku main
```

### 5. Run Database Migrations
```bash
heroku run pnpm db:push
```

### 6. Open Your App
```bash
heroku open
```

## Important Notes

### S3 Storage Configuration
The app currently uses Manus's built-in S3 storage. For Heroku deployment, you have two options:

1. **Use AWS S3 directly**: Create an S3 bucket and update `server/storage.ts` to use AWS SDK directly
2. **Use Bucketeer addon**: Heroku's S3-compatible storage addon

### Database
- JawsDB provides a MySQL database (free tier: 5MB, paid tiers available)
- The DATABASE_URL environment variable is automatically set by the addon
- Make sure to run migrations after deployment

### File Uploads
- The app uses S3 direct upload to handle large files (up to 20MB+)
- Make sure your S3 bucket has CORS configured to allow uploads from your Heroku domain

### Environment Variables Summary
Required:
- `DATABASE_URL` (auto-set by JawsDB)
- `JWT_SECRET` (generate random string)
- `BUILT_IN_FORGE_API_URL` (your S3 endpoint)
- `BUILT_IN_FORGE_API_KEY` (your S3 access key)

Optional (for OAuth):
- `OAUTH_SERVER_URL`
- `VITE_OAUTH_PORTAL_URL`
- `VITE_APP_ID`
- `OWNER_OPEN_ID`
- `OWNER_NAME`

## Troubleshooting

### Build Fails
- Check Heroku logs: `heroku logs --tail`
- Ensure all dependencies are in `dependencies` (not `devDependencies`)

### Database Connection Issues
- Verify DATABASE_URL is set: `heroku config:get DATABASE_URL`
- Check JawsDB dashboard for connection details

### Upload Issues
- Verify S3 credentials are correct
- Check S3 bucket CORS configuration
- Review Heroku logs for detailed error messages

## Monitoring
```bash
# View logs
heroku logs --tail

# Check app status
heroku ps

# Open app
heroku open
```
