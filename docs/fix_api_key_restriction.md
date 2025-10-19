# Repairing Firebase Web API Key Restrictions

Follow these steps to unblock Firebase Authentication if IdentityToolkit calls return 404 or fail due to CORS restrictions.

1. **Confirm the key in use**
   - Open `https://mybodyscanapp.com/__/firebase/init.json` in a browser and copy the value of the `apiKey` field.

2. **Locate the key in Google Cloud Console**
   - Visit [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *APIs & Services* → *Credentials*.
   - Select the API key whose value matches the key from `init.json`.

3. **Apply recommended unrestricted settings (preferred)**
   - Application restrictions: **None** (unrestricted).
   - API restrictions: **Don't restrict key**.
   - Click **Save** and wait 1–2 minutes for the change to propagate.

4. **If HTTP referrer restrictions are required**
   - Add *all* authorized domains or redirects, otherwise IdentityToolkit returns 404/CORS errors.
   - Include each of these patterns:
     - `https://mybodyscanapp.com/*`
     - `https://www.mybodyscanapp.com/*`
     - `https://mybodyscan-f3daf.web.app/*`
     - `https://mybodyscan-f3daf.firebaseapp.com/*`
     - `http://localhost/*`
     - `http://127.0.0.1/*`
     - `http://localhost:5173/*`
     - `http://127.0.0.1:5173/*`

5. **Fastest repair via regeneration**
   - In Firebase Console → *Project settings* → *General*, click **Regenerate** next to *Web API Key*.
   - Wait ~1–2 minutes.
   - Confirm `https://mybodyscanapp.com/__/firebase/init.json` now shows the new key.
   - Test the new key with `https://identitytoolkit.googleapis.com/v2/projects/mybodyscan-f3daf/clientConfig?key=NEW_KEY`; it should respond with HTTP 200.
