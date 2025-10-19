# Fix Firebase Web API Key Restrictions

Follow these steps to unblock Identity Toolkit requests for MyBodyScan.

## 1. Locate the active Firebase Web API key
1. Open [`https://mybodyscanapp.com/__/firebase/init.json`](https://mybodyscanapp.com/__/firebase/init.json).
2. Copy the `apiKey` value from the JSON response.
3. In the [Google Cloud Console](https://console.cloud.google.com/apis/credentials?project=mybodyscan-f3daf), go to **APIs & Services → Credentials** and find the API key that matches the copied value.

## 2. Recommended restriction settings
- **Application restrictions:** set to **None** (unrestricted).
- **API restrictions:** **Don't restrict key**.
- Click **Save** and wait a few minutes for the changes to propagate.

## 3. Optional HTTP referrer restrictions
If restrictions are required, allow **all** of the following referrer patterns:
```
https://mybodyscanapp.com/*
https://www.mybodyscanapp.com/*
https://mybodyscan-f3daf.web.app/*
https://mybodyscan-f3daf.firebaseapp.com/*
http://localhost/*
http://127.0.0.1/*
http://localhost:5173/*
http://127.0.0.1:5173/*
http://localhost:5000/*
http://127.0.0.1:5000/*
```

## 4. Optional gcloud CLI commands
Use the console UI above whenever possible. The following commands are available for advanced users:
```bash
gcloud services api-keys list --project=mybodyscan-f3daf

gcloud services api-keys update KEY_ID \
  --project=mybodyscan-f3daf \
  --clear-allowed-referrers \
  --clear-api-targets
```
Replace `KEY_ID` with the identifier of the API key you need to update.

## 5. Verify the fix
In the browser's DevTools Network tab, confirm that requests to
`https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/clientConfig?key=...`
return **200** without CORS or 404 errors.
