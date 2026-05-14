/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { auth, db, signIn, logout, handleFirestoreError, OperationType } from './lib/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, updateDoc, serverTimestamp, collection, query, where, getDocs, writeBatch, deleteDoc } from 'firebase/firestore';
import { MessageSquare, Bot, User, Ghost, LogOut, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { generateIdentityKeys, unwrapPrivateKey } from './lib/crypto';
import ChatListView from './components/ChatListView';
import ChatView from './components/ChatView';
import UltronView from './components/UltronView';
import ProfileView from './components/ProfileView';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [privateKey, setPrivateKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chats' | 'ultron' | 'profile'>('chats');
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [totalUnread, setTotalUnread] = useState(0);
  const prevUnreadCounts = useRef<Record<string, number>>({});
  const isFirstLoad = useRef(true);

  useEffect(() => {
    // Request notification permission
    if (Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u) {
        setLoading(false);
        setInitError(null);
        setProfile(null);
        setPrivateKey(null);
        isFirstLoad.current = true;
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;

    let unsubProfile: (() => void) | null = null;
    let unsubConvList: (() => void) | null = null;

    const userRef = doc(db, 'users', user!.uid);
    const privateKeyRef = doc(db, 'private_keys', user!.uid);

    async function syncProfile() {
      console.log("Protocol Handshake Initialized...");
      setInitError(null);

      // Safety timeout to prevent infinite loading state
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("HANDSHAKE_TIMEOUT: Signal unstable. Check connection.")), 15000)
      );

      try {
        await Promise.race([
          (async () => {
            const [snap, pvSnap] = await Promise.all([
              getDoc(userRef),
              getDoc(privateKeyRef)
            ]);
            
            let currentProfile: any = null;

            if (!snap.exists()) {
              console.log("New Entity Detected. Generating Identity Keys...");
              const keys = await generateIdentityKeys(user!.uid);
              const generatedUsername = (user!.displayName || 'user').toLowerCase().replace(/\s+/g, '_') + '_' + Math.floor(Math.random() * 1000);
              
              currentProfile = {
                uid: user!.uid,
                username: generatedUsername,
                displayName: user!.displayName || 'Anon Ghost',
                email: user!.email,
                photoURL: user!.photoURL,
                ghostMode: false,
                soundEnabled: true,
                autoPurge: false,
                blockedUsers: [],
                publicKey: keys.publicKey,
                isAdmin: user!.email === 'piyushsingh240995@gmail.com',
                lastSeen: serverTimestamp()
              };

              const rawPrivateKey = await unwrapPrivateKey(keys.wrappedPrivateKey, keys.vaultIv, user!.uid);

              await Promise.all([
                setDoc(userRef, currentProfile).catch(e => {
                  console.error("Profile creation failed:", e);
                  throw new Error("PROVISION_FAILED: Protocol could not write identity to database.");
                }),
                setDoc(privateKeyRef, { 
                  wrappedPrivateKey: keys.wrappedPrivateKey, 
                  vaultIv: keys.vaultIv,
                  createdAt: serverTimestamp() 
                }).catch(e => {
                  console.error("Vault creation failed:", e);
                  throw new Error("VAULT_SEALING_FAILED: Encrypted keys could not be stored.");
                })
              ]);
              
              setProfile(currentProfile);
              setPrivateKey(rawPrivateKey);
              console.log("Handshake Complete (New Identity)");
            } else {
              console.log("Existing Entity Recognized. Unwrapping Vault...");
              currentProfile = snap.data();
              const updates: any = {};
              
              const pvData = pvSnap.data();
              if (!currentProfile.publicKey || !pvSnap.exists() || !pvData?.wrappedPrivateKey) {
                console.log("Public Key missing or legacy vault found. Regenerating...");
                const keys = await generateIdentityKeys(user!.uid);
                updates.publicKey = keys.publicKey;
                await setDoc(privateKeyRef, { 
                  wrappedPrivateKey: keys.wrappedPrivateKey, 
                  vaultIv: keys.vaultIv,
                  createdAt: serverTimestamp() 
                });
                const rawPrivateKey = await unwrapPrivateKey(keys.wrappedPrivateKey, keys.vaultIv, user!.uid);
                setPrivateKey(rawPrivateKey);
              } else {
                try {
                  const rawPrivateKey = await unwrapPrivateKey(pvData.wrappedPrivateKey, pvData.vaultIv, user!.uid);
                  setPrivateKey(rawPrivateKey);
                } catch (cryptoErr) {
                  console.error("Vault decryption failed:", cryptoErr);
                  throw new Error("VAULT_CORRUPTION: Security keys are malformed or inaccessible. Your identity handshake failed.");
                }
              }

              if (currentProfile.soundEnabled === undefined) {
                updates.soundEnabled = true;
              }
              
              const isAdmin = user!.email === 'piyushsingh240995@gmail.com';
              if (currentProfile.isAdmin !== isAdmin) {
                updates.isAdmin = isAdmin;
              }
              
              if (!currentProfile.username) {
                updates.username = (user!.displayName || 'user').toLowerCase().replace(/\s+/g, '_') + '_' + Math.floor(Math.random() * 1000);
              }

              if (Object.keys(updates).length > 0) {
                await updateDoc(userRef, updates);
                currentProfile = { ...currentProfile, ...updates };
              }

              setProfile(currentProfile);
              console.log("Handshake Complete (Established Identity)");
            }
          })(),
          timeoutPromise
        ]);
      } catch (error: any) {
        console.error("CRITICAL PROTOCOL ERROR:", error);
        setInitError(error?.message || "HANDSHAKE_TIMEOUT: Signal unstable.");
      } finally {
        setLoading(false);
      }
    }

      // Live profile updates
      unsubProfile = onSnapshot(userRef, async (s) => {
        const data = s.data();
        if (data?.isBanned) {
          await auth.signOut();
          alert("BY THE WILL OF THE ARCHITECT, YOUR SIGNAL HAS BEEN PERMANENTLY INCINERATED.");
        }
        setProfile(data);
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users/' + user!.uid);
      });

      // Conversations listener
      const qConv = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', user!.uid)
      );
      
      unsubConvList = onSnapshot(qConv, (snap) => {
        let total = 0;
        const newCounts: Record<string, number> = {};
        
        snap.docs.forEach(doc => {
          const data = doc.data();
          const count = data.unreadCount?.[user!.uid] || 0;
          total += count;
          newCounts[doc.id] = count;

          if (!isFirstLoad.current && count > (prevUnreadCounts.current[doc.id] || 0)) {
            if (Notification.permission === 'granted' && (document.hidden || selectedChat !== doc.id)) {
              new Notification(`New Signal Detected`, {
                body: data.lastMessage || 'Information received.',
                icon: '/ghost.png'
              });
            }
          }
        });
        
        setTotalUnread(total);
        prevUnreadCounts.current = newCounts;
        isFirstLoad.current = false;
      });

      syncProfile();

      return () => {
        unsubProfile?.();
        unsubConvList?.();
        isFirstLoad.current = true;
      };
    }, [user?.uid]);

  const lastSeenUpdateRef = useRef<number>(0);

  // Activity-based lastSeen update
  useEffect(() => {
    if (!user || !profile || profile.ghostMode) return;

    const updateLastSeen = async () => {
      const now = Date.now();
      if (now - lastSeenUpdateRef.current > 600000) { // Throttle to 10 minutes
        lastSeenUpdateRef.current = now;
        try {
          await updateDoc(doc(db, 'users', user.uid), { lastSeen: serverTimestamp() });
        } catch (e) {
          // Silent error for periodic update
        }
      }
    };

    window.addEventListener('mousemove', updateLastSeen);
    window.addEventListener('keydown', updateLastSeen);
    window.addEventListener('click', updateLastSeen);
    const interval = setInterval(updateLastSeen, 60000);

    return () => {
      window.removeEventListener('mousemove', updateLastSeen);
      window.removeEventListener('keydown', updateLastSeen);
      window.removeEventListener('click', updateLastSeen);
      clearInterval(interval);
    };
  }, [user?.uid, profile?.ghostMode]);

  const resetProtocol = async () => {
    if (!user || !window.confirm("CRITICAL: Resetting encryption protocol will make your previous encrypted messages unreadable. Proceed?")) return;
    
    setLoading(true);
    setInitError(null);
    try {
      const userRef = doc(db, 'users', user.uid);
      const privateKeyRef = doc(db, 'private_keys', user.uid);
      
      // Wipe old keys and clear profile public key to force re-generation
      await Promise.all([
        deleteDoc(privateKeyRef),
        updateDoc(userRef, { publicKey: null })
      ]);
      
      // Reload page to re-trigger syncProfile
      window.location.reload();
    } catch (e) {
      console.error("Reset failed:", e);
      setInitError("RESET_FAILED: COULD NOT PURGE KEYS");
      setLoading(false);
    }
  };

  if (initError) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-white p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center space-y-6 max-w-md border border-red-500/20 bg-red-500/5 p-8 rounded-3xl"
        >
          <div className="flex justify-center">
            <ShieldAlert className="w-16 h-16 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-red-500 uppercase">Signal Intervention</h2>
          <div className="space-y-2">
            <p className="text-zinc-400 text-sm">Your identity vault has been compromised or corrupted.</p>
            <code className="block p-2 bg-black rounded text-[10px] text-zinc-500 overflow-x-auto">
              {initError}
            </code>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors"
            >
              Retry Handshake
            </button>
            <button
              onClick={resetProtocol}
              className="w-full py-3 bg-red-500/10 text-red-400 font-semibold rounded-xl hover:bg-red-500/20 transition-colors border border-red-500/20"
            >
              Purge Keys & Reset Protocol
            </button>
            <button
              onClick={logout}
              className="text-zinc-600 text-xs hover:text-zinc-400 underline"
            >
              Sign Out
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  if (loading || (user && !profile)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-white">
        <motion.div
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="mb-4"
        >
          <Ghost className="w-12 h-12 text-zinc-500" />
        </motion.div>
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center"
        >
          <div className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-700 animate-pulse">Establishing Signal</div>
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#0a0a0a] text-white p-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center space-y-6 max-w-md"
        >
          <div className="flex justify-center">
            <div className="relative">
              <Ghost className="w-20 h-20 text-zinc-200" />
              <motion.div
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 3, repeat: Infinity }}
                className="absolute inset-0 bg-zinc-200 blur-2xl opacity-20"
              />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tighter">GHOST CHAT</h1>
          <p className="text-zinc-400">Untraceable. Invisible. Savage.</p>
          <button
            onClick={signIn}
            className="w-full py-4 bg-white text-black font-semibold rounded-2xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
          >
            Enter the Void
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden max-w-md mx-auto border-x border-zinc-900 shadow-2xl relative">
      {/* Header */}
      <header className="p-4 border-bottom border-zinc-900 flex justify-between items-center bg-[#0d0d0d]/80 backdrop-blur-md z-10">
        <div className="flex items-center gap-2">
          <Ghost className={cn("w-6 h-6", profile?.ghostMode ? "text-blue-400" : "text-zinc-500")} />
          <h1 className="text-lg font-bold tracking-tight">GhostChat</h1>
          {profile?.ghostMode && (
            <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">
              GHOST ON
            </span>
          )}
        </div>
        <button onClick={() => setSelectedChat(null)} className="md:hidden opacity-0">Back</button>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait">
          {selectedChat ? (
            <ChatView 
              key="chat-view"
              conversationId={selectedChat} 
              onBack={() => setSelectedChat(null)} 
              userProfile={profile}
              privateKey={privateKey}
            />
          ) : (
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="h-full"
            >
              {activeTab === 'chats' && <ChatListView onChatSelect={setSelectedChat} onUltronSelect={() => setActiveTab('ultron')} userProfile={profile} />}
              {activeTab === 'ultron' && <UltronView userProfile={profile} />}
              {activeTab === 'profile' && <ProfileView profile={profile} onLogout={logout} />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Navigation */}
      {!selectedChat && (
        <nav className="h-16 border-top border-zinc-900 bg-[#0d0d0d] flex items-center justify-around px-6">
          <NavButton 
            active={activeTab === 'chats'} 
            onClick={() => setActiveTab('chats')} 
            icon={<MessageSquare className="w-5 h-5" />} 
            label="Chats" 
            badge={totalUnread > 0 ? totalUnread : undefined}
          />
          <NavButton 
            active={activeTab === 'ultron'} 
            onClick={() => setActiveTab('ultron')} 
            icon={<Bot className="w-5 h-5" />} 
            label="Ultron" 
          />
          <NavButton 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')} 
            icon={<User className="w-5 h-5" />} 
            label="Me" 
          />
        </nav>
      )}
    </div>
  );
}

function NavButton({ active, onClick, icon, label, badge }: { active: boolean, onClick: () => void, icon: any, label: string, badge?: number }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-colors relative",
        active ? "text-white" : "text-zinc-600"
      )}
    >
      <div className="relative">
        {icon}
        {badge !== undefined && (
          <motion.div 
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1.5 -right-1.5 bg-blue-500 text-white text-[8px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-[#0d0d0d]"
          >
            {badge > 9 ? '9+' : badge}
          </motion.div>
        )}
      </div>
      <span className="text-[10px] font-medium">{label}</span>
      {active && (
        <motion.div
          layoutId="nav-pill"
          className="absolute -bottom-2 w-1 h-1 bg-white rounded-full"
        />
      )}
    </button>
  );
}

