# Sanity Check Pipeline

This document describes the sanity check pipeline that validates Sanity instance health and availability.

## Overview

The sanity check pipeline consists of:
- **Health Probes**: Automated checks for `/system/health`, `/`, and `/demo` endpoints
- **GitHub Actions**: Automated workflow on PRs and manual triggers
- **Preview Deployment**: Optional Firebase preview channel deployment
- **PR Comments**: Automatic results posting on pull requests

## Components

### 1. Sanity Check Tool (`tools/sanity-check.mjs`)

A Node.js ESM script that probes Sanity endpoints for health and availability.

**Features:**
- Probes required endpoints: `/system/health`, `/`
- Probes optional endpoints: `/demo`
- Configurable timeout (10s default)
- Optional authentication via `SANITY_TOKEN`
- Detailed logging and JSON output
- GitHub Actions integration

### 2. GitHub Workflow (`.github/workflows/sanity-check.yml`)

Automated CI/CD pipeline that:
- Triggers on PRs to `main`/`develop` branches
- Supports manual dispatch with custom URL
- Builds web application and functions
- Optionally deploys Firebase preview channel
- Runs sanity checks and posts results to PR

### 3. Package Script

Adds `npm run sanity` command for local testing.

## Setup

### Prerequisites

1. **Node.js 20+** for running the sanity check tool
2. **Firebase CLI** (if using preview deployment)
3. **GitHub Secrets** (for automated deployment)

### Required GitHub Secrets

Configure these secrets in your GitHub repository settings:

- `SANITY_BASE_URL`: Default Sanity instance URL
- `SANITY_TOKEN`: Optional authentication token
- `FIREBASE_TOKEN`: Firebase deployment token (optional)
- `FIREBASE_PROJECT`: Firebase project ID (optional)

### Local Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set environment variables:**
   ```bash
   export SANITY_BASE_URL="https://your-sanity-instance.com"
   export SANITY_TOKEN="your-optional-token"  # Optional
   ```

3. **Make the script executable:**
   ```bash
   chmod +x tools/sanity-check.mjs
   ```

## Usage

### Local Testing

Run the sanity check locally:

```bash
# Using npm script
npm run sanity

# Or directly
node tools/sanity-check.mjs

# With custom URL
node tools/sanity-check.mjs https://your-custom-url.com
```

### GitHub Actions

#### Automatic Triggers

The workflow automatically runs on:
- Pull requests to `main` or `develop` branches
- Manual dispatch via GitHub Actions UI

#### Manual Dispatch

1. Go to **Actions** → **Sanity Check Pipeline**
2. Click **Run workflow**
3. Provide custom Sanity Base URL (optional)
4. Choose whether to deploy preview channel

#### Preview Deployment

If `FIREBASE_TOKEN` and `FIREBASE_PROJECT` secrets are configured:
- PRs automatically deploy to preview channels
- URL format: `https://pr-{number}--{project}.web.app`
- Sanity checks run against the preview URL

## Configuration

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SANITY_BASE_URL` | Yes | Base URL for Sanity instance |
| `SANITY_TOKEN` | No | Authentication token for protected endpoints |
| `GITHUB_ACTIONS` | Auto | Set by GitHub Actions environment |

### Endpoint Configuration

**Required Endpoints:**
- `/system/health` - Health check endpoint
- `/` - Root endpoint

**Optional Endpoints:**
- `/demo` - Demo/example endpoint

To modify endpoints, edit the `REQUIRED_ENDPOINTS` and `OPTIONAL_ENDPOINTS` arrays in `tools/sanity-check.mjs`.

### Timeout Configuration

Default timeout is 10 seconds. To change:

```javascript
const DEFAULT_TIMEOUT = 15000; // 15 seconds
```

## Output

### Console Output

The tool provides real-time feedback:

```
🔍 Sanity Check starting for: https://example.com
⏰ Timestamp: 2024-01-15T10:30:00.000Z

📋 Checking required endpoint: /system/health
  ✅ REQUIRED /system/health - 200 OK (245ms)
📋 Checking required endpoint: /
  ✅ REQUIRED / - 200 OK (189ms)
🔍 Checking optional endpoint: /demo
  ✅ OPTIONAL /demo - 200 OK (156ms)

📊 Summary:
  Total checks: 3
  Passed: 3 (100%)
  Failed: 0
  Optional: 1

🎉 All checks passed! Sanity instance is healthy.
```

### JSON Output

For programmatic use, results are saved as JSON:

```json
{
  "baseUrl": "https://example.com",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "checks": [
    {
      "path": "/system/health",
      "url": "https://example.com/system/health",
      "status": 200,
      "statusText": "OK",
      "duration": 245,
      "success": true,
      "required": true
    }
  ],
  "summary": {
    "total": 3,
    "passed": 3,
    "failed": 0,
    "optional": 1
  }
}
```

### GitHub PR Comments

Results are automatically posted as PR comments with:
- Summary statistics
- Detailed endpoint results
- Deployment information (if applicable)
- Status indicators and formatting

## Troubleshooting

### Common Issues

1. **Timeout Errors**
   - Check network connectivity
   - Verify Sanity instance is running
   - Consider increasing timeout value

2. **Authentication Errors**
   - Verify `SANITY_TOKEN` is valid
   - Check token permissions

3. **Deployment Failures**
   - Verify Firebase credentials
   - Check project permissions
   - Ensure Firebase CLI is installed

4. **GitHub Actions Failures**
   - Check repository secrets
   - Verify workflow permissions
   - Review action logs for details

### Debug Mode

For detailed debugging, set environment variables:

```bash
export DEBUG=1
export SANITY_BASE_URL="https://your-url.com"
node tools/sanity-check.mjs
```

### Manual Testing

Test individual endpoints:

```bash
# Test health endpoint
curl -v https://your-sanity-instance.com/system/health

# Test with authentication
curl -v -H "Authorization: Bearer your-token" https://your-sanity-instance.com/system/health
```

## Contributing

### Adding New Endpoints

1. Edit `tools/sanity-check.mjs`
2. Add endpoint to `REQUIRED_ENDPOINTS` or `OPTIONAL_ENDPOINTS`
3. Test locally: `npm run sanity`
4. Update documentation

### Modifying Workflow

1. Edit `.github/workflows/sanity-check.yml`
2. Test with manual dispatch
3. Create PR to validate changes

### Customizing Output

Modify the `logResult()` and `getGitHubComment()` methods in `tools/sanity-check.mjs` to customize output format.

## License

This sanity check pipeline is part of the project and follows the same license terms.