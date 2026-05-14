import { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, query, orderBy, onSnapshot, addDoc, 
  serverTimestamp, doc, updateDoc, deleteDoc, getDocs, writeBatch 
} from 'firebase/firestore';
import { Send, ArrowLeft, MoreVertical, Shield, ShieldAlert, Trash2, Ghost, Check, Smile, X, Plus, Paperclip, FileText, Image as ImageIcon, Download, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../lib/utils';
import { encryptSignal, decryptSignal } from '../lib/crypto';

export default function ChatView({ conversationId, onBack, userProfile, privateKey }: { conversationId: string, onBack: () => void, userProfile: any, privateKey: string | null }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState<any>(null);
  const [recipientPublicKey, setRecipientPublicKey] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const notificationSound = useRef(new Audio('https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3'));
  const [showOptions, setShowOptions] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Scroll to bottom
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Typing status management
  useEffect(() => {
    if (!input.trim() || !conversationId) {
      updateTypingStatus(false);
      return;
    }

    updateTypingStatus(true);

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      updateTypingStatus(false);
    }, 3000);

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [input, conversationId]);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!auth.currentUser || !conversationId) return;
    try {
      await updateDoc(doc(db, 'conversations', conversationId), {
        [`typing.${auth.currentUser.uid}`]: isTyping
      });
    } catch (e) {
      // Silent error for typing updates
    }
  };

  const markedSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!userProfile) return;

    const convRef = doc(db, 'conversations', conversationId);
    const unsubConv = onSnapshot(convRef, (snap) => {
      const data = snap.data();
      setConversation(data);
      
      // Reset unread count if we are the one with unread messages
      if (data?.unreadCount?.[auth.currentUser?.uid || ''] > 0) {
        updateDoc(convRef, {
          [`unreadCount.${auth.currentUser?.uid}`]: 0
        }).catch(e => console.error("Unread reset error:", e));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'conversations/' + conversationId);
    });

    const q = query(
      collection(db, 'conversations', conversationId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubMessages = onSnapshot(q, (snap) => {
      const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // Notification logic
      if (msgs.length > messages.length && messages.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.senderId !== auth.currentUser?.uid && !userProfile?.blockedUsers?.includes(lastMsg.senderId)) {
          // Play sound if enabled
          if (userProfile?.soundEnabled !== false) {
            notificationSound.current.play().catch(e => console.error("Sound play failed:", e));
          }
        }
      }

      setMessages(msgs);

      // Handle "Seen" receipts in a single batch to save quota
      if (!userProfile?.ghostMode) {
        const unreadMsgs = msgs.filter((m: any) => m.senderId !== auth.currentUser?.uid && !m.seen && !markedSeenRef.current.has(m.id));
        if (unreadMsgs.length > 0) {
          const batch = writeBatch(db);
          unreadMsgs.forEach((m: any) => {
            markedSeenRef.current.add(m.id);
            batch.update(doc(db, 'conversations', conversationId, 'messages', m.id), { seen: true });
          });
          batch.commit().catch(e => {
            console.error("Batch seen sync failed:", e);
            unreadMsgs.forEach(m => markedSeenRef.current.delete(m.id));
          });
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `conversations/${conversationId}/messages`);
    });

    // Fetch Recipient Public Key
    const fetchRecipientKey = async () => {
      const otherId = conversation?.participants?.find((p: string) => p !== auth.currentUser?.uid);
      if (otherId && conversation?.participantInfo?.[otherId]?.publicKey) {
        setRecipientPublicKey(conversation.participantInfo[otherId].publicKey);
      }
    };
    fetchRecipientKey();

    return () => {
      unsubConv();
      unsubMessages();
    };
  }, [conversationId, userProfile?.ghostMode, !!userProfile]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !auth.currentUser || !userProfile) return;

    // Blocking Check
    const otherId = conversation?.participants?.find((p: string) => p !== auth.currentUser?.uid);
    if (userProfile?.blockedUsers?.includes(otherId)) {
      alert("You have blocked this entity. Unblock to send signals.");
      return;
    }

    const content = input.trim();
    setInput('');
    updateTypingStatus(false);

    let messagePayload: any = {
      conversationId,
      senderId: auth.currentUser.uid,
      content,
      createdAt: serverTimestamp(),
      seen: false
    };

    // Apply encryption if recipient has a key
    if (recipientPublicKey) {
      try {
        const encrypted = await encryptSignal(content, recipientPublicKey);
        messagePayload = {
          ...messagePayload,
          content: "[ENCRYPTED SIGNAL]", // Fallback
          encryptedPayload: encrypted.payload,
          sealedKey: encrypted.sealedKey,
          iv: encrypted.iv,
          isEncrypted: true
        };
      } catch (e) {
        console.error("Signal sealing failed, falling back to plaintext:", e);
      }
    }

    await addDoc(collection(db, 'conversations', conversationId, 'messages'), messagePayload);

    const updates: any = {
      lastMessage: recipientPublicKey ? "🔒 Encrypted Signal" : content,
      updatedAt: serverTimestamp(),
    };

    if (otherId) {
      updates[`unreadCount.${otherId}`] = (conversation?.unreadCount?.[otherId] || 0) + 1;
    }

    await updateDoc(doc(db, 'conversations', conversationId), updates);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser || !userProfile) return;

    // Size limit check (approx 800KB for Firestore documents)
    if (file.size > 800 * 1024) {
      alert("SIGNAL TOO LARGE. TRANSMISSION LIMIT: 800KB. COMPRESS DATA AND RETRY.");
      return;
    }

    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      const fileType = file.type;
      const fileName = file.name;

      try {
        const isImage = fileType.startsWith('image/');
        const content = isImage ? 'Shared an image' : `Shared ${fileName}`;

        await addDoc(collection(db, 'conversations', conversationId, 'messages'), {
          conversationId,
          senderId: auth.currentUser!.uid,
          content,
          fileData: base64,
          fileName,
          fileType,
          createdAt: serverTimestamp(),
          seen: false
        });

        const updates: any = {
          lastMessage: content,
          updatedAt: serverTimestamp(),
        };

        const otherId = conversation?.participants?.find((p: string) => p !== auth.currentUser?.uid);
        if (otherId) {
          updates[`unreadCount.${otherId}`] = (conversation?.unreadCount?.[otherId] || 0) + 1;
        }

        await updateDoc(doc(db, 'conversations', conversationId), updates);
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'messages/file');
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const deleteMessage = async (msgId: string) => {
    if (!confirm("Are you sure you want to permanently incinerate this data signal?")) return;
    try {
      await deleteDoc(doc(db, 'conversations', conversationId, 'messages', msgId));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `messages/${msgId}`);
    }
  };

  const addReaction = async (msgId: string, emoji: string) => {
    const msg = messages.find(m => m.id === msgId);
    const reactions = msg.reactions || {};
    const users = reactions[emoji] || [];
    
    let newUsers;
    if (users.includes(auth.currentUser?.uid)) {
      newUsers = users.filter((uid: string) => uid !== auth.currentUser?.uid);
    } else {
      newUsers = [...users, auth.currentUser?.uid];
    }

    try {
      const msgRef = doc(db, 'conversations', conversationId, 'messages', msgId);
      if (newUsers.length === 0) {
        const updatedReactions = { ...reactions };
        delete updatedReactions[emoji];
        await updateDoc(msgRef, { reactions: updatedReactions });
      } else {
        await updateDoc(msgRef, { [`reactions.${emoji}`]: newUsers });
      }
      setShowEmojiPicker(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `messages/${msgId}`);
    }
  };

  const toggleEphemeral = async () => {
    await updateDoc(doc(db, 'conversations', conversationId), {
      isEphemeral: !conversation.isEphemeral
    });
    setShowOptions(false);
  };

  const clearConversation = async () => {
    if (!confirm("Are you sure you want to incinerate this conversation?")) return;
    
    setShowOptions(false);
    const snap = await getDocs(collection(db, 'conversations', conversationId, 'messages'));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    await updateDoc(doc(db, 'conversations', conversationId), {
      lastMessage: 'Conversation incinerated.',
      updatedAt: serverTimestamp()
    });
  };

  // Filter messages from blocked users
  const filteredMessages = messages.filter(m => !userProfile?.blockedUsers?.includes(m.senderId));

  const otherId = conversation?.participants?.find((p: string) => p !== auth.currentUser?.uid);
  const other = conversation?.participantInfo?.[otherId] || { displayName: 'Secure Thread', photoURL: '' };

  if (!userProfile) return null;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] relative">
      {/* Chat Header */}
      <div className="p-4 bg-[#0d0d0d] border-b border-zinc-900 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-zinc-800 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-zinc-800 flex items-center justify-center border border-zinc-700 overflow-hidden">
            {other.photoURL ? (
              <img src={other.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <Ghost className="w-5 h-5 text-zinc-500" />
            )}
          </div>
          <div>
            <div className="text-sm font-bold truncate tracking-tight">{other.displayName}</div>
            <div className="flex items-center gap-1">
              {conversation?.typing?.[otherId] ? (
                <div className="flex items-center gap-1">
                  <motion.div 
                    animate={{ opacity: [0.4, 1, 0.4] }} 
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-1.5 h-1.5 rounded-full bg-blue-400" 
                  />
                  <span className="text-[10px] text-blue-400 font-bold lowercase">transmitting...</span>
                </div>
              ) : (
                <>
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                  <span className="text-[10px] text-zinc-600 font-black uppercase tracking-widest">End-to-End Void</span>
                </>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {userProfile?.isAdmin && (
            <button
              onClick={async () => {
                if (confirm(`INITIATE BAN PROTOCOL ON ${other.displayName}? THIS WILL INCINERATE THEIR ACCESS.`)) {
                  try {
                    await updateDoc(doc(db, 'users', otherId), { isBanned: true });
                    alert("SIGNAL TERMINATED.");
                  } catch (e) {
                    alert("AUTHORIZATION FAILED OR TARGET IS PROTECTED.");
                  }
                }
              }}
              className="p-1 hover:bg-red-500/10 rounded-lg transition-colors group"
            >
              <ShieldAlert className="w-5 h-5 text-zinc-600 group-hover:text-red-500" />
            </button>
          )}
          <button onClick={() => setShowOptions(!showOptions)} className="p-1 hover:bg-zinc-800 rounded-lg transition-colors">
            <MoreVertical className="w-5 h-5 text-zinc-500" />
          </button>
        </div>

        {/* Options Modal */}
        <AnimatePresence>
          {showOptions && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowOptions(false)} />
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                className="absolute right-4 top-16 w-52 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-40 p-2 overflow-hidden"
              >
                <button 
                  onClick={toggleEphemeral}
                  className="w-full text-left p-3 hover:bg-zinc-800 rounded-xl flex items-center gap-3 transition-colors"
                >
                  <Shield className={cn("w-4 h-4", conversation?.isEphemeral ? "text-orange-500" : "text-zinc-500")} />
                  <div className="text-xs font-bold font-mono uppercase tracking-tighter">
                    {conversation?.isEphemeral ? "Deactivate Ephemera" : "Activate Ephemera"}
                  </div>
                </button>
                <button 
                  onClick={clearConversation}
                  className="w-full text-left p-3 hover:bg-zinc-800 rounded-xl flex items-center gap-3 transition-colors text-red-500"
                >
                  <Trash2 className="w-4 h-4" />
                  <div className="text-xs font-black uppercase tracking-widest">Incinerate</div>
                </button>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {filteredMessages.map((msg, i) => {
          const isMe = msg.senderId === auth.currentUser?.uid;
          const showTimeHeader = i === 0 || (msg.createdAt?.seconds && filteredMessages[i-1].createdAt?.seconds && (msg.createdAt.seconds - filteredMessages[i-1].createdAt.seconds > 600));

          return (
            <MessageItem 
              key={msg.id}
              msg={msg}
              isMe={isMe}
              showTimeHeader={showTimeHeader}
              other={other}
              conversation={conversation}
              userProfile={userProfile}
              privateKey={privateKey}
              addReaction={addReaction}
              deleteMessage={deleteMessage}
              showEmojiPicker={showEmojiPicker}
              setShowEmojiPicker={setShowEmojiPicker}
            />
          );
        })}
        <div ref={scrollRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 bg-[#0d0d0d] border-t border-zinc-900 relative">
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          className="hidden" 
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
        <form onSubmit={sendMessage} className="flex gap-2 items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="w-12 h-14 bg-zinc-900 border border-zinc-800 text-zinc-500 rounded-2xl flex items-center justify-center hover:text-white hover:border-zinc-700 transition-all active:scale-95 flex-shrink-0"
          >
            {isUploading ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Shield className="w-5 h-5" />
              </motion.div>
            ) : (
              <Paperclip className="w-5 h-5" />
            )}
          </button>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Whisper into the void..."
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-2xl py-3.5 px-6 text-sm focus:outline-none focus:border-zinc-600 transition-all placeholder:text-zinc-700 font-medium"
          />
          <button
            type="submit"
            disabled={!input.trim() || isUploading}
            className="w-14 h-14 bg-white text-black rounded-2xl flex items-center justify-center disabled:opacity-20 disabled:bg-zinc-900 disabled:text-zinc-800 transition-all active:scale-90 shadow-2xl shadow-white/10"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>

      {/* Ghost Mode Overlay Indicator if active */}
      {userProfile?.ghostMode && (
        <div className="absolute top-16 left-0 right-0 py-1 bg-blue-500/5 border-y border-blue-500/10 text-[9px] text-center text-blue-400 font-black tracking-[0.4em] uppercase z-10 backdrop-blur-sm">
          Ghost Sequence Engaged
        </div>
      )}
    </div>
  );
}

function MessageItem({ msg, isMe, showTimeHeader, other, conversation, userProfile, privateKey, addReaction, deleteMessage, showEmojiPicker, setShowEmojiPicker }: any) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(msg.isEncrypted ? null : msg.content);
  const [isDecrypting, setIsDecrypting] = useState(msg.isEncrypted);

  useEffect(() => {
    if (msg.isEncrypted && privateKey) {
      const doDecrypt = async () => {
        try {
          const result = await decryptSignal(msg.encryptedPayload, msg.sealedKey, msg.iv, privateKey);
          setDecryptedContent(result);
        } catch (e) {
          setDecryptedContent("[DECRYPTION_FAILED]");
        } finally {
          setIsDecrypting(false);
        }
      };
      doDecrypt();
    } else {
      setDecryptedContent(msg.content);
      setIsDecrypting(false);
    }
  }, [msg.id, privateKey, msg.encryptedPayload]);

  return (
    <div className="space-y-2">
      {showTimeHeader && (
        <div className="text-center py-6 flex items-center gap-4 opacity-30">
            <div className="h-px flex-1 bg-zinc-800" />
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-zinc-500">
            {formatDate(msg.createdAt)}
            </span>
            <div className="h-px flex-1 bg-zinc-800" />
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, x: isMe ? 20 : -20, scale: 0.9 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        className={cn(
          "flex items-end gap-2",
          isMe ? "flex-row-reverse" : "flex-row"
        )}
      >
        {!isMe && (
            <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center overflow-hidden flex-shrink-0">
              {other.photoURL ? (
                <img src={other.photoURL} alt="" className="w-full h-full object-cover" />
              ) : (
                <Ghost className="w-3 h-3 text-zinc-700" />
              )}
            </div>
        )}
        <div className={cn(
          "max-w-[75%] px-4 py-2.5 rounded-2xl text-sm font-medium leading-relaxed shadow-lg relative group",
          isMe 
            ? "bg-white text-black rounded-br-none" 
            : "bg-zinc-900 text-zinc-200 rounded-bl-none border border-zinc-800"
        )}>
          {conversation?.participantInfo?.[msg.senderId]?.isAdmin && (
            <div className="flex items-center gap-1 mb-1 opacity-60">
              <Shield className={cn("w-2.5 h-2.5", isMe ? "text-zinc-400" : "text-yellow-600")} />
              <span className={cn("text-[7px] font-black uppercase tracking-widest", isMe ? "text-zinc-400" : "text-yellow-600")}>
                Architect
              </span>
            </div>
          )}
          {msg.isEncrypted && (
            <div className="flex items-center gap-1 mb-1 opacity-30">
              <Lock className="w-2.5 h-2.5" />
              <span className="text-[7px] font-bold uppercase tracking-widest">Encrypted</span>
            </div>
          )}
          {msg.fileData && (
            <div className="mb-3">
              {msg.fileType?.startsWith('image/') ? (
                <div className="rounded-xl overflow-hidden border border-white/10 group/img relative">
                  <img 
                    src={msg.fileData} 
                    alt={msg.fileName} 
                    className="w-full max-h-[300px] object-cover" 
                  />
                  <a 
                    href={msg.fileData} 
                    download={msg.fileName}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <Download className="w-8 h-8 text-white" />
                  </a>
                </div>
              ) : (
                <div className={cn(
                  "flex items-center gap-3 p-3 rounded-xl border",
                  isMe ? "bg-black/5 border-black/10" : "bg-zinc-800 border-zinc-700"
                )}>
                  <div className={cn(
                    "w-10 h-10 rounded-lg flex items-center justify-center",
                    isMe ? "bg-black/10" : "bg-zinc-900"
                  )}>
                    <FileText className="w-5 h-5 opacity-60" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold truncate opacity-80 uppercase tracking-tight">{msg.fileName}</div>
                    <div className="text-[9px] opacity-40 font-mono">{(msg.fileData.length * 0.75 / 1024).toFixed(1)} KB</div>
                  </div>
                  <a 
                    href={msg.fileData} 
                    download={msg.fileName}
                    className="p-2 hover:bg-black/10 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          )}
          
          {isDecrypting ? (
            <div className="flex items-center gap-2 py-1">
              <motion.div 
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-1 h-1 bg-current rounded-full"
              />
              <span className="text-[10px] font-mono opacity-40 italic">deciphering...</span>
            </div>
          ) : (
            decryptedContent
          )}
          
          {/* Reactions Display */}
          {msg.reactions && Object.keys(msg.reactions).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(msg.reactions).map(([emoji, users]: [string, any]) => (
                <button
                  key={emoji}
                  onClick={() => addReaction(msg.id, emoji)}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] border shadow-sm transition-all",
                    users.includes(auth.currentUser?.uid)
                      ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                      : "bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:border-zinc-500"
                  )}
                >
                  <span>{emoji}</span>
                  <span className="font-bold opacity-70">{users.length}</span>
                </button>
              ))}
            </div>
          )}

          <div className={cn(
            "text-[8px] mt-1 flex items-center gap-2 font-mono opacity-40 group-hover:opacity-100 transition-opacity",
            isMe ? "text-zinc-600 justify-end" : "text-zinc-500"
          )}>
            {formatDate(msg.createdAt)}
            {isMe && msg.seen && !userProfile?.ghostMode && (
              <Check className="w-2 h-2 text-blue-500" />
            )}
          </div>

          {/* Message Actions */}
          <div className={cn(
            "absolute -bottom-8 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10",
            isMe ? "right-0" : "left-0"
          )}>
            <button 
              onClick={() => setShowEmojiPicker(showEmojiPicker === msg.id ? null : msg.id)}
              className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-white"
            >
              <Smile className="w-3 h-3" />
            </button>
            {isMe && (
              <button 
                onClick={() => deleteMessage(msg.id)}
                className="p-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-500 hover:text-red-500"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Emoji Picker Popover */}
          <AnimatePresence>
            {showEmojiPicker === msg.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowEmojiPicker(null)} />
                <EmojiPicker msgId={msg.id} isMe={isMe} onSelect={addReaction} />
              </>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}

function EmojiPicker({ msgId, isMe, onSelect }: { msgId: string, isMe: boolean, onSelect: (id: string, emoji: string) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const commonEmojis = ['❤️', '😂', '😮', '😢', '🙏', '🔥'];
  const extraEmojis = ['💀', '💯', '🦾', '🤫', '👻', '😡', '👍', '🎉', '👀', '✨', '💎', '🚀', '✅', '❌', '🎈', '🍕', '🍻', '🌈'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 10 }}
      className={cn(
        "absolute bottom-10 bg-zinc-900 border border-zinc-800 p-1.5 rounded-2xl shadow-2xl z-50 transition-all duration-300",
        isMe ? "right-0" : "left-0",
        isExpanded ? "w-64" : "w-auto"
      )}
    >
      <div className={cn("flex flex-wrap gap-1", isExpanded ? "justify-start" : "items-center")}>
        {commonEmojis.map(emoji => (
          <button
            key={emoji}
            onClick={() => onSelect(msgId, emoji)}
            className="w-9 h-9 flex items-center justify-center hover:bg-zinc-800 rounded-xl transition-colors text-xl active:scale-110"
          >
            {emoji}
          </button>
        ))}
        
        {!isExpanded ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(true);
            }}
            className="w-9 h-9 flex items-center justify-center hover:bg-zinc-800 rounded-xl transition-colors text-zinc-500"
          >
            <Plus className="w-4 h-4" />
          </button>
        ) : (
          extraEmojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => onSelect(msgId, emoji)}
              className="w-9 h-9 flex items-center justify-center hover:bg-zinc-800 rounded-xl transition-colors text-xl active:scale-110"
            >
              {emoji}
            </button>
          ))
        )}
      </div>
    </motion.div>
  );
}
