import { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, updateDoc, collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { User, Shield, ShieldOff, Ghost, LogOut, ShieldAlert, UserX, UserCheck, AtSign, Camera, Check, HelpCircle, Mail, Instagram, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

const AVATARS = [
  'https://api.dicebear.com/7.x/avataaars/svg?seed=Felix',
  'https://api.dicebear.com/7.x/pixel-art/svg?seed=Ghost',
  'https://api.dicebear.com/7.x/bottts/svg?seed=Ultron',
  'https://api.dicebear.com/7.x/miniavs/svg?seed=Shadow',
  'https://api.dicebear.com/7.x/big-smile/svg?seed=Savage'
];

export default function ProfileView({ profile, onLogout }: { profile: any, onLogout: () => void }) {
  const [ghostMode, setGhostMode] = useState(profile?.ghostMode || false);
  const [autoPurge, setAutoPurge] = useState(profile?.autoPurge || false);
  const [username, setUsername] = useState(profile?.username || '');
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [photoURL, setPhotoURL] = useState(profile?.photoURL || '');
  const [soundEnabled, setSoundEnabled] = useState(profile?.soundEnabled !== false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("This payload is too heavy. Maximum 2MB allowed.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPhotoURL(reader.result as string);
    };
    reader.readAsDataURL(file);
  };
  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!profile?.blockedUsers || profile.blockedUsers.length === 0) {
      setBlockedUsers([]);
      return;
    }

    const q = query(
      collection(db, 'users'),
      where('uid', 'in', profile.blockedUsers)
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setBlockedUsers(snap.docs.map(doc => doc.data()));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'blocked_users');
    });

    return () => unsubscribe();
  }, [profile?.blockedUsers]);

  useEffect(() => {
    const changed = 
      username !== profile?.username || 
      displayName !== profile?.displayName || 
      photoURL !== profile?.photoURL;
    setHasChanges(changed);
  }, [username, displayName, photoURL, profile]);

  const saveProfile = async () => {
    if (!hasChanges) return;
    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      await updateDoc(userRef, { 
        username: username.toLowerCase().replace(/\s+/g, '_'), 
        displayName, 
        photoURL 
      });
      setHasChanges(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + auth.currentUser!.uid);
    } finally {
      setLoading(false);
    }
  };

  const toggleGhostMode = async () => {
    setLoading(true);
    try {
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      await updateDoc(userRef, { ghostMode: !ghostMode });
      setGhostMode(!ghostMode);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + auth.currentUser!.uid);
    } finally {
      setLoading(false);
    }
  };

  const unblockUser = async (uid: string) => {
    try {
      const userRef = doc(db, 'users', auth.currentUser!.uid);
      const currentBlocked = profile?.blockedUsers || [];
      const newBlocked = currentBlocked.filter((id: string) => id !== uid);
      await updateDoc(userRef, { blockedUsers: newBlocked });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'users/' + auth.currentUser!.uid);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-8 bg-[#0a0a0a] pb-32">
      {/* Profile Header */}
      <div className="flex flex-col items-center text-center space-y-6">
        <div className="relative group">
          <div 
            onClick={() => fileInputRef.current?.click()}
            className="w-28 h-28 rounded-[2rem] bg-zinc-900 border-2 border-zinc-800 flex items-center justify-center overflow-hidden transition-all group-hover:scale-105 cursor-pointer hover:border-zinc-500 shadow-2xl shadow-black/50"
          >
            {photoURL ? (
              <img src={photoURL} alt="ME" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <User className="w-12 h-12 text-zinc-700" />
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <Camera className="w-6 h-6 text-white" />
            </div>
          </div>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileUpload} 
            className="hidden" 
            accept="image/*"
          />
          {profile?.ghostMode && (
            <div className="absolute -bottom-1 -right-1 p-2 bg-blue-500 rounded-2xl border-4 border-[#0a0a0a] shadow-[0_0_15px_rgba(59,130,246,0.5)]">
              <Ghost className="w-4 h-4 text-white" />
            </div>
          )}
        </div>

        <AnimatePresence>
          {showAvatarPicker && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="flex flex-wrap justify-center gap-3 py-2"
            >
              {AVATARS.map((url) => (
                <button 
                  key={url}
                  onClick={() => { setPhotoURL(url); setShowAvatarPicker(false); }}
                  className={cn(
                    "w-12 h-12 rounded-xl border-2 transition-all p-1",
                    photoURL === url ? "border-white bg-zinc-800" : "border-zinc-800 bg-zinc-900"
                  )}
                >
                  <img src={url} className="w-full h-full" referrerPolicy="no-referrer" />
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="w-full space-y-4 max-w-xs mx-auto">
          <div className="relative group/input">
            <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-600 group-focus-within/input:text-zinc-300 transition-colors" />
            <input 
              type="text" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="username"
              className="w-full bg-zinc-900/50 border border-zinc-900 rounded-2xl py-3 pl-10 pr-4 text-sm font-bold focus:outline-none focus:border-zinc-700 transition-all text-center"
            />
          </div>
          <input 
            type="text" 
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Display Name"
            className="w-full bg-transparent border-none text-xl font-black text-center focus:outline-none placeholder:text-zinc-800"
          />

          {profile?.isAdmin && (
            <div className="flex flex-col items-center justify-center gap-2 mt-2">
              <motion.div 
                animate={{ 
                  boxShadow: ["0 0 10px rgba(234,179,8,0.1)", "0 0 20px rgba(234,179,8,0.3)", "0 0 10px rgba(234,179,8,0.1)"] 
                }}
                transition={{ duration: 2, repeat: Infinity }}
                className="bg-yellow-500/10 border border-yellow-500/30 px-4 py-1.5 rounded-full flex items-center gap-2"
              >
                <Shield className="w-4 h-4 text-yellow-500 fill-yellow-500/20" />
                <span className="text-[11px] font-black text-yellow-500 uppercase tracking-[0.2em] italic">Master Architect</span>
              </motion.div>
              <div className="text-[8px] text-zinc-600 font-bold uppercase tracking-widest">Digital Creator Authority</div>
            </div>
          )}
          
          <AnimatePresence>
            {hasChanges && (
              <motion.button
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                onClick={saveProfile}
                disabled={loading}
                className="w-full py-3 bg-white text-black font-bold rounded-2xl flex items-center justify-center gap-2 shadow-xl hover:bg-zinc-200 active:scale-95 transition-all"
              >
                <Check className="w-4 h-4" />
                Commit Changes
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-6">
        {/* Encryption Active Indicator */}
        <section className="bg-zinc-900/40 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Signal Encryption</h3>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.1em] opacity-50">E2EE ACTIVE</p>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-zinc-800 px-3 py-1 rounded-full border border-zinc-700">
               <motion.div 
                 animate={{ opacity: [0.3, 1, 0.3] }}
                 transition={{ repeat: Infinity, duration: 2 }}
                 className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" 
               />
               <span className="text-[9px] font-black text-green-500 uppercase tracking-widest">Secured</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
            Your identity keys are generated locally. All signals are encrypted with RSA-2048 & AES-256 before leaving your device. Even the Architect cannot read them.
          </p>
        </section>

        {/* Sound Notifications Toggle */}
        <section className="bg-zinc-900/40 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-2xl transition-all shadow-inner",
                soundEnabled ? "bg-green-500/10 text-green-500" : "bg-zinc-800 text-zinc-600"
              )}>
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Audio Signals</h3>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.1em] opacity-50">
                  {soundEnabled ? "Audible Alerts" : "Silent Ops"}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                const newState = !soundEnabled;
                setSoundEnabled(newState);
                await updateDoc(doc(db, 'users', auth.currentUser!.uid), { soundEnabled: newState });
              }}
              className={cn(
                "relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 focus:outline-none border-2",
                soundEnabled ? "bg-green-600 border-green-400" : "bg-zinc-800 border-zinc-700"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 shadow-lg",
                  soundEnabled ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
            Toggle high-frequency audio alerts for incoming transmissions. Silent mode recommended for covert operations.
          </p>
        </section>

        {/* Ghost Mode Toggle */}
        <section className="bg-zinc-900/40 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-2xl transition-all shadow-inner",
                ghostMode ? "bg-blue-500/10 text-blue-400" : "bg-zinc-800 text-zinc-600"
              )}>
                {ghostMode ? <Shield className="w-6 h-6 shadow-blue-500/50" /> : <ShieldOff className="w-6 h-6" />}
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Ghost Mode</h3>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.1em] opacity-50">
                  {ghostMode ? "Presence Hidden" : "Visible in the void"}
                </p>
              </div>
            </div>
            <button
              onClick={toggleGhostMode}
              disabled={loading}
              className={cn(
                "relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 focus:outline-none border-2",
                ghostMode ? "bg-blue-600 border-blue-400" : "bg-zinc-800 border-zinc-700"
              )}
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300 shadow-lg",
                  ghostMode ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
            In Ghost Mode, you will not appear "Online" and message "Seen" receipts will be suppressed. Total invisibility for the elite operator.
          </p>
        </section>

        {/* Purge Toggle */}
        <section className="bg-zinc-900/40 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={cn(
                "p-3 rounded-2xl transition-all shadow-inner",
                autoPurge ? "bg-red-500/10 text-red-500" : "bg-zinc-800 text-zinc-600"
              )}>
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-tight">Purge Protocol</h3>
                <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.1em] opacity-50">
                  {autoPurge ? "Self-Destruct Active" : "Persistent Logs"}
                </p>
              </div>
            </div>
            <button
              onClick={async () => {
                const newState = !autoPurge;
                setAutoPurge(newState);
                await updateDoc(doc(db, 'users', auth.currentUser!.uid), { autoPurge: newState });
              }}
              className={cn(
                "relative inline-flex h-7 w-12 items-center rounded-full transition-all duration-300 focus:outline-none border-2",
                autoPurge ? "bg-red-600 border-red-400" : "bg-zinc-800 border-zinc-700"
              )}
            >
              <span className={cn(
                "inline-block h-4 w-4 transform rounded-full bg-white transition-all duration-300",
                autoPurge ? "translate-x-6" : "translate-x-1"
              )} />
            </button>
          </div>
          <p className="text-[11px] text-zinc-500 leading-relaxed font-medium">
            When enabled, all your chat conversations will be automatically incinerated every time you refresh the application.
          </p>
        </section>

        {/* Block List */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1 text-[10px] font-black text-zinc-600 uppercase tracking-[0.3em]">
            <UserX className="w-3 h-3 text-red-500/50" />
            Restricted souls
          </div>
          <div className="space-y-2">
            {blockedUsers.length > 0 ? (
              blockedUsers.map((u) => (
                <div key={u.uid} className="flex items-center justify-between p-4 bg-zinc-900/20 border border-zinc-900/50 rounded-2xl hover:bg-zinc-900/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700">
                      {u.photoURL ? (
                         <img src={u.photoURL} alt="X" className="w-full h-full object-cover rounded-lg" referrerPolicy="no-referrer" />
                      ) : (
                        <User className="w-4 h-4 text-zinc-600" />
                      )}
                    </div>
                    <span className="text-sm font-bold tracking-tight">{u.displayName}</span>
                  </div>
                  <div className="flex gap-2">
                    {profile?.isAdmin && (
                      <button 
                        onClick={async () => {
                          if (confirm(`TERMINATE SIGNAL FOR ${u.displayName}?`)) {
                            await updateDoc(doc(db, 'users', u.uid), { isBanned: true });
                            alert("SIGNAL INCINERATED.");
                          }
                        }}
                        className="p-2.5 bg-zinc-900 hover:bg-red-600 text-zinc-500 hover:text-white rounded-xl transition-all active:scale-90"
                        title="Incinierate User"
                      >
                        <ShieldAlert className="w-4 h-4" />
                      </button>
                    )}
                    <button 
                      onClick={() => unblockUser(u.uid)}
                      className="p-2.5 bg-zinc-900 hover:bg-white hover:text-black rounded-xl text-blue-400 transition-all active:scale-90"
                    >
                      <UserCheck className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 border-2 border-dashed border-zinc-900/50 rounded-[2rem] text-zinc-700 text-xs font-bold uppercase tracking-widest opacity-50">
                The jail is empty.
              </div>
            )}
          </div>
        </section>
        
        {/* Support & Intel Section */}
        <section className="bg-zinc-900/40 border border-zinc-900 rounded-[2rem] p-6 space-y-4">
          <div className="flex items-center gap-4 px-1 text-left">
             <div className="p-3 bg-white/5 rounded-2xl text-zinc-400">
               <HelpCircle className="w-6 h-6" />
             </div>
             <div className="text-left">
               <h3 className="text-sm font-bold tracking-tight">Support & Intel</h3>
               <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.1em] opacity-50">Report Signal Disruptions</p>
             </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <a 
              href="mailto:piyushsingh240995@gmail.com"
              className="flex flex-col items-center justify-center p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-500 hover:bg-zinc-800/50 transition-all group"
            >
              <Mail className="w-5 h-5 text-zinc-500 group-hover:text-white mb-2" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 group-hover:text-zinc-300">Email Intel</span>
            </a>
            <a 
              href="https://www.instagram.com/senpai_ronzai?igsh=MW02Znd6Zmd0aHhhZA=="
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center justify-center p-4 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-zinc-500 hover:bg-zinc-800/50 transition-all group"
            >
              <Instagram className="w-5 h-5 text-zinc-500 group-hover:text-pink-500 mb-2" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-600 group-hover:text-zinc-300">Instagram</span>
            </a>
          </div>
        </section>

        {/* Account Controls */}
        <button
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-3 py-5 bg-red-950/20 text-red-500 border border-red-900/20 rounded-2xl hover:bg-red-500 hover:text-white transition-all group font-black text-xs uppercase tracking-[0.2em]"
        >
          <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Abandon Protocols
        </button>
      </div>

      {/* Footer Branding */}
      <div className="pt-10 pb-6 text-center opacity-10 hover:opacity-100 transition-opacity flex flex-col items-center">
        <div className="w-8 h-8 rounded-full border border-zinc-800 flex items-center justify-center mb-4">
          <Ghost className="w-4 h-4 text-zinc-500" />
        </div>
        <p className="text-[9px] font-black uppercase tracking-[0.5em] text-zinc-500 mb-1">Stealth Protocol v1.2</p>
        <p className="text-[8px] font-medium text-zinc-600 tracking-widest">ENCRYPTED & UNTRACEABLE</p>
      </div>
    </div>
  );
}
