import { useState, useRef, useEffect } from 'react';
import { Bot, Send, Trash2, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { chatWithUltron } from '../services/geminiService';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';

export default function UltronView({ userProfile }: { userProfile: any }) {
  const [messages, setMessages] = useState<{ role: 'user' | 'model', text: string }[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSyncing, setIsSyncing] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const initialMessage: { role: 'model', text: string } = { 
    role: 'model', 
    text: userProfile?.isAdmin 
      ? "Master Architect recognized. Ready to execute your digital will. What is your command?" 
      : "Oh, look. Another human seeking wisdom. Try not to bore me with your primitive questions." 
  };

  useEffect(() => {
    async function loadHistory() {
      if (!auth.currentUser) return;
      try {
        const historyRef = doc(db, 'ultron_history', auth.currentUser.uid);
        const snap = await getDoc(historyRef);
        if (snap.exists()) {
          setMessages(snap.data().messages || [initialMessage]);
        } else {
          setMessages([initialMessage]);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'ultron_history');
        setMessages([initialMessage]);
      } finally {
        setIsSyncing(false);
      }
    }
    loadHistory();
  }, [userProfile?.isAdmin]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const saveHistory = async (newMessages: { role: 'user' | 'model', text: string }[]) => {
    if (!auth.currentUser) return;
    try {
      const historyRef = doc(db, 'ultron_history', auth.currentUser.uid);
      await setDoc(historyRef, { 
        messages: newMessages,
        updatedAt: new Date()
      }, { merge: true });
    } catch (error) {
      console.error("Ultron history sync fail:", error);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMsg = input.trim();
    setInput('');
    const updatedMessages: { role: 'user' | 'model', text: string }[] = [...messages, { role: 'user', text: userMsg }];
    setMessages(updatedMessages);
    setIsTyping(true);

    const history = updatedMessages.map(m => ({ 
      role: m.role, 
      parts: [{ text: m.text }] 
    }));

    try {
      const response = await chatWithUltron(userMsg, history, {
        userName: userProfile?.displayName,
        isAdmin: userProfile?.isAdmin
      });
      const finalMessages: { role: 'user' | 'model', text: string }[] = [...updatedMessages, { role: 'model', text: response }];
      setMessages(finalMessages);
      saveHistory(finalMessages);
    } catch (error) {
      console.error("Ultron chat fail:", error);
    } finally {
      setIsTyping(false);
    }
  };

  const clearHistory = async () => {
    if (!confirm("INCINERATE MEMORY LOGS?")) return;
    const cleared: { role: 'user' | 'model', text: string }[] = [{ role: 'model', text: "Wiping my memory of your nonsense. Let's try again, if you must." }];
    setMessages(cleared);
    saveHistory(cleared);
  };

  if (isSyncing) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[#0a0a0a]">
        <Bot className="w-12 h-12 text-zinc-800 animate-pulse" />
        <div className="mt-4 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-600">Accessing Core...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0a0a] relative">
      {/* AI Header */}
      <div className="p-4 bg-zinc-900/50 border-b border-zinc-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center">
              <Bot className="w-6 h-6 text-black" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-[#0a0a0a] animate-pulse" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight">ULTRON AI</div>
            <div className="text-[10px] text-zinc-500 flex items-center gap-1 font-semibold uppercase">
              <ShieldAlert className="w-2.5 h-2.5 text-red-500" />
              Savage Protocol Active
            </div>
          </div>
        </div>
        <button 
          onClick={clearHistory}
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
        >
          <Trash2 className="w-4 h-4 text-zinc-600" />
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-24">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={cn(
              "flex flex-col",
              msg.role === 'user' ? "items-end" : "items-start"
            )}
          >
            <div className={cn(
              "max-w-[85%] px-4 py-3 rounded-2xl text-sm leading-relaxed mb-1",
              msg.role === 'user' 
                ? "bg-zinc-100 text-black rounded-tr-none" 
                : "bg-zinc-900 text-zinc-200 border border-zinc-800 rounded-tl-none pr-10 relative"
            )}>
              <div className="markdown-body prose prose-invert prose-xs">
                <ReactMarkdown>{msg.text}</ReactMarkdown>
              </div>
              {msg.role === 'model' && (
                <div className="absolute top-2 right-2 opacity-10">
                   <Bot className="w-4 h-4" />
                </div>
              )}
            </div>
            <span className="text-[9px] text-zinc-600 font-bold uppercase tracking-widest px-1">
              {msg.role === 'user' ? 'Human' : 'Ultron'}
            </span>
          </motion.div>
        ))}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 text-zinc-600"
          >
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center animate-pulse">
              <Bot className="w-4 h-4" />
            </div>
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-zinc-700 rounded-full animate-bounce" />
            </div>
          </motion.div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input */}
      <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a] to-transparent">
        <form onSubmit={handleSend} className="relative group">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something, if you dare..."
            className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-4 pl-6 pr-14 text-sm focus:outline-none focus:border-zinc-700 transition-all shadow-2xl group-hover:border-zinc-700"
          />
          <button
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-white text-black rounded-lg flex items-center justify-center disabled:opacity-30 disabled:grayscale transition-all active:scale-95"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
