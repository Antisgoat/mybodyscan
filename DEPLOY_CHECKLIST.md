# Deploy Checklist

1. **Deploy rules and functions**
   ```bash
   firebase deploy --only firestore:rules,functions:runBodyScan --project mybodyscan-f3daf
   ```
2. **Build and deploy hosting**
   ```bash
   npm run build && firebase deploy --only hosting --project mybodyscan-f3daf
   ```
3. **Verify credits & ledger**
   - After a scan completes in prod, ensure credits decrement by 1.
   - Confirm a matching ledger entry is created.
4. **Tail logs**
   ```bash
   firebase functions:log --only runBodyScan --project mybodyscan-f3daf
   ```
