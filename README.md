# LinkUP — Real-Time Messaging App

> A full-featured real-time chat application built with React, Firebase, and Tailwind CSS — featuring anonymous global chat, direct messaging, group chats with role-based permissions, and live online presence.

**🔗 Live App: [linkup-a009e.web.app](https://linkup-a009e.web.app)**

---

## Screenshots

> Sign in with Google to explore all features.

---

## Features

### Authentication & Identity
- Google Sign-In via Firebase Auth
- **@username system** — unique username setup on first login with real-time availability check
- Profile picture upload to Firebase Storage (up to 5MB)
- Editable display name and avatar

### Global Chat
- Public chat room accessible to all users
- **Anonymous mode** — toggle between your real identity and a randomly generated alias (e.g. "ShadowFox", "CosmicRaven") with a unique color per user
- Alias is deterministic per user — consistent across sessions but untraceable

### Direct Messaging
- One-on-one private conversations
- Real-time message delivery via Firestore listeners
- Online/offline presence indicator per user
- Relative timestamps (just now, 5m ago, today at 2:30 PM)

### Group Chats
- Create public or private group chats
- **Invite code system** — generate and share codes to invite members
- **Role-based permissions** with 3-tier hierarchy:
  - `owner` — full control, manage roles, delete group
  - `admin` — manage invite codes, remove members
  - `member` — send messages, view members
- Role promotion/demotion enforced server-side via Firestore rules
- Group members panel with role badges

### Messaging
- Real-time message sync across all connected clients
- **Emoji reactions** (👍 ❤️ 😂 😮 😢 🔥) on any message
- Message timestamps with smart relative formatting
- Auto-scroll to latest message

### Presence System
- Live online/offline status for all users
- Presence updated on auth state change and app visibility

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 18 + Vite |
| Styling | Tailwind CSS |
| Authentication | Firebase Auth (Google Sign-In) |
| Database | Firebase Firestore (real-time listeners) |
| File Storage | Firebase Storage |
| Hosting | Firebase Hosting |
| State Management | React hooks (useState, useEffect, useRef, useCallback) |

---

## Architecture Highlights

### Component Structure
```
App.jsx
├── LoginScreen          — Google Sign-In UI
├── UsernameSetup        — First-time username registration
├── ChatApp              — Main application shell
│   ├── Sidebar          — Chat list, user search, group management
│   ├── GlobalChat       — Public chat with anonymous mode
│   ├── DMChat           — Direct message conversations
│   └── GroupChat        — Group chat with role enforcement
└── Modals
    ├── ProfileModal     — Edit profile, upload avatar
    ├── CreateGroupModal — Create new group chat
    ├── JoinGroupModal   — Join via invite code
    └── GroupMembersModal — Member management, roles, invite codes
```

### Key Technical Decisions

**Real-time listeners over polling** — All chat data uses Firestore `onSnapshot` listeners for instant message delivery without HTTP polling overhead.

**Deterministic anonymous aliases** — Anonymous identities are generated from a seeded hash of the user's UID. The same user always gets the same alias, preventing identity spoofing while keeping true anonymity from other users.

**Batch writes for consistency** — Group membership changes use Firestore `writeBatch` to ensure atomic updates across multiple documents.

**Role hierarchy enforcement** — The `canManageInvite` and `canManageRoles` functions enforce permissions client-side, backed by Firestore Security Rules server-side.

---

## Running Locally

```bash
# Clone the repo
git clone https://github.com/francisalbertespina-spec/LinkUP-Messaging-App.git
cd LinkUP-Messaging-App

# Install dependencies
npm install

# Set up Firebase config
# Create src/firebase.js with your Firebase project credentials
# (see Firebase Console → Project Settings → Your Apps)

# Start dev server
npm run dev
```

### Firebase Setup

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com)
2. Enable **Authentication** → Google Sign-In provider
3. Enable **Firestore Database**
4. Enable **Storage**
5. Enable **Hosting**
6. Copy your config to `src/firebase.js`

### Firestore Collections

| Collection | Purpose |
|---|---|
| `users` | User profiles, username, photoURL, online status |
| `messages` | Global chat messages |
| `dms/{dmId}/messages` | Direct message threads |
| `groups` | Group metadata, members, roles, invite codes |
| `groups/{id}/messages` | Group chat messages |

---

## Deployment

```bash
# Build for production
npm run build

# Deploy to Firebase Hosting
firebase deploy
```

---

## Related Projects

This app is part of a personal portfolio demonstrating full-stack development across different tech stacks:

| Project | Stack | Link |
|---|---|---|
| HDJV WMS | Vanilla JS + Google Apps Script | [github.com/francisalbertespina-spec/Waste-log-V5](https://github.com/francisalbertespina-spec/Waste-log-V5) |
| Environmental Dashboard | Power BI + DAX + Excel | [github.com/EMU-HDJV/Environmental-Dashboard](https://github.com/EMU-HDJV/Environmental-Dashboard) |
| LinkUP | React + Firebase | This repo |

---

## Author

**E. Francis Albert Espina** — Electronics and Communications Engineer transitioning into software development.

- GitHub: [github.com/francisalbertespina-spec](https://github.com/francisalbertespina-spec)
- Email: efrancisalbert@gmail.com
