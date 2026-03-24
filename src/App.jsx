// App.jsx — LinkUp v3
// New: @username system · Profile picture upload · Group roles & invite code permissions
// Stack: React + Firebase SDK v10 + TailwindCSS

import { useState, useEffect, useRef, useCallback } from "react";
import {
  signInWithPopup, signOut, onAuthStateChanged,
} from "firebase/auth";
import {
  collection, addDoc, serverTimestamp, query, orderBy,
  onSnapshot, limit, doc, setDoc, getDoc, updateDoc,
  where, writeBatch, deleteField, getDocs,
} from "firebase/firestore";
import {
  ref, uploadBytes, getDownloadURL,
} from "firebase/storage";
import { auth, provider, db, storage } from "./firebase";
// NOTE: Make sure you export `storage` from ./firebase like:
//   import { getStorage } from "firebase/storage";
//   export const storage = getStorage(app);

// ─── Constants ────────────────────────────────────────────────────────────────
const REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];
const ANON_ADJECTIVES = ["Shadow","Blue","Silent","Neon","Dark","Swift","Cosmic","Iron","Storm","Ghost"];
const ANON_NOUNS = ["Fox","Comet","Traveler","Hawk","Wolf","Raven","Viper","Tide","Blaze","Nova"];
const ANON_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];

// Group role hierarchy: owner > admin > member
const ROLE_RANK = { owner: 3, admin: 2, member: 1 };
function canManageInvite(role) { return ROLE_RANK[role] >= ROLE_RANK.admin; }
function canManageRoles(role) { return ROLE_RANK[role] >= ROLE_RANK.owner; }
function canPromote(myRole, targetRole) {
  return ROLE_RANK[myRole] > ROLE_RANK[targetRole];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getDmId(a, b) { return [a, b].sort().join("_"); }
function generateAlias(uid) {
  const seed = uid.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return ANON_ADJECTIVES[seed % ANON_ADJECTIVES.length] + ANON_NOUNS[(seed * 7) % ANON_NOUNS.length];
}
function generateAnonColor(uid) {
  const seed = uid.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  return ANON_COLORS[seed % ANON_COLORS.length];
}
function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}
function randomInviteCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

 async function markChatAsRead(userId, chatId) {
    await updateDoc(doc(db, "users", userId), { [`lastSeen.${chatId}`]: serverTimestamp()});
  }

