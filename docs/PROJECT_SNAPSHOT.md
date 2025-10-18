# MyBodyScan Project Snapshot

**Last Updated:** October 18, 2025  
**Project:** MyBodyScan - AI-powered body composition analysis and fitness coaching app

## What the App Is

### Features
- **Body Scan Analysis**: AI-powered body composition analysis using photo/video capture
- **Nutrition Tracking**: Food logging with USDA/OpenFoodFacts integration, barcode scanning
- **AI Coach**: Personalized fitness coaching with chat interface and workout plans
- **Workout Management**: Custom workout programs, progress tracking, and completion logging
- **Health Dashboard**: Daily overview with calories, meals, workouts, and scan history
- **Credit System**: Pay-per-scan model with credit management and refunds
- **Demo Mode**: Full app experience without authentication for testing

### Tech Stack
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + Radix UI
- **Backend**: Firebase Functions (Node.js 20) + Express
- **Database**: Firestore (NoSQL)
- **Storage**: Firebase Cloud Storage
- **Authentication**: Firebase Auth (Google, Apple, Email)
- **Payments**: Stripe integration
- **AI Services**: OpenAI GPT-4 for coaching and vision analysis
- **Testing**: Playwright (E2E), Vitest (Unit/Integration)
- **Deployment**: Firebase Hosting + Functions

## What Works Now

### ✅ Core Features
- **Authentication**: Google/Apple/Email sign-in with proper security headers
- **Body Scanning**: Complete scan workflow with photo/video capture, AI processing, and results
- **Nutrition**: Food search, barcode scanning, meal logging with USDA/OpenFoodFacts fallback
- **AI Coach**: Chat interface with OpenAI integration, workout plan generation
- **Workouts**: Program catalog, progress tracking, workout adjustments
- **Health Dashboard**: Daily overview with integrated data from all features
- **Credit System**: Credit consumption, refunds, and balance management
- **Demo Mode**: Full app experience for unauthenticated users

### ✅ Infrastructure
- **Security**: App Check enforcement, CORS protection, rate limiting
- **Monitoring**: Sentry integration, structured logging, health checks
- **Testing**: Comprehensive E2E test suite covering all major flows
- **Deployment**: Automated CI/CD with Firebase Hosting and Functions
- **Observability**: `/ops` admin console, `/system/health` endpoint

### ✅ Data Management
- **Firestore Schema**: Well-structured user data with proper security rules
- **File Storage**: Secure image/video uploads with signed URLs
- **Rate Limiting**: Per-user and global rate limits on API endpoints
- **Error Handling**: Consistent error responses and fallback mechanisms

## Known Issues

### 🚨 Critical Issues
- **Temporary Uploads Cleanup**: Scan uploads in `uploads/{uid}/{scanId}/` are not automatically cleaned up after processing
- **App Check Enforcement**: Firestore, Storage, and Functions App Check enforcement not enabled in Firebase Console
- **Type Safety**: Some `any` types remain in codebase (tracked in TRACKING_ISSUES.md)

### ⚠️ Medium Priority
- **Unit Preferences**: User unit preferences not persisted (hardcoded to US units)
- **Subscription Filtering**: Plans page needs subscriber status awareness
- **Secret Management**: Inline defaults in env helpers need removal after production verification

### 📝 Minor Issues
- **PWA Service Worker**: Disabled, needs safe versioning strategy for re-introduction
- **Health/Coach Shims**: Some placeholder services need real implementations

## Environment Variables

### Frontend (`.env.local`)
```bash
# Firebase Configuration
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=mybodyscan-f3daf.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=mybodyscan-f3daf
VITE_FIREBASE_STORAGE_BUCKET=mybodyscan-f3daf.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# App Configuration
VITE_FUNCTIONS_BASE_URL=https://your-domain.com
VITE_RECAPTCHA_SITE_KEY=your_recaptcha_key
VITE_AUTH_ALLOWED_HOSTS=localhost:5173,mybodyscanapp.com,mybodyscan-f3daf.web.app
VITE_USDA_API_KEY=your_usda_key
VITE_APPLE_OAUTH_ENABLED=true
VITE_SENTRY_DSN=your_sentry_dsn
VITE_DEMO_MODE=false
VITE_ENABLE_PUBLIC_MARKETING_PAGE=true
```

### Functions (Firebase Secrets)
```bash
# Core Services
HOST_BASE_URL=https://mybodyscanapp.com
OPENAI_API_KEY=your_openai_key
USDA_FDC_API_KEY=your_usda_key

# Stripe (Optional - returns 501 when missing)
STRIPE_SECRET=your_stripe_secret
STRIPE_WEBHOOK_SECRET=your_webhook_secret

# Security
APP_CHECK_ALLOWED_ORIGINS=mybodyscanapp.com,mybodyscan-f3daf.web.app
APP_CHECK_ENFORCE_SOFT=true
AUTH_ALLOWED_HOSTS=mybodyscanapp.com,mybodyscan-f3daf.web.app

# Monitoring
SENTRY_DSN=your_sentry_dsn
```

## Sanity Checklist (7 Steps)

### 1. **Environment Setup**
- [ ] All required environment variables configured
- [ ] Firebase project properly configured
- [ ] Apple/Google OAuth providers set up
- [ ] Stripe webhook endpoints configured (if using payments)

### 2. **Security Verification**
- [ ] App Check enforcement enabled in Firebase Console
- [ ] CORS origins properly configured
- [ ] Rate limiting thresholds appropriate
- [ ] Security headers properly set

### 3. **Build & Test Pipeline**
- [ ] `npm run build` succeeds
- [ ] `npm --prefix functions run build` succeeds
- [ ] `npm run test` (unit tests) passes
- [ ] `npm run emulators:test` (integration tests) passes
- [ ] `npm run test:e2e` (E2E tests) passes

### 4. **Database & Storage**
- [ ] Firestore rules deployed and tested
- [ ] Storage rules deployed and tested
- [ ] Database schema migrations completed
- [ ] Storage cleanup processes working

### 5. **API Endpoints**
- [ ] All Cloud Functions deployed successfully
- [ ] Health check endpoint (`/system/health`) responding
- [ ] Rate limiting working on all endpoints
- [ ] Error handling consistent across APIs

### 6. **Monitoring & Observability**
- [ ] Sentry integration working (if configured)
- [ ] Logging levels appropriate
- [ ] Health checks monitoring critical services
- [ ] Admin console (`/ops`) accessible and functional

### 7. **Deployment Verification**
- [ ] Hosting deployment successful
- [ ] Functions deployment successful
- [ ] Smoke tests pass on deployed environment
- [ ] All major user flows working in production

## Deploy Commands

### Deploy Functions First
```bash
# Build and deploy functions
npm --prefix functions run build
firebase deploy --only functions --project mybodyscan-f3daf

# Verify functions deployment
firebase functions:log --project mybodyscan-f3daf
```

### Deploy Hosting
```bash
# Build and deploy hosting
npm run build
firebase deploy --only hosting --project mybodyscan-f3daf

# Verify hosting deployment
firebase hosting:channel:list --project mybodyscan-f3daf
```

### Full Deployment
```bash
# Deploy everything
npm run build:all
firebase deploy --project mybodyscan-f3daf

# Run smoke tests
npm run smoke
```

### Emergency Rollback
```bash
# Rollback to previous version
firebase hosting:rollback --project mybodyscan-f3daf
firebase functions:rollback --project mybodyscan-f3daf
```

---

**Note**: This snapshot reflects the current state as of October 18, 2025. For the most up-to-date information, refer to the main README.md and CODEBASE_OVERVIEW.md files.