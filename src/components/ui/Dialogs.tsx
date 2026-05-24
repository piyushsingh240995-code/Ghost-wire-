import { motion, AnimatePresence } from 'motion/react';
import { ShieldAlert, Terminal, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  message,
  confirmLabel = "PROCEED",
  cancelLabel = "ABORT",
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-md bg-zinc-950 border border-zinc-900 rounded-2xl p-6 shadow-2xl relative overflow-hidden text-left"
        >
          {/* Subtle red line top */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-red-600 animate-pulse" />

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-red-955/50 border border-red-900/30 flex items-center justify-center flex-shrink-0">
              <ShieldAlert className="w-5 h-5 text-red-500" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="text-sm font-black text-rose-500 uppercase tracking-widest flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5" />
                {title}
              </h3>
              <p className="text-zinc-400 text-xs font-medium leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          <div className="flex gap-2 justify-end mt-6">
            <button
              onClick={onCancel}
              className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 text-xs font-bold rounded-xl transition-all uppercase tracking-wider cursor-pointer"
            >
              {cancelLabel}
            </button>
            <button
              onClick={onConfirm}
              className="px-4 py-2 bg-white hover:bg-zinc-200 text-black text-xs font-black rounded-xl transition-all uppercase tracking-wider cursor-pointer"
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

interface AlertModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
}

export function AlertModal({
  isOpen,
  title,
  message,
  buttonLabel = "UNDERSTOOD",
  onClose
}: AlertModalProps) {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-sm bg-zinc-950 border border-zinc-900 rounded-2xl p-6 shadow-2xl relative overflow-hidden text-left"
        >
          <div className="absolute top-0 left-0 right-0 h-1 bg-zinc-800" />

          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-zinc-90 w-10 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-zinc-400" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">
                {title}
              </h3>
              <p className="text-zinc-400 text-xs font-medium leading-relaxed">
                {message}
              </p>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-200 hover:text-white text-xs font-bold rounded-xl transition-all uppercase tracking-wider cursor-pointer"
            >
              {buttonLabel}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
