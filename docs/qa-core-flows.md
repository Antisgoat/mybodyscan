## QA: Core flows (MyBodyScan)

This checklist is written for **web + iOS Safari**. Repeat each flow on:
- **Web**: Chrome (latest) + Safari (latest, if available)
- **iOS Safari**: iPhone (latest iOS you can test)

### Auth (Apple / Google / Email)

- **Apple**
  - Open `/auth`
  - Tap **Continue with Apple**
  - Confirm you land on `/today` (or the `next=` route)
  - Refresh the page and confirm you stay signed in

- **Google**
  - Open `/auth`
  - Tap **Continue with Google**
  - Confirm you land on `/today`
  - Refresh and confirm session persists

- **Email**
  - Open `/auth`
  - Sign up / sign in with email
  - Confirm you land on `/today`
  - Refresh and confirm session persists

### Scan: start → upload → result

- Open `/scan`
- Enter required inputs (current + goal weight)
- Choose photos for **front/back/left/right**
  - On iOS Safari, test both:
    - Using camera capture
    - Using an existing photo from the library
- Tap **Analyze scan**
- Confirm:
  - UI shows **preparing/uploading** then **analyzing**
  - Upload progress does not stall at **0%** for long periods
  - If you turn on airplane mode mid-upload, you get a clear error and can retry
- After completion, confirm the scan shows:
  - **Status**: complete
  - A visible estimate and plans (or a clear error state with `debugId`)
- Retry behaviors:
  - If analysis fails, confirm you can **Retry analysis** or **Retake photos** (as applicable)

### Diary: add food → edit serving → delete item

- Open `/meals`
- Confirm the page renders without crashes (even if totals/macros are missing)
- Use date arrows to move a day backward and forward; confirm the diary updates
- For a meal section (Breakfast/Lunch/Dinner/Snacks):
  - Tap **Add food**
  - Search for an item
  - Select an item and open the serving editor
  - Change units/quantity, then tap **Add**
  - Confirm:
    - Modal closes
    - Item appears in the correct meal section
    - Totals update immediately
- Delete:
  - Tap **Remove** on an item
  - Confirm totals update and item is removed

### Program start → Workouts plan visible

- Open `/programs`
- Open any program detail
- Tap **Start program**
- Confirm:
  - No “Load failed”
  - You are routed to `/workouts?plan=<id>&started=1`
  - The plan loads without manual refresh (allowing a brief propagation window)

### Coach chat: persistence across reload

- Open `/coach`
- Tap **New chat**
- Send a message
- Confirm:
  - Your message appears immediately in the thread
  - The assistant reply appears shortly after
- Refresh the page
- Confirm:
  - The most recent thread loads automatically
  - Prior messages are visible
- Start another thread via **New chat** and confirm the selector switches threads

