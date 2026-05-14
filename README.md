# 👻 GhostWire - The Secure Transmission Protocol

GhostWire is a high-privacy, end-to-end encrypted (E2EE) messaging protocol designed for those who value absolute digital sovereignty. It combines cryptographic security with a savage user experience.

## 🚀 Vision
In a world of constant surveillance, GhostWire provides a dark, secure void for your communication. No middleman can decipher your signals.

## ✨ Core Features

### 🔐 Cryptographic Sovereignty
- **End-to-End Encryption (E2EE)**: Powered by RSA-OAEP & AES-GCM. Signals are sealed on the sender's device and unsealed ONLY on the recipient's.
- **Identity Vault**: Private keys are wrapped using a Vault Key derived from your unique identity via PBKDF2. Even the database only sees encrypted key fragments.

### 🕵️ Stealth Tactics
- **Ghost Mode**: Enable the Ghost Sequence to stop sending "Seen" receipts. Read signals without leaving a trace.
- **Ephemera (Self-Destruct)**: Toggle ephemeral mode for higher stakes conversations. Ensure your data stays relevant only in the moment.
- **Incinerate Command**: Complete conversation purging that leaves no residue in the cloud.

### 🤖 Savage Intelligence
- **Ultron AI Assistant**: A ULT-PROTO-99 powerd (my llm model but if tou want then you can use gemini api) ai intelligence that provides savage, no-nonsense help. Access the bot anytime for data analysis or brutal honesty.

### 📡 High-Fidelity Transmissions
- **Real-time Sync**: Instant signal delivery with millisecond-latency typing indicators and seen receipts.
- **Encrypted Media**: Share images and documents directly into the E2EE void.
- **Reactive Emojis**: Instagram-style reactions with an expandable emoji arsenal for nuanced feedback.

### 🏛️ Architect Oversight
- **Admin Protocol**: Special Architect accounts can ban malicious entities to protect the network's integrity.
- **Identity Verification**: Strict username constraints and profile protection.

## 📱 Platform Support
- **Full PWA Experience**: Install GhostWire on your Home Screen. It looks, feels, and acts like a native APK/App.
- **Offline Resilience**: Service-worker powered caching ensures the interface remains responsive even in dead zones.

## 🛠️ Technical Stack
- **Frontend**: React 18, Vite, Tailwind CSS, Motion.
- **Backend**: Firebase (Firestore, Auth).
- **Security**: SubtleCrypto API for client-side cryptographic ops.
- **AI**: Google Gemini Pro via `@google/genai`.

## 📦 Local Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Environment Variables**:
   Create a `.env` file with:
   - `VITE_FIREBASE_CONFIG`
   - `GEMINI_API_KEY`
3. **Start the Engine**:
   ```bash
   npm run dev
   ```

---
*Built for the shadows. GhostWire Protocol v1.0.0*
