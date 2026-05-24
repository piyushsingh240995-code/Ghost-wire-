import { useState, useEffect, useRef } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { 
  collection, query, orderBy, onSnapshot, addDoc, 
  serverTimestamp, doc, updateDoc, deleteDoc, getDocs, writeBatch 
} from 'firebase/firestore';
import { Send, ArrowLeft, MoreVertical, Shield, ShieldAlert, Trash2, Ghost, Check, Smile, X, Plus, Paperclip, FileText, Image as ImageIcon, Download, Lock, Mic, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, formatDate } from '../lib/utils';
import { getTheme } from '../lib/themes';
import { encryptSignal, decryptSignal } from '../lib/crypto';
import AudioVisualizer from './AudioVisualizer';
import { ConfirmationModal, AlertModal } from './ui/Dialogs';

export default function ChatView({ conversationId, onBack, userProfile, privateKey }: { conversationId: string, onBack: () => void, userProfile: any, privateKey: string | null }) {
  const currentTheme = getTheme(userProfile?.theme || localStorage.getItem('ghostchat_theme') || 'ghostwire');
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

  // Custom modal dialog states
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmBan, setConfirmBan] = useState<string | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertTitle, setAlertTitle] = useState('');
  const [alertMessage, setAlertMessage] = useState('');

  const triggerAlert = (title: string, message: string) => {
    setAlertTitle(title);
    setAlertMessage(message);
    setAlertOpen(true);
  };

  // Voice recording state
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const isTypingRef = useRef(false);

  const updateTypingStatus = async (isTyping: boolean) => {
    if (!auth.currentUser || !conversationId || isTyping === isTypingRef.current) return;
    isTypingRef.current = isTyping;
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
        }).catch(e => {
            if (e.message.includes("resource-exhausted")) {
                console.warn("QUOTA ERROR: Could not reset unread count.");
            }
        });
      }
    }, (error) => {
      if (error.message.includes("resource-exhausted")) {
        console.error("Quota exceeded during conversation listen.");
      } else {
        handleFirestoreError(error, OperationType.GET, 'conversations/' + conversationId);
      }
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
            if (e.message.includes("resource-exhausted")) {
                console.warn("QUOTA ERROR: Could not sync seen status.");
            } else {
                console.error("Batch seen sync failed:", e);
            }
            unreadMsgs.forEach(m => markedSeenRef.current.delete(m.id));
          });
        }
      }
    }, (error) => {
      if (error.message.includes("resource-exhausted")) {
        console.error("Quota exceeded during messages listen.");
      } else {
        handleFirestoreError(error, OperationType.LIST, `conversations/${conversationId}/messages`);
      }
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
      triggerAlert("SIGNAL_BLOCKED", "You have blocked this entity. Unblock to send signals.");
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
      triggerAlert("SIGNAL TOO LARGE", "TRANSMISSION LIMIT: 800KB. COMPRESS DATA AND RETRY.");
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

        let messagePayload: any = {
          conversationId,
          senderId: auth.currentUser!.uid,
          content,
          createdAt: serverTimestamp(),
          seen: false
        };

        if (recipientPublicKey) {
          const encryptedData = {
            content,
            fileData: base64,
            fileName,
            fileType
          };
          const encrypted = await encryptSignal(JSON.stringify(encryptedData), recipientPublicKey);
          messagePayload = {
            ...messagePayload,
            content: isImage ? "🔒 Encrypted Image" : `🔒 Encrypted File: ${fileName}`,
            encryptedPayload: encrypted.payload,
            sealedKey: encrypted.sealedKey,
            iv: encrypted.iv,
            isEncrypted: true
          };
        } else {
          messagePayload = {
            ...messagePayload,
            fileData: base64,
            fileName,
            fileType
          };
        }

        await addDoc(collection(db, 'conversations', conversationId, 'messages'), messagePayload);

        const updates: any = {
          lastMessage: recipientPublicKey ? "🔒 Encrypted File" : content,
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

  // Voice recording & sending functions
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setRecordingStream(stream);
      let mimeType = 'audio/webm';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/ogg';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/mp4';
      if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = '';

      const recorder = mimeType 
        ? new MediaRecorder(stream, { mimeType }) 
        : new MediaRecorder(stream);
        
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop());
        if (audioChunksRef.current.length === 0) return;
        
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          await sendVoiceNote(base64Audio, audioBlob.type);
        };
        reader.readAsDataURL(audioBlob);
      };

      recorder.start();
      setIsRecording(true);
      setRecordingDuration(0);
      
      recordingIntervalRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied:", err);
      triggerAlert("SIGNAL_BLOCKED", "Microphone access denied or unsupported on this device.");
    }
  };

  const stopAndSendRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      cleanupRecordingState();
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = () => {
        const stream = mediaRecorderRef.current?.stream;
        stream?.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    cleanupRecordingState();
  };

  const cleanupRecordingState = () => {
    setIsRecording(false);
    setRecordingStream(null);
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    setRecordingDuration(0);
  };

  const sendVoiceNote = async (base64Audio: string, mimeType: string) => {
    if (!auth.currentUser || !userProfile) return;

    if (base64Audio.length * 0.75 > 800 * 1024) {
      triggerAlert("SIGNAL TOO LARGE", "TRANSMISSION LIMIT: 800KB.");
      return;
    }

    setIsUploading(true);
    const fileName = `voice_note_${Date.now()}.webm`;
    const content = "🎤 Shared a voice note";
    
    try {
      let messagePayload: any = {
        conversationId,
        senderId: auth.currentUser.uid,
        content,
        createdAt: serverTimestamp(),
        seen: false
      };

      if (recipientPublicKey) {
        const encryptedData = {
          content,
          fileData: base64Audio,
          fileName,
          fileType: mimeType
        };

        const encrypted = await encryptSignal(JSON.stringify(encryptedData), recipientPublicKey);
        messagePayload = {
          ...messagePayload,
          content: "🔒 Encrypted Voice Note",
          encryptedPayload: encrypted.payload,
          sealedKey: encrypted.sealedKey,
          iv: encrypted.iv,
          isEncrypted: true
        };
      } else {
        messagePayload = {
          ...messagePayload,
          fileData: base64Audio,
          fileName,
          fileType: mimeType
        };
      }

      await addDoc(collection(db, 'conversations', conversationId, 'messages'), messagePayload);

      const updates: any = {
        lastMessage: recipientPublicKey ? "🔒 Encrypted Voice Note" : content,
        updatedAt: serverTimestamp(),
      };

      const otherId = conversation?.participants?.find((p: string) => p !== auth.currentUser?.uid);
      if (otherId) {
        updates[`unreadCount.${otherId}`] = (conversation?.unreadCount?.[otherId] || 0) + 1;
      }

      await updateDoc(doc(db, 'conversations', conversationId), updates);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'messages/voice_note');
    } finally {
      setIsUploading(false);
    }
  };

  const deleteMessage = (msgId: string) => {
    setConfirmDeleteId(msgId);
  };

  const confirmDeleteMessage = async () => {
    if (!confirmDeleteId) return;
    const msgId = confirmDeleteId;
    setConfirmDeleteId(null);
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
    setConfirmClear(true);
  };

  const confirmClearConversation = async () => {
    setConfirmClear(false);
    setShowOptions(false);
    try {
      const snap = await getDocs(collection(db, 'conversations', conversationId, 'messages'));
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();

      await updateDoc(doc(db, 'conversations', conversationId), {
        lastMessage: 'Conversation incinerated.',
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'conversations/clear');
    }
  };

  const confirmBanUser = async () => {
    if (!confirmBan) return;
    const targetId = confirmBan;
    setConfirmBan(null);
    try {
      await updateDoc(doc(db, 'users', targetId), { isBanned: true });
      triggerAlert("SIGNAL TERMINATED", "The target entity has been indefinitely banished and incinerated.");
    } catch (e) {
      triggerAlert("AUTHORIZATION FAILED", "Security clearance insufficient or target is protected.");
    }
  };

  // Filter messages from blocked users
  const filteredMessages = messages.filter(m => !userProfile?.blockedUsers?.includes(m.senderId));

  const otherId = conversation?.participants?.find((p: string) => p !== auth.currentUser?.uid);
  const other = conversation?.participantInfo?.[otherId] || { displayName: 'Secure Thread', photoURL: '' };

  if (!userProfile) return null;

  return (
    <div className={cn("flex flex-col h-full relative transition-all duration-300", currentTheme.bgMain, currentTheme.textMain)}>
      {/* Chat Header */}
      <div className={cn("p-4 border-b flex items-center justify-between z-20 transition-all duration-300", currentTheme.bgHeader, currentTheme.border)}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1 hover:bg-zinc-805 rounded-lg transition-colors cursor-pointer">
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
              onClick={() => {
                setConfirmBan(otherId);
              }}
              className="p-1 hover:bg-red-500/10 rounded-lg transition-colors group cursor-pointer"
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
      <div className={cn("p-4 border-t relative transition-all duration-300", currentTheme.bgHeader, currentTheme.border)}>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileSelect} 
          className="hidden" 
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
        
        {isRecording ? (
          <div className="flex items-center justify-between gap-3 bg-zinc-950 p-2 rounded-2xl border border-zinc-900 animate-pulse duration-1000">
            <div className="flex items-center gap-3 pl-3">
              <span className="flex h-3.5 w-3.5 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-red-600"></span>
              </span>
              <span className="text-xs font-mono font-black text-red-500 uppercase tracking-widest">
                RECORDING {formatDuration(recordingDuration)}
              </span>
            </div>
            
            <AudioVisualizer stream={recordingStream} />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelRecording}
                className="p-3 bg-zinc-900 hover:bg-zinc-850 text-zinc-400 hover:text-red-400 rounded-xl transition-all cursor-pointer"
                title="Discard Recording"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={stopAndSendRecording}
                className="p-3 bg-white hover:bg-zinc-200 text-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                title="Broadcast voice note"
              >
                <Check className="w-4 h-4 stroke-[3px]" />
                <span className="text-[10px] uppercase font-black tracking-wider leading-none">Send</span>
              </button>
            </div>
          </div>
        ) : (
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
            {!input.trim() ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={isUploading}
                className="w-14 h-14 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-white rounded-2xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 flex-shrink-0 cursor-pointer"
                title="Record voice note"
              >
                <Mic className="w-5 h-5" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={isUploading}
                className="w-14 h-14 bg-white text-black rounded-2xl flex items-center justify-center disabled:opacity-20 disabled:bg-zinc-900 disabled:text-zinc-800 transition-all active:scale-90 shadow-2xl shadow-white/10 flex-shrink-0"
              >
                <Send className="w-5 h-5" />
              </button>
            )}
          </form>
        )}
      </div>

      {/* Ghost Mode Overlay Indicator if active */}
      {userProfile?.ghostMode && (
        <div className="absolute top-16 left-0 right-0 py-1 bg-blue-500/5 border-y border-blue-500/10 text-[9px] text-center text-blue-400 font-black tracking-[0.4em] uppercase z-10 backdrop-blur-sm">
          Ghost Sequence Engaged
        </div>
      )}

      {/* Confirmation Modals */}
      <ConfirmationModal
        isOpen={confirmDeleteId !== null}
        title="INCINERATE DATA SIGNAL?"
        message="Are you sure you want to permanently incinerate this data signal? Once executed, this segment of information is lost forever in the deep void."
        confirmLabel="INCINERATE"
        cancelLabel="ABORT"
        onConfirm={confirmDeleteMessage}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <ConfirmationModal
        isOpen={confirmClear}
        title="INCINERATE CONVERSATION?"
        message="This will completely clear your entire conversation with this participant. All encrypted payloads and file paths will be entirely scrubbed and dissolved into the nether. Proceed?"
        confirmLabel="INCINERATE ALL"
        cancelLabel="ABORT"
        onConfirm={confirmClearConversation}
        onCancel={() => setConfirmClear(false)}
      />

      <ConfirmationModal
        isOpen={confirmBan !== null}
        title="INITIATE BAN SEQUENCE?"
        message={`Are you sure you want to initialize the administrative exclusion protocol on this signal? This will indefinitely revoke their encryption license.`}
        confirmLabel="BANISH"
        cancelLabel="ABORT"
        onConfirm={confirmBanUser}
        onCancel={() => setConfirmBan(null)}
      />

      {/* Custom Alerts */}
      <AlertModal
        isOpen={alertOpen}
        title={alertTitle}
        message={alertMessage}
        onClose={() => setAlertOpen(false)}
      />
    </div>
  );
}

