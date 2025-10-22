# Unblock Firebase Web API key (fix IdentityToolkit 404/CORS)
1) Confirm the key in use:
   - Open https://mybodyscanapp.com/__/firebase/init.json and copy "apiKey".
2) Google Cloud Console → APIs & Services → Credentials → API keys → open the key matching init.json.
3) Recommended:
   - Application restrictions: None (unrestricted)
   - API restrictions: Don’t restrict key
   Save and wait ~2 minutes.
4) If you must restrict by HTTP referrers, add ALL of these patterns (or requests will 404/CORS on those origins):
   https://mybodyscanapp.com/*
   https://www.mybodyscanapp.com/*
   https://mybodyscan-f3daf.web.app/*
   https://mybodyscan-f3daf.firebaseapp.com/*
   http://localhost/*
   http://127.0.0.1/*
   http://localhost:5173/*
   http://127.0.0.1:5173/*
5) Fastest repair:
   - Firebase Console → Project settings → General → Web API Key → Regenerate
   - Wait 1–2 min, verify /__/firebase/init.json shows the new key
   - Test in a fresh tab:
     https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/clientConfig?key=NEW_KEY
     Expect HTTP 200 with JSON