// ─── Username Setup Screen ────────────────────────────────────────────────────
// Shown once after first Google sign-in to set a @username
function UsernameSetup({ user, onComplete }) {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    const u = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!u || u.length < 3) { setError("Username must be at least 3 characters (letters, numbers, _)."); return; }
    if (u.length > 20) { setError("Username must be 20 characters or fewer."); return; }
    setLoading(true); setError("");
    try {
      // Check uniqueness
      const q = query(collection(db, "users"), where("username", "==", u));
      const snap = await getDocs(q);
      if (!snap.empty) { setError("That username is taken. Try another."); return; }
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        displayName: user.displayName,
        username: u,
        photoURL: user.photoURL,
        online: true,
        lastSeen: serverTimestamp(),
        createdAt: serverTimestamp(),
      }, { merge: true });
      onComplete(u);
    } finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="bg-[#0d0f18]/80 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-8 shadow-2xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-3xl shadow-lg">🎭</div>
          </div>
          <h1 className="text-2xl font-black text-white text-center mb-1">Pick a username</h1>
          <p className="text-slate-400 text-center text-sm mb-6">This is how others will see you in LinkUp.</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-sm">@</span>
              <input
                value={username}
                onChange={e => { setUsername(e.target.value); setError(""); }}
                placeholder="your_username"
                maxLength={20}
                className="w-full bg-slate-800/60 border border-slate-700/40 focus:border-emerald-500/60 text-slate-100 placeholder-slate-600 rounded-xl pl-8 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all"
              />
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <button type="submit" disabled={!username.trim() || loading}
              className="w-full py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-40 transition-all shadow-lg">
              {loading ? "Checking…" : "Set username"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Profile Settings Modal ───────────────────────────────────────────────────
function ProfileModal({ user, userProfile, onClose, onUpdated }) {
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(userProfile.photoURL || "");
  const [username, setUsername] = useState(userProfile.username || "");
  const [displayName, setDisplayName] = useState(userProfile.displayName || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const fileRef = useRef(null);

  function handleFileChange(e) {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { setError("Image must be under 5MB."); return; }
    setPhotoFile(f);
    setPhotoPreview(URL.createObjectURL(f));
    setError("");
  }

  async function handleSave() {
    const u = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (!u || u.length < 3) { setError("Username must be at least 3 characters."); return; }
    if (!displayName.trim()) { setError("Display name cannot be empty."); return; }
    setLoading(true); setError("");
    try {
      let photoURL = userProfile.photoURL;

      // Upload new photo if selected
      if (photoFile) {
        const storageRef = ref(storage, `avatars/${user.uid}`);
        await uploadBytes(storageRef, photoFile);
        photoURL = await getDownloadURL(storageRef);
      }

      // Check username uniqueness if changed
      if (u !== userProfile.username) {
        const q = query(collection(db, "users"), where("username", "==", u));
        const snap = await getDocs(q);
        if (!snap.empty) { setError("That username is taken."); setLoading(false); return; }
      }

      await updateDoc(doc(db, "users", user.uid), {
        username: u, displayName: displayName.trim(), photoURL,
      });
      onUpdated({ username: u, displayName: displayName.trim(), photoURL });
      onClose();
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d0f18] border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">Edit Profile</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Avatar */}
        <div className="flex flex-col items-center mb-5">
          <div className="relative group cursor-pointer" onClick={() => fileRef.current?.click()}>
            {photoPreview
              ? <img src={photoPreview} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-2 border-slate-700" />
              : <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-2xl font-bold text-white border-2 border-slate-700">
                  {(displayName || "?")[0].toUpperCase()}
                </div>
            }
            <div className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          <p className="text-xs text-slate-500 mt-2">Click to change photo</p>
        </div>

        {/* Fields */}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Display Name</label>
            <input value={displayName} onChange={e => setDisplayName(e.target.value)}
              className="w-full bg-slate-800/60 border border-slate-700/40 focus:border-emerald-500/50 text-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500/20 transition-all" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Username</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-emerald-500 font-bold text-sm">@</span>
              <input value={username} onChange={e => { setUsername(e.target.value); setError(""); }}
                maxLength={20}
                className="w-full bg-slate-800/60 border border-slate-700/40 focus:border-emerald-500/50 text-slate-200 rounded-xl pl-8 pr-4 py-2.5 text-sm outline-none focus:ring-1 focus:ring-emerald-500/20 transition-all" />
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-slate-400 bg-slate-800/60 hover:bg-slate-700/60 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={loading}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-40 transition-all">
            {loading ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Group Members Modal ──────────────────────────────────────────────────────
// For owners/admins: view members, manage roles, see invite code
function GroupMembersModal({ group, currentUser, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const myRole = group.members?.[currentUser.uid] || "member";

  useEffect(() => {
    async function loadMembers() {
      const uids = Object.keys(group.members || {});
      const profiles = await Promise.all(
        uids.map(uid => getDoc(doc(db, "users", uid)))
      );
      setMembers(profiles.map(d => ({
        ...d.data(),
        role: group.members[d.id],
        uid: d.id,
      })).sort((a, b) => ROLE_RANK[b.role] - ROLE_RANK[a.role]));
      setLoading(false);
    }
    loadMembers();
  }, [group]);

  async function changeRole(targetUid, newRole) {
    if (!canManageRoles(myRole)) return;
    await updateDoc(doc(db, "groups", group.id), {
      [`members.${targetUid}`]: newRole,
    });
    setMembers(prev => prev.map(m => m.uid === targetUid ? { ...m, role: newRole } : m));
  }

  async function removeMember(targetUid) {
    if (!canManageRoles(myRole)) return;
    await updateDoc(doc(db, "groups", group.id), {
      [`members.${targetUid}`]: deleteField(),
    });
    setMembers(prev => prev.filter(m => m.uid !== targetUid));
  }

  function copyInviteCode() {
    navigator.clipboard.writeText(group.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  const roleBadge = (role) => {
    const styles = {
      owner: "bg-amber-500/20 text-amber-400 border-amber-500/30",
      admin: "bg-violet-500/20 text-violet-400 border-violet-500/30",
      member: "bg-slate-700/40 text-slate-400 border-slate-600/30",
    };
    const icons = { owner: "👑", admin: "🛡️", member: "👤" };
    return (
      <span className={`text-[10px] border rounded-full px-2 py-0.5 ${styles[role]}`}>
        {icons[role]} {role}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d0f18] border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold text-lg">{group.name}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Invite code — only for owner/admin */}
        {canManageInvite(myRole) && (
          <div className="mb-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/40">
            <p className="text-[11px] text-slate-500 mb-1.5 uppercase tracking-widest font-semibold">Invite Code</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono text-emerald-400 tracking-widest">{group.inviteCode}</code>
              <button onClick={copyInviteCode}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-all border ${copiedCode ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-slate-700/60 text-slate-400 border-slate-600/40 hover:border-slate-500/60 hover:text-slate-300"}`}>
                {copiedCode ? "✓ Copied" : "Copy"}
              </button>
            </div>
            <p className="text-[10px] text-slate-600 mt-1.5">Only admins and owners can see this.</p>
          </div>
        )}

        {/* Members list */}
        <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">
          Members · {members.length}
        </p>
        <div className="flex-1 overflow-y-auto space-y-1.5">
          {loading && <p className="text-slate-600 text-sm text-center py-4">Loading…</p>}
          {members.map(m => {
            const isMe = m.uid === currentUser.uid;
            const canAct = canManageRoles(myRole) && !isMe && canPromote(myRole, m.role);
            return (
              <div key={m.uid} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-800/40 transition-colors">
                {m.photoURL
                  ? <img src={m.photoURL} className="w-8 h-8 rounded-full object-cover flex-shrink-0" alt={m.displayName} />
                  : <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
                      {(m.displayName || "?")[0]}
                    </div>
                }
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">
                    {m.displayName} {isMe && <span className="text-slate-600 text-xs">(you)</span>}
                  </p>
                  <p className="text-[11px] text-slate-500">@{m.username || "unknown"}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {roleBadge(m.role)}
                  {canAct && (
                    <div className="flex gap-1">
                      {m.role === "member" && (
                        <button onClick={() => changeRole(m.uid, "admin")}
                          title="Promote to admin"
                          className="w-6 h-6 rounded-lg bg-violet-500/20 hover:bg-violet-500/40 text-violet-400 text-xs flex items-center justify-center transition-colors">↑</button>
                      )}
                      {m.role === "admin" && (
                        <button onClick={() => changeRole(m.uid, "member")}
                          title="Demote to member"
                          className="w-6 h-6 rounded-lg bg-slate-700/60 hover:bg-slate-600/60 text-slate-400 text-xs flex items-center justify-center transition-colors">↓</button>
                      )}
                      <button onClick={() => removeMember(m.uid)}
                        title="Remove from group"
                        className="w-6 h-6 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-400 text-xs flex items-center justify-center transition-colors">✕</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button onClick={onClose} className="mt-4 w-full py-2 rounded-xl text-sm text-slate-400 bg-slate-800/60 hover:bg-slate-700/60 transition-colors">Close</button>
      </div>
    </div>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ photoURL, displayName, size = 9, online, anonColor }) {
  const initials = displayName ? displayName.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?";
  const sz = { 6:"w-6 h-6 text-[9px]",7:"w-7 h-7 text-[10px]",8:"w-8 h-8 text-xs",9:"w-9 h-9 text-xs",10:"w-10 h-10 text-sm",11:"w-11 h-11 text-sm" }[size] || "w-9 h-9 text-xs";
  return (
    <div className="relative flex-shrink-0">
      {photoURL
        ? <img src={photoURL} alt={displayName} className={`${sz} rounded-full object-cover`} />
        : <div className={`${sz} rounded-full flex items-center justify-center text-white font-bold`}
            style={{ background: anonColor || "linear-gradient(135deg,#10b981,#06b6d4)" }}>
            {initials}
          </div>
      }
      {online !== undefined && (
        <span className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-[#0f1117] ${online ? "bg-emerald-400" : "bg-slate-600"}`} />
      )}
    </div>
  );
}

// ─── Reaction Picker ──────────────────────────────────────────────────────────
function ReactionPicker({ onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return (
    <div ref={ref} className="absolute z-50 bottom-9 left-0 bg-[#1a1d27] border border-slate-700/60 rounded-2xl px-2 py-1.5 flex gap-1 shadow-2xl">
      {REACTIONS.map(r => (
        <button key={r} onClick={() => { onPick(r); onClose(); }}
          className="text-lg hover:scale-125 transition-transform p-0.5 leading-none">{r}</button>
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, isOwn, onReact, onEdit, onDelete, currentUid }) {
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(msg.text);
  const reactions = msg.reactions || {};

  if (msg.deleted) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
        <span className="text-xs text-slate-600 italic px-4 py-2 bg-slate-800/30 rounded-2xl">Message deleted</span>
      </div>
    );
  }

  return (
    <div className={`flex items-end gap-2 group ${isOwn ? "flex-row-reverse" : "flex-row"}`}>
      {!isOwn && (
        <Avatar
          photoURL={msg.isAnonymous ? null : msg.photoURL}
          displayName={msg.isAnonymous ? msg.anonAlias : msg.displayName}
          size={8}
          anonColor={msg.isAnonymous ? msg.anonColor : undefined}
        />
      )}
      <div className={`flex flex-col max-w-[72%] ${isOwn ? "items-end" : "items-start"}`}>
        {!isOwn && (
          <div className="flex items-center gap-1.5 mb-1 ml-1">
            {/* Show @username if available, else displayName */}
            <span className="text-[11px] font-medium" style={{ color: msg.isAnonymous ? msg.anonColor : "#94a3b8" }}>
              {msg.isAnonymous ? msg.anonAlias : (msg.username ? `@${msg.username}` : msg.displayName)}
            </span>
            {msg.isAnonymous && (
              <span className="text-[9px] bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded-full">anon</span>
            )}
          </div>
        )}

        <div className="relative">
          {editing ? (
            <div className="flex gap-2 items-center">
              <input
                value={editText}
                onChange={e => setEditText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") { onEdit(msg.id, editText); setEditing(false); }
                  if (e.key === "Escape") setEditing(false);
                }}
                className="bg-slate-700 text-white text-sm px-3 py-2 rounded-xl outline-none border border-emerald-500/50 min-w-[200px]"
                autoFocus
              />
              <button onClick={() => { onEdit(msg.id, editText); setEditing(false); }} className="text-xs text-emerald-400 hover:text-emerald-300">Save</button>
              <button onClick={() => setEditing(false)} className="text-xs text-slate-500 hover:text-slate-400">Cancel</button>
            </div>
          ) : (
            <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-md ${
              isOwn
                ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-br-sm"
                : "bg-[#1e2130] text-slate-100 border border-slate-700/40 rounded-bl-sm"
            }`}>
              {msg.text}
              {msg.edited && <span className="text-[10px] opacity-60 ml-1">(edited)</span>}
            </div>
          )}

          {!editing && (
            <div className={`absolute top-1/2 -translate-y-1/2 ${isOwn ? "right-full mr-2" : "left-full ml-2"} opacity-0 group-hover:opacity-100 transition-opacity flex gap-1`}>
              <button onClick={() => setShowPicker(p => !p)} className="w-6 h-6 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-xs">😊</button>
              {isOwn && (
                <>
                  <button onClick={() => { setEditText(msg.text); setEditing(true); }}
                    className="w-6 h-6 rounded-full bg-slate-700 hover:bg-slate-600 flex items-center justify-center">
                    <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  <button onClick={() => onDelete(msg.id)}
                    className="w-6 h-6 rounded-full bg-slate-700 hover:bg-red-500/60 flex items-center justify-center">
                    <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          )}

          {showPicker && (
            <ReactionPicker onPick={r => onReact(msg.id, r)} onClose={() => setShowPicker(false)} />
          )}
        </div>

        {Object.entries(reactions).length > 0 && (
          <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : "justify-start"}`}>
            {Object.entries(reactions).map(([emoji, uids]) => (
              <button key={emoji} onClick={() => onReact(msg.id, emoji)}
                className={`flex items-center gap-0.5 border rounded-full px-2 py-0.5 text-xs transition-colors ${
                  uids[currentUid]
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                    : "bg-slate-800/80 border-slate-700/40 hover:bg-slate-700/80 text-slate-300"
                }`}>
                {emoji} <span className="ml-0.5 text-slate-400">{Object.keys(uids).length}</span>
              </button>
            ))}
          </div>
        )}

        <span className="text-[10px] text-slate-600 mt-1 mx-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {formatTime(msg.createdAt)}
        </span>
      </div>
    </div>
  );
}

// ─── Typing Indicator ─────────────────────────────────────────────────────────
function TypingIndicator({ typers, currentUid }) {
  const others = Object.entries(typers || {}).filter(([uid]) => uid !== currentUid);
  if (others.length === 0) return null;
  const names = others.map(([, v]) => (v.username ? `@${v.username}` : v.name?.split(" ")[0])).slice(0, 2);
  const label = names.length === 1 ? `${names[0]} is typing` : `${names.join(" & ")} are typing`;
  return (
    <div className="flex items-center gap-2 px-4 py-1">
      <div className="flex gap-0.5">
        {[0,1,2].map(i => (
          <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
      <span className="text-xs text-slate-500">{label}</span>
    </div>
  );
}

// ─── Message Input ────────────────────────────────────────────────────────────
function MessageInput({ onSend, chatId, currentUid, displayName, username }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const ref = useRef(null);
  const typingTimer = useRef(null);

  function setTyping(isTyping) {
    if (!chatId) return;
    const typingRef = doc(db, "typing", chatId);
    if (isTyping) {
      setDoc(typingRef, { [currentUid]: { name: displayName, username, at: serverTimestamp() } }, { merge: true });
    } else {
      updateDoc(typingRef, { [currentUid]: deleteField() }).catch(() => {});
    }
  }

  function handleChange(e) {
    setText(e.target.value);
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 3000);
  }

  async function handleSend(e) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setText("");
    clearTimeout(typingTimer.current);
    setTyping(false);
    try { await onSend(t); }
    catch { setText(t); }
    finally { setSending(false); ref.current?.focus(); }
  }

  return (
    <form onSubmit={handleSend} className="flex items-end gap-2 p-3 bg-[#0f1117]/80 backdrop-blur border-t border-slate-800/60 flex-shrink-0">
      <textarea ref={ref} rows={1} value={text} onChange={handleChange}
        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) handleSend(e); }}
        placeholder="Type a message…"
        className="flex-1 bg-[#1e2130] border border-slate-700/50 focus:border-emerald-500/50 text-slate-100 placeholder-slate-600 rounded-xl px-4 py-2.5 text-sm resize-none outline-none transition-all focus:ring-2 focus:ring-emerald-500/20 max-h-32"
        style={{ fieldSizing: "content" }}
      />
      <button type="submit" disabled={!text.trim() || sending}
        className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shadow-lg transition-all hover:-translate-y-0.5 active:translate-y-0 flex-shrink-0">
        {sending
          ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          : <svg className="w-4 h-4 text-white translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
            </svg>
        }
      </button>
    </form>
  );
}

// ─── Message List ─────────────────────────────────────────────────────────────
function MessageList({ messages, user, onReact, onEdit, onDelete, typers }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typers]);
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
      {messages.length === 0 && (
        <div className="flex flex-col items-center justify-center h-full gap-2">
          <span className="text-4xl">💬</span>
          <p className="text-slate-500 text-sm">No messages yet — say hello!</p>
        </div>
      )}
      {messages.map(msg => (
        <MessageBubble key={msg.id} msg={msg} isOwn={msg.uid === user.uid}
          onReact={onReact} onEdit={onEdit} onDelete={onDelete} currentUid={user.uid} />
      ))}
      <TypingIndicator typers={typers} currentUid={user.uid} />
      <div ref={bottomRef} />
    </div>
  );
}

// ─── Global Chat ──────────────────────────────────────────────────────────────
function GlobalChat({ user, userProfile, isAnonymous }) {
  const [messages, setMessages] = useState([]);
  const [typers, setTypers] = useState({});
  const chatId = "global";
  const alias = generateAlias(user.uid);
  const anonColor = generateAnonColor(user.uid);

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "asc"), limit(100));
    return onSnapshot(q, snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  useEffect(() => {
    return onSnapshot(doc(db, "typing", chatId), snap => setTypers(snap.data() || {}));
  }, []);

  async function sendMessage(text) {
    await addDoc(collection(db, "messages"), {
      text, createdAt: serverTimestamp(), uid: user.uid,
      displayName: isAnonymous ? alias : userProfile.displayName,
      username: isAnonymous ? null : userProfile.username,
      photoURL: isAnonymous ? null : userProfile.photoURL,
      isAnonymous, anonAlias: alias, anonColor,
      deleted: false, edited: false,
    });
  }

  async function handleReact(msgId, emoji) {
    const r = doc(db, "messages", msgId);
    const snap = await getDoc(r);
    if (!snap.exists()) return;
    const uids = snap.data().reactions?.[emoji] || {};
    await updateDoc(r, { [`reactions.${emoji}.${user.uid}`]: uids[user.uid] ? deleteField() : true });
  }

  async function handleEdit(msgId, newText) {
    await updateDoc(doc(db, "messages", msgId), { text: newText, edited: true, editedAt: serverTimestamp() });
  }

  async function handleDelete(msgId) {
    await updateDoc(doc(db, "messages", msgId), { deleted: true });
  }

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} user={user} onReact={handleReact}
        onEdit={handleEdit} onDelete={handleDelete} typers={typers} />
      <MessageInput onSend={sendMessage} chatId={chatId}
        currentUid={user.uid} displayName={userProfile.displayName} username={userProfile.username} />
    </div>
  );
}

// ─── DM Chat ──────────────────────────────────────────────────────────────────
function DMChat({ user, userProfile, partner }) {
  const [messages, setMessages] = useState([]);
  const [typers, setTypers] = useState({});
  const dmId = getDmId(user.uid, partner.uid);

  useEffect(() => {
    const q = query(collection(db, "dms", dmId, "messages"), orderBy("createdAt", "asc"), limit(100));
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      const batch = writeBatch(db);
      snap.docs.forEach(d => {
        if (d.data().uid !== user.uid && !d.data().readBy?.[user.uid])
          batch.update(d.ref, { [`readBy.${user.uid}`]: true });
      });
      batch.commit().catch(() => {});
    });
    return () => unsub();
  }, [dmId, user.uid]);

  useEffect(() => {
    return onSnapshot(doc(db, "typing", dmId), snap => setTypers(snap.data() || {}));
  }, [dmId]);

  async function sendMessage(text) {
    await addDoc(collection(db, "dms", dmId, "messages"), {
      text, createdAt: serverTimestamp(), uid: user.uid,
      photoURL: userProfile.photoURL, displayName: userProfile.displayName,
      username: userProfile.username,
      readBy: { [user.uid]: true }, deleted: false, edited: false,
    });
    await setDoc(doc(db, "dms", dmId), {
      participants: [user.uid, partner.uid],
      lastMessage: text, lastAt: serverTimestamp(),
      [`unread.${partner.uid}`]: true,
    }, { merge: true });
  }

  async function handleReact(msgId, emoji) {
    const r = doc(db, "dms", dmId, "messages", msgId);
    const snap = await getDoc(r);
    if (!snap.exists()) return;
    const uids = snap.data().reactions?.[emoji] || {};
    await updateDoc(r, { [`reactions.${emoji}.${user.uid}`]: uids[user.uid] ? deleteField() : true });
  }

  async function handleEdit(msgId, newText) {
    await updateDoc(doc(db, "dms", dmId, "messages", msgId), { text: newText, edited: true, editedAt: serverTimestamp() });
  }

  async function handleDelete(msgId) {
    await updateDoc(doc(db, "dms", dmId, "messages", msgId), { deleted: true });
  }

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} user={user} onReact={handleReact}
        onEdit={handleEdit} onDelete={handleDelete} typers={typers} />
      <MessageInput onSend={sendMessage} chatId={dmId}
        currentUid={user.uid} displayName={userProfile.displayName} username={userProfile.username} />
    </div>
  );
}

// ─── Group Chat ───────────────────────────────────────────────────────────────
function GroupChat({ user, userProfile, group }) {
  const [messages, setMessages] = useState([]);
  const [typers, setTypers] = useState({});
  const chatId = `group_${group.id}`;

  useEffect(() => {
    const q = query(collection(db, "groups", group.id, "messages"), orderBy("createdAt", "asc"), limit(100));
    return onSnapshot(q, snap => setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [group.id]);

  useEffect(() => {
    return onSnapshot(doc(db, "typing", chatId), snap => setTypers(snap.data() || {}));
  }, [chatId]);

  async function sendMessage(text) {
    await addDoc(collection(db, "groups", group.id, "messages"), {
      text, createdAt: serverTimestamp(), uid: user.uid,
      photoURL: userProfile.photoURL, displayName: userProfile.displayName,
      username: userProfile.username,
      deleted: false, edited: false,
    });
    await updateDoc(doc(db, "groups", group.id), { lastMessage: text, lastAt: serverTimestamp() });
  }

  async function handleReact(msgId, emoji) {
    const r = doc(db, "groups", group.id, "messages", msgId);
    const snap = await getDoc(r);
    if (!snap.exists()) return;
    const uids = snap.data().reactions?.[emoji] || {};
    await updateDoc(r, { [`reactions.${emoji}.${user.uid}`]: uids[user.uid] ? deleteField() : true });
  }

  async function handleEdit(msgId, newText) {
    await updateDoc(doc(db, "groups", group.id, "messages", msgId), { text: newText, edited: true, editedAt: serverTimestamp() });
  }

  async function handleDelete(msgId) {
    await updateDoc(doc(db, "groups", group.id, "messages", msgId), { deleted: true });
  }

  return (
    <div className="flex flex-col h-full">
      <MessageList messages={messages} user={user} onReact={handleReact}
        onEdit={handleEdit} onDelete={handleDelete} typers={typers} />
      <MessageInput onSend={sendMessage} chatId={chatId}
        currentUid={user.uid} displayName={userProfile.displayName} username={userProfile.username} />
    </div>
  );
}

// ─── Create Group Modal ───────────────────────────────────────────────────────
function CreateGroupModal({ user, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const ref = await addDoc(collection(db, "groups"), {
        name: name.trim(), createdBy: user.uid,
        createdAt: serverTimestamp(),
        isPublic, inviteCode: randomInviteCode(),
        members: { [user.uid]: "owner" }, // creator is always owner
        lastMessage: "", lastAt: serverTimestamp(),
      });
      onCreated(ref.id);
      onClose();
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d0f18] border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-4">Create Group</h2>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Group name…"
          className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 placeholder-slate-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500/50 mb-3" />
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => setIsPublic(true)} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${isPublic ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800/40 text-slate-500 border border-slate-700/40"}`}>🌐 Public</button>
          <button onClick={() => setIsPublic(false)} className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${!isPublic ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800/40 text-slate-500 border border-slate-700/40"}`}>🔒 Private</button>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-slate-400 bg-slate-800/60 hover:bg-slate-700/60 transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={!name.trim() || loading}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 disabled:opacity-40 transition-all">
            {loading ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Join Group Modal ─────────────────────────────────────────────────────────
function JoinGroupModal({ user, onClose, onJoined }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    if (!code.trim()) return;
    setLoading(true); setError("");
    try {
      const q = query(collection(db, "groups"), where("inviteCode", "==", code.trim().toUpperCase()));
      const snap = await getDocs(q);
      if (snap.empty) { setError("Invalid invite code."); return; }
      const groupDoc = snap.docs[0];
      await updateDoc(doc(db, "groups", groupDoc.id), { [`members.${user.uid}`]: "member" });
      onJoined(groupDoc.id);
      onClose();
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[#0d0f18] border border-slate-700/60 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <h2 className="text-white font-bold text-lg mb-1">Join a Group</h2>
        <p className="text-slate-500 text-sm mb-4">Enter the invite code shared with you.</p>
        <input value={code} onChange={e => setCode(e.target.value)} placeholder="INVITE CODE…"
          className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 placeholder-slate-600 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500/50 mb-2 uppercase tracking-widest" />
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm text-slate-400 bg-slate-800/60 hover:bg-slate-700/60 transition-colors">Cancel</button>
          <button onClick={handleJoin} disabled={!code.trim() || loading}
            className="flex-1 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-emerald-500 to-teal-600 disabled:opacity-40 transition-all">
            {loading ? "Joining…" : "Join"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ user, userProfile, users, groups, activeChat, setActiveChat, dmUnreads,
                   globalUnread, mobileOpen, setMobileOpen, onCreateGroup, onJoinGroup,
                   onOpenProfile, groupUnreads }) {
  const [search, setSearch] = useState("");
  const filtered = users.filter(u =>
    u.uid !== user.uid && (
      u.displayName?.toLowerCase().includes(search.toLowerCase()) ||
      u.username?.toLowerCase().includes(search.toLowerCase())
    )
  );

  function select(chat) { setActiveChat(chat); setMobileOpen(false); }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/60 z-20 md:hidden" onClick={() => setMobileOpen(false)} />}
      <aside className={`fixed md:relative z-30 md:z-auto inset-y-0 left-0 w-72 flex flex-col bg-[#0d0f18] border-r border-slate-800/60 transition-transform duration-300 ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>

        {/* Profile — click to open edit */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-slate-800/60">
          <button onClick={onOpenProfile} className="flex items-center gap-3 flex-1 min-w-0 group">
            <div className="relative flex-shrink-0">
              <Avatar photoURL={userProfile.photoURL} displayName={userProfile.displayName} size={10} online={true} />
              <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-sm font-semibold text-white truncate">{userProfile.displayName}</p>
              <p className="text-[11px] text-emerald-400">@{userProfile.username} · Online</p>
            </div>
          </button>
          <button onClick={() => signOut(auth)} title="Sign out"
            className="w-8 h-8 rounded-lg bg-slate-800/60 hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center text-slate-400 transition-colors flex-shrink-0">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>

        {/* Global Chat */}
        <button onClick={() => select({ type: "global" })}
          className={`flex items-center gap-3 px-4 py-3 transition-colors ${activeChat?.type === "global" ? "bg-emerald-500/10 border-r-2 border-emerald-500" : "hover:bg-slate-800/40"}`}>
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-xl flex-shrink-0">🌏</div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-white">Global Chat</p>
            <p className="text-[11px] text-slate-500">Everyone · anon ok</p>
          </div>
          {globalUnread > 0 && (
            <span className="min-w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{globalUnread > 9 ? "9+" : globalUnread}</span>
          )}
        </button>

        {/* Groups */}
        <div className="px-4 pt-3 pb-1 flex items-center justify-between">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">Groups</p>
          <div className="flex gap-1">
            <button onClick={onJoinGroup} title="Join group"
              className="w-6 h-6 rounded-lg bg-slate-800/60 hover:bg-slate-700/60 text-slate-400 hover:text-white flex items-center justify-center text-xs transition-colors">+</button>
            <button onClick={onCreateGroup} title="Create group"
              className="w-6 h-6 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 flex items-center justify-center transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>
        </div>

        {groups.length === 0 && <p className="text-xs text-slate-600 text-center py-2 px-4">No groups yet</p>}
        {groups.map(g => {
          const isActive = activeChat?.type === "group" && activeChat?.group?.id === g.id;
          return (
            <button key={g.id} onClick={() => select({ type: "group", group: g })}
              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isActive ? "bg-emerald-500/10 border-r-2 border-emerald-500" : "hover:bg-slate-800/40"}`}>
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center text-base flex-shrink-0">
                {g.isPublic ? "🌐" : "🔒"}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-slate-200 truncate">{g.name}</p>
                <p className="text-[11px] text-slate-600">{Object.keys(g.members || {}).length} members</p>
              </div>
              {groupUnreads[g.id] > 0 && (
                <span className="min-w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1">
                  {groupUnreads[g.id] > 9 ? "9+" : groupUnreads[g.id]}
                </span>
              )}
            </button>
          );
        })}

        {/* DMs */}
        <div className="px-4 pt-3 pb-2">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest mb-2">Direct Messages</p>
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or @username…"
              className="w-full bg-slate-800/60 border border-slate-700/40 text-slate-200 placeholder-slate-600 rounded-lg pl-8 pr-3 py-2 text-xs outline-none focus:border-emerald-500/40 transition-all" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {filtered.map(u => {
            const dmId = getDmId(user.uid, u.uid);
            const unread = dmUnreads[dmId] || 0;
            const isActive = activeChat?.type === "dm" && activeChat?.partner?.uid === u.uid;
            return (
              <button key={u.uid} onClick={() => select({ type: "dm", partner: u })}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isActive ? "bg-emerald-500/10 border border-emerald-500/20" : "hover:bg-slate-800/40"}`}>
                <Avatar photoURL={u.photoURL} displayName={u.displayName} size={9} online={u.online} />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-medium text-slate-200 truncate">{u.displayName}</p>
                  <p className="text-[11px] text-slate-500 truncate">
                    {u.username ? `@${u.username}` : ""} · {u.online ? <span className="text-emerald-400">Online</span> : "Offline"}
                  </p>
                </div>
                {unread > 0 && (
                  <span className="min-w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{unread > 9 ? "9+" : unread}</span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && !search && <p className="text-xs text-slate-600 text-center py-4">No other users yet</p>}
          {filtered.length === 0 && search && <p className="text-xs text-slate-600 text-center py-4">No users found</p>}
        </div>
      </aside>
    </>
  );
}

// ─── Chat App ─────────────────────────────────────────────────────────────────
function ChatApp({ user, userProfile, onProfileUpdated }) {
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [activeChat, setActiveChat] = useState({ type: "global" });
  const [dmUnreads, setDmUnreads] = useState({});
  const [globalUnread, setGlobalUnread] = useState(0);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showJoinGroup, setShowJoinGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [lastSeenMap, setLastSeenMap] = useState({});
  const [groupUnreads, setGroupUnreads] = useState({});
  const prevChatRef = useRef(activeChat);
  const alias = generateAlias(user.uid);
  const anonColor = generateAnonColor(user.uid);

  // Presence
  useEffect(() => {
    const ref = doc(db, "users", user.uid);
    setDoc(ref, { uid: user.uid, displayName: userProfile.displayName, photoURL: userProfile.photoURL, online: true, lastOnline: serverTimestamp() }, { merge: true });
    const bye = () => setDoc(ref, { online: false, lastOnline: serverTimestamp() }, { merge: true });
    window.addEventListener("beforeunload", bye);
    return () => { window.removeEventListener("beforeunload", bye); bye(); };
  }, [user, userProfile]);

  useEffect(() => {
    return onSnapshot(collection(db, "users"), snap => setUsers(snap.docs.map(d => d.data())));
  }, []);

  useEffect(() => {
    const q = query(collection(db, "groups"), where(`members.${user.uid}`, "!=", null));
    return onSnapshot(q, snap => setGroups(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, [user.uid]);

  useEffect(() => {
    const q = query(collection(db, "dms"), where("participants", "array-contains", user.uid));
    return onSnapshot(q, snap => {
      const u = {};
      snap.docs.forEach(d => { if (d.data().unread?.[user.uid]) u[d.id] = 1; });
      setDmUnreads(u);
    });
  }, [user.uid]);

  useEffect(() => {
    if (activeChat?.type === "dm") {
      const dmId = getDmId(user.uid, activeChat.partner.uid);
      updateDoc(doc(db, "dms", dmId), { [`unread.${user.uid}`]: false }).catch(() => {});
      setDmUnreads(prev => ({ ...prev, [dmId]: 0 }));
    }
    if (activeChat?.type === "global") setGlobalUnread(0);
    prevChatRef.current = activeChat;
  }, [activeChat, user.uid]);

  useEffect(() => {
  if (activeChat?.type === "global") markChatAsRead(user.uid, "global");
  if (activeChat?.type === "dm") markChatAsRead(user.uid, getDmId(user.uid, activeChat.partner.uid));
  if (activeChat?.type === "group") markChatAsRead(user.uid, activeChat.group.id);
  }, [activeChat]);

  useEffect(() => {
    const q = query(collection(db, "messages"), orderBy("createdAt", "desc"), limit(1));
    return onSnapshot(q, snap => {
      if (prevChatRef.current?.type !== "global" && snap.docs[0]?.data().uid !== user.uid)
        setGlobalUnread(n => n + 1);
    });
  }, [user.uid]);
  
  useEffect(() => {
  return onSnapshot(doc(db, "users", user.uid), snap => {
    if (snap.exists()) {
      setLastSeenMap(snap.data().lastSeen || {});
      console.log("lastSeenMap loaded:", snap.data().lastSeen);
    }
    });
  }, [user.uid]);

  useEffect(() => {
  if (!lastSeenMap.global) return;
  const q = query(
    collection(db, "messages"),
    where("createdAt", ">", lastSeenMap.global),
    where("uid", "!=", user.uid)
  );
  return onSnapshot(q, snap => {
    if (activeChat?.type !== "global") {
      setGlobalUnread(snap.docs.length);
    }
  });
  }, [lastSeenMap.global, user.uid]);

  useEffect(() => {
  if (!groups.length) return;
  const unsubs = groups.map(g => {
    const chatId = g.id;
    const lastSeen = lastSeenMap[chatId];
    if (!lastSeen) return () => {};
    const q = query(
      collection(db, "groups", g.id, "messages"),
      where("createdAt", ">", lastSeen),
      where("uid", "!=", user.uid)
    );
    return onSnapshot(q, snap => {
      if (activeChat?.type !== "group" || activeChat?.group?.id !== g.id) {
        setGroupUnreads(prev => ({ ...prev, [g.id]: snap.docs.length }));
      }
    });
  });
  return () => unsubs.forEach(u => u());
  }, [lastSeenMap, groups, user.uid]);

  const partnerData = activeChat?.type === "dm" ? users.find(u => u.uid === activeChat.partner.uid) : null;
  const groupData = activeChat?.type === "group" ? groups.find(g => g.id === activeChat.group.id) : null;
  const myGroupRole = groupData?.members?.[user.uid];

  function getChatTitle() {
    if (activeChat?.type === "global") return "Global Chat";
    if (activeChat?.type === "dm") {
      const p = partnerData || activeChat.partner;
      return p.username ? `@${p.username}` : p.displayName;
    }
    if (activeChat?.type === "group") return groupData?.name || "Group";
    return "";
  }

  function getChatSubtitle() {
    if (activeChat?.type === "global") return `${users.filter(u => u.online).length} online · anonymous mode available`;
    if (activeChat?.type === "dm") return partnerData?.online ? "● Online" : "Offline";
    if (activeChat?.type === "group") return `${Object.keys(groupData?.members || {}).length} members · ${myGroupRole}`;
    return "";
  }

  return (
    <div className="flex h-screen bg-[#0f1117] overflow-hidden">
      <Sidebar user={user} userProfile={userProfile} users={users} groups={groups}
        activeChat={activeChat} setActiveChat={setActiveChat}
        dmUnreads={dmUnreads} globalUnread={globalUnread}
        mobileOpen={mobileOpen} setMobileOpen={setMobileOpen}
        onCreateGroup={() => setShowCreateGroup(true)}
        onJoinGroup={() => setShowJoinGroup(true)}
        onOpenProfile={() => setShowProfile(true)}
        groupUnreads={groupUnreads}
      />

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 bg-[#0d0f18]/80 backdrop-blur border-b border-slate-800/60 flex-shrink-0">
          <button onClick={() => setMobileOpen(true)}
            className="md:hidden w-8 h-8 rounded-lg bg-slate-800/60 flex items-center justify-center text-slate-400 hover:text-white mr-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {activeChat?.type === "dm"
            ? <Avatar photoURL={activeChat.partner.photoURL} displayName={activeChat.partner.displayName} size={9} online={partnerData?.online} />
            : activeChat?.type === "group"
            ? <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20 flex items-center justify-center text-xl">{groupData?.isPublic ? "🌐" : "🔒"}</div>
            : <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/20 flex items-center justify-center text-xl">🌏</div>
          }

          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-white truncate">{getChatTitle()}</h1>
            <p className={`text-[11px] truncate ${partnerData?.online ? "text-emerald-400" : "text-slate-500"}`}>
              {getChatSubtitle()}
            </p>
          </div>

          {/* Anon toggle */}
          {activeChat?.type === "global" && (
            <button onClick={() => setIsAnonymous(a => !a)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-all border ${
                isAnonymous ? "border-violet-500/40 bg-violet-500/20 text-violet-300" : "border-slate-700/40 bg-slate-800/40 text-slate-400 hover:text-slate-300"
              }`}>
              <span>{isAnonymous ? "👻" : "🙂"}</span>
              <span className="hidden sm:inline">{isAnonymous ? alias : "Go Anon"}</span>
            </button>
          )}

          {/* Group members/settings button — always visible in group chats */}
          {activeChat?.type === "group" && (
            <button onClick={() => setShowGroupMembers(true)}
              title={canManageInvite(myGroupRole) ? "Members & invite code" : "View members"}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-400 hover:text-white bg-slate-800/40 border border-slate-700/40 hover:border-slate-600/60 transition-all">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Members</span>
              {canManageInvite(myGroupRole) && (
                <span className="text-[9px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-full px-1.5">invite</span>
              )}
            </button>
          )}
        </header>

        {/* Chat content */}
        <div className="flex-1 min-h-0">
          {activeChat?.type === "global" && <GlobalChat user={user} userProfile={userProfile} isAnonymous={isAnonymous} />}
          {activeChat?.type === "dm" && <DMChat key={activeChat.partner.uid} user={user} userProfile={userProfile} partner={activeChat.partner} />}
          {activeChat?.type === "group" && <GroupChat key={activeChat.group.id} user={user} userProfile={userProfile} group={activeChat.group} />}
        </div>
      </div>

      {showCreateGroup && (
        <CreateGroupModal user={user} onClose={() => setShowCreateGroup(false)}
          onCreated={id => setActiveChat({ type: "group", group: { id } })} />
      )}
      {showJoinGroup && (
        <JoinGroupModal user={user} onClose={() => setShowJoinGroup(false)}
          onJoined={id => setActiveChat({ type: "group", group: { id } })} />
      )}
      {showProfile && (
        <ProfileModal user={user} userProfile={userProfile} onClose={() => setShowProfile(false)} onUpdated={onProfileUpdated} />
      )}
      {showGroupMembers && groupData && (
        <GroupMembersModal group={groupData} currentUser={user} onClose={() => setShowGroupMembers(false)} />
      )}
    </div>
  );
}

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, loading }) {
  return (
    <div className="min-h-screen bg-[#0f1117] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-1/3 left-1/3 w-96 h-96 bg-emerald-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/3 right-1/3 w-80 h-80 bg-teal-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10 w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/20 text-4xl">💬</div>
        </div>
        <div className="bg-[#0d0f18]/80 backdrop-blur-xl border border-slate-800/60 rounded-3xl p-8 shadow-2xl">
          <h1 className="text-3xl font-black text-white text-center mb-1 tracking-tight">LinkUp</h1>
          <p className="text-slate-400 text-center text-sm mb-8">Chat privately, in groups, or anonymously.</p>
          <button onClick={onLogin} disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 text-slate-800 font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed">
            {loading
              ? <div className="w-5 h-5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
              : <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
            }
            {loading ? "Signing in…" : "Continue with Google"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [user, setUser] = useState(undefined);         // Firebase auth user
  const [userProfile, setUserProfile] = useState(null); // Firestore profile
  const [authLoading, setAuthLoading] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); setUserProfile(null); return; }
      setUser(u);
      // Load Firestore profile
      const snap = await getDoc(doc(db, "users", u.uid));
      if (snap.exists()) {
        setUserProfile(snap.data());
      } else {
        setUserProfile(null); // will trigger UsernameSetup
      }
    });
  }, []);

  async function handleLogin() {
    setAuthLoading(true);
    try { await signInWithPopup(auth, provider); }
    catch (err) { console.error(err); }
    finally { setAuthLoading(false); }
  }

  function handleUsernameSet(username) {
    setUserProfile(prev => ({ ...prev, username }));
  }

  function handleProfileUpdated(updates) {
    setUserProfile(prev => ({ ...prev, ...updates }));
    // Sync presence doc with new displayName/photoURL
    updateDoc(doc(db, "users", user.uid), updates).catch(() => {});
  }

  // Loading spinner
  if (user === undefined || (user && userProfile === undefined)) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <LoginScreen onLogin={handleLogin} loading={authLoading} />;

  // New user: needs to set username
  if (!userProfile?.username) {
    return <UsernameSetup user={user} onComplete={handleUsernameSet} />;
  }

  return (
    <ChatApp
      user={user}
      userProfile={userProfile}
      onProfileUpdated={handleProfileUpdated}
    />
  );
}