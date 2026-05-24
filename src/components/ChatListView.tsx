import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, query, where, onSnapshot, orderBy, addDoc, serverTimestamp, getDocs, limit, or, doc, updateDoc } from 'firebase/firestore';
import { Search, Plus, MessageSquare, ShieldAlert, X, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../lib/utils';
import { getTheme } from '../lib/themes';

export default function ChatListView({ onChatSelect, onUltronSelect, userProfile }: { onChatSelect: (id: string) => void, onUltronSelect: () => void, userProfile: any }) {
  const currentTheme = getTheme(userProfile?.theme || localStorage.getItem('ghostchat_theme') || 'ghostwire');
  const [chats, setChats] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      setChats(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'conversations');
    });

    return () => unsubscribe();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    // Search by both username and displayName for better discovery
    const searchTerm = searchQuery.toLowerCase();
    
    try {
      const qUsername = query(
        collection(db, 'users'),
        where('username', '>=', searchTerm),
        where('username', '<=', searchTerm + '\uf8ff'),
        limit(5)
      );

      const qDisplayName = query(
        collection(db, 'users'),
        where('displayName', '>=', searchQuery),
        where('displayName', '<=', searchQuery + '\uf8ff'),
        limit(5)
      );

      const [snapUser, snapName] = await Promise.all([
        getDocs(qUsername),
        getDocs(qDisplayName)
      ]);

      const results = new Map();
      [...snapUser.docs, ...snapName.docs].forEach(doc => {
        const data = doc.data();
        if (data.uid !== auth.currentUser?.uid) {
          results.set(data.uid, data);
        }
      });

      setSearchResults(Array.from(results.values()));
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, 'users');
    }
  };

  const startChat = async (targetUser: any) => {
    const existing = chats.find(c => c.participants.includes(targetUser.uid));
    if (existing) {
      onChatSelect(existing.id);
      setIsSearching(false);
      return;
    }

    const newConv = await addDoc(collection(db, 'conversations'), {
      participants: [auth.currentUser!.uid, targetUser.uid],
      participantInfo: {
        [auth.currentUser!.uid]: { displayName: userProfile?.displayName || 'Anon Ghost', photoURL: userProfile?.photoURL || '', username: userProfile?.username || 'anon' },
        [targetUser.uid]: { displayName: targetUser.displayName, photoURL: targetUser.photoURL || '', username: targetUser.username }
      },
      lastMessage: 'New connection formed.',
      updatedAt: serverTimestamp(),
      isEphemeral: false
    });

    onChatSelect(newConv.id);
    setIsSearching(false);
  };

  return (
    <div className={cn("flex flex-col h-full transition-colors duration-300", currentTheme.bgMain, currentTheme.textMain)}>
      {/* Search Bar */}
      <div className="p-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search username or handle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearching(true)}
            className={cn("w-full rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none transition-colors",
              currentTheme.id === 'monochrome' ? 'bg-zinc-950 border border-zinc-700 focus:border-white text-white' : 'bg-zinc-900/50 border border-zinc-800 focus:border-zinc-700 text-white'
            )}
          />
        </div>
        {isSearching && (
          <button 
            onClick={() => { setIsSearching(false); setSearchResults([]); setSearchQuery(''); }}
            className="text-sm font-medium text-zinc-500"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-4 pb-20">
        <AnimatePresence mode="popLayout">
          {isSearching ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-4"
            >
              <button 
                onClick={handleSearch}
                className="w-full py-2 bg-zinc-900 rounded-lg text-xs text-zinc-400 font-medium uppercase tracking-widest hover:bg-zinc-800 transition-colors"
              >
                Scan Ghost Directory
              </button>
              
              {searchResults.length > 0 ? (
                searchResults.map((u) => (
                  <motion.div
                    key={u.uid}
                    layout
                    onClick={() => startChat(u)}
                    className="flex items-center gap-3 p-3 bg-zinc-900/30 border border-zinc-900 rounded-2xl cursor-pointer hover:bg-zinc-900/50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
                      {u.photoURL ? (
                        <img src={u.photoURL} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <User className="w-5 h-5 text-zinc-500" />
                      )}
                    </div>
                    <div>
                      <div className="font-bold text-sm tracking-tight">{u.displayName}</div>
                      <div className="text-zinc-600 text-[10px] font-mono tracking-tighter">@{u.username}</div>
                    </div>
                    <div className="ml-auto flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {userProfile?.isAdmin && (
                        <button 
                          onClick={async () => {
                            if (confirm(`TERMINATE SIGNAL FOR ${u.displayName}?`)) {
                              await updateDoc(doc(db, 'users', u.uid), { isBanned: true });
                              alert("SIGNAL INCINERATED.");
                            }
                          }}
                          className="p-2 hover:bg-red-500/10 rounded-lg group"
                        >
                          <ShieldAlert className="w-4 h-4 text-zinc-600 group-hover:text-red-500 transition-colors" />
                        </button>
                      )}
                      <Plus className="w-4 h-4 text-zinc-600" />
                    </div>
                  </motion.div>
                ))
              ) : searchQuery && (
                <div className="text-center py-10 text-zinc-600 text-sm italic">
                  No entities found in the void.
                </div>
              )}
            </motion.div>
          ) : (
            <div className="space-y-4">
              {/* Ultron Entry */}
              <motion.div
                layout
                onClick={onUltronSelect}
                className={cn("flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all active:scale-[0.98] group relative overflow-hidden", currentTheme.bgCard, currentTheme.id === 'monochrome' ? 'hover:border-white' : 'hover:bg-zinc-900/40')}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative">
                  <div className="w-12 h-12 rounded-2xl bg-white flex items-center justify-center overflow-hidden border border-zinc-700 shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                    <User className="w-6 h-6 text-black" />
                  </div>
                  <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0a0a0a] animate-pulse" />
                </div>
                
                <div className="flex-1 min-w-0 z-10">
                  <div className="flex justify-between items-start">
                    <h3 className="font-bold text-sm truncate tracking-tight text-white group-hover:text-red-400 transition-colors">Ultron AI</h3>
                    <span className="text-[9px] text-zinc-600 font-black uppercase tracking-widest bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">Savage Mode</span>
                  </div>
                  <p className="text-xs truncate mt-0.5 text-zinc-500 italic">
                    Establish connection with the core intelligence...
                  </p>
                </div>
              </motion.div>

              {/* Chat entries */}
              {chats.filter((chat: any) => {
                const otherId = chat.participants.find((p: string) => p !== auth.currentUser?.uid);
                return !userProfile?.blockedUsers?.includes(otherId);
              }).map((chat) => {
                const otherId = chat.participants.find((p: string) => p !== auth.currentUser?.uid);
                const other = chat.participantInfo?.[otherId] || { displayName: 'Ghost Participant', username: 'anon' };

                return (
                  <motion.div
                    key={chat.id}
                    layout
                    onClick={() => onChatSelect(chat.id)}
                    className={cn("flex items-center gap-4 p-4 rounded-2xl cursor-pointer transition-all active:scale-[0.98]", currentTheme.bgCard, currentTheme.id === 'monochrome' ? 'hover:border-zinc-500' : 'hover:bg-zinc-900/20')}
                  >
                    <div className="relative">
                      <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center overflow-hidden border border-zinc-800">
                        {other.photoURL ? (
                          <img src={other.photoURL} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <User className="w-6 h-6 text-zinc-600" />
                        )}
                      </div>
                      {chat.typing && Object.entries(chat.typing).some(([uid, isTyping]) => uid !== auth.currentUser?.uid && isTyping) && (
                        <div className="absolute -bottom-1 -right-1 flex gap-0.5 p-1 bg-blue-500 rounded-lg shadow-lg">
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity }} className="w-1 h-1 bg-white rounded-full" />
                          <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, delay: 0.2 }} className="w-1 h-1 bg-white rounded-full" />
                        </div>
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start">
                        <h3 className="font-bold text-sm truncate tracking-tight">{other.displayName}</h3>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[10px] text-zinc-600 uppercase font-black tracking-tighter">
                            {formatDate(chat.updatedAt)}
                          </span>
                          {chat.unreadCount?.[auth.currentUser?.uid || ''] > 0 && (
                            <motion.div 
                              initial={{ scale: 0 }}
                              animate={{ scale: 1 }}
                              className={cn("text-[10px] font-black px-1.5 py-0.5 rounded-full min-w-[18px] flex items-center justify-center shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-colors duration-300", currentTheme.badgeBg, currentTheme.badgeText)}
                            >
                              {chat.unreadCount?.[auth.currentUser?.uid || ''] > 9 ? '9+' : chat.unreadCount?.[auth.currentUser?.uid || '']}
                            </motion.div>
                          )}
                        </div>
                      </div>
                      <p className={cn(
                        "text-xs truncate mt-0.5 font-medium",
                        (chat.typing?.[otherId] || chat.unreadCount?.[auth.currentUser?.uid || ''] > 0) ? "text-blue-400 font-bold" : "text-zinc-500"
                      )}>
                        {chat.typing?.[otherId] ? "transmitting..." : chat.lastMessage}
                      </p>
                    </div>

                    {chat.isEphemeral && (
                      <ShieldAlert className="w-4 h-4 text-orange-500/50" />
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </AnimatePresence>

        {!isSearching && chats.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
            <MessageSquare className="w-12 h-12 text-zinc-800" />
            <div className="text-zinc-600 max-w-[200px]">
              The void is silent. Search for an entity to begin.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