function MessageItem({ msg, isMe, showTimeHeader, other, conversation, userProfile, privateKey, addReaction, deleteMessage, showEmojiPicker, setShowEmojiPicker }: any) {
  const [decryptedContent, setDecryptedContent] = useState<string | null>(msg.isEncrypted ? null : msg.content);
  const [decryptedFile, setDecryptedFile] = useState<any | null>(msg.isEncrypted ? null : (msg.fileData ? { fileData: msg.fileData, fileName: msg.fileName, fileType: msg.fileType } : null));
  const [isDecrypting, setIsDecrypting] = useState(msg.isEncrypted);

  useEffect(() => {
    if (msg.isEncrypted && privateKey) {
      const doDecrypt = async () => {
        try {
          const result = await decryptSignal(msg.encryptedPayload, msg.sealedKey, msg.iv, privateKey);
          
          if (result.startsWith('{') && result.endsWith('}')) {
            try {
              const parsed = JSON.parse(result);
              if (parsed.fileData) {
                setDecryptedFile({
                  fileData: parsed.fileData,
                  fileName: parsed.fileName,
                  fileType: parsed.fileType
                });
                setDecryptedContent(parsed.content);
                return;
              }
            } catch (jsonErr) {
              // Plaintext decryption path
            }
          }
          
          setDecryptedContent(result);
          setDecryptedFile(null);
        } catch (e) {
          setDecryptedContent("[DECRYPTION_FAILED]");
        } finally {
          setIsDecrypting(false);
        }
      };
      doDecrypt();
    } else {
      setDecryptedContent(msg.content);
      setDecryptedFile(msg.fileData ? { fileData: msg.fileData, fileName: msg.fileName, fileType: msg.fileType } : null);
      setIsDecrypting(false);
    }
  }, [msg.id, privateKey, msg.encryptedPayload, msg.fileData, msg.fileName, msg.fileType]);

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
          {decryptedFile && (
            <div className="mb-3">
              {decryptedFile.fileType?.startsWith('image/') ? (
                <div className="rounded-xl overflow-hidden border border-white/10 group/img relative">
                  <img 
                    src={decryptedFile.fileData} 
                    alt={decryptedFile.fileName} 
                    className="w-full max-h-[300px] object-cover" 
                  />
                  <a 
                    href={decryptedFile.fileData} 
                    download={decryptedFile.fileName}
                    className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity"
                  >
                    <Download className="w-8 h-8 text-white" />
                  </a>
                </div>
              ) : decryptedFile.fileType?.startsWith('audio/') ? (
                <AudioPlayer src={decryptedFile.fileData} isMe={isMe} />
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
                    <div className="text-[11px] font-bold truncate opacity-80 uppercase tracking-tight">{decryptedFile.fileName}</div>
                    <div className="text-[9px] opacity-40 font-mono">{(decryptedFile.fileData.length * 0.75 / 1024).toFixed(1)} KB</div>
                  </div>
                  <a 
                    href={decryptedFile.fileData} 
                    download={decryptedFile.fileName}
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

function AudioPlayer({ src, isMe }: { src: string; isMe: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(src);
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      setDuration(audio.duration || 0);
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      setProgress((audio.currentTime / (audio.duration || 1)) * 100);
    };

    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    
    audio.load();

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
    };
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(e => console.error("Audio playback stalled", e));
      setIsPlaying(true);
    }
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!audioRef.current || !duration) return;
    const value = parseFloat(e.target.value);
    const newTime = (value / 100) * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
    setProgress(value);
  };

  const formatAudioTime = (time: number) => {
    if (isNaN(time) || !isFinite(time)) return '0:00';
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-2xl w-full max-w-[280px] border shadow-md",
      isMe 
        ? "bg-zinc-100 text-zinc-900 border-zinc-200" 
        : "bg-zinc-950/60 text-zinc-200 border-zinc-850"
    )}>
      <button 
        type="button"
        onClick={togglePlay}
        className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform flex-shrink-0 cursor-pointer",
          isMe ? "bg-zinc-900 text-white" : "bg-white text-zinc-950"
        )}
      >
        {isPlaying ? (
          <Pause className="w-4 h-4 fill-current" />
        ) : (
          <Play className="w-4 h-4 fill-current translate-x-[1px]" />
        )}
      </button>
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <input 
          type="range" 
          min="0" 
          max="100" 
          value={progress}
          onChange={handleTimelineChange}
          className={cn(
            "w-full h-1 rounded-lg appearance-none cursor-pointer focus:outline-none",
            isMe ? "bg-zinc-300 accent-zinc-800" : "bg-zinc-800 accent-zinc-200"
          )}
        />
        <div className="flex justify-between items-center text-[9px] font-mono opacity-50">
          <span>{formatAudioTime(currentTime)}</span>
          <span>{formatAudioTime(duration || 0)}</span>
        </div>
      </div>
    </div>
  );
}
