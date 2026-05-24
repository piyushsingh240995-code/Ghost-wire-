import { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  stream: MediaStream | null;
}

export default function AudioVisualizer({ stream }: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    if (!stream) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    let audioCtx: AudioContext;
    let analyser: AnalyserNode;
    let source: MediaStreamAudioSourceNode;

    try {
      audioCtx = new AudioContextClass();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // nice small size for visualizer bands
      analyser.smoothingTimeConstant = 0.7; // smooth transition for bouncing effect

      source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);

      audioCtxRef.current = audioCtx;
      analyserRef.current = analyser;
      sourceRef.current = source;
    } catch (err) {
      console.error("Failed to initialize Web Audio context for recording visualizer", err);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const barCount = 12;

    const draw = () => {
      if (!analyserRef.current) return;
      animationRef.current = requestAnimationFrame(draw);

      const width = canvas.width;
      const height = canvas.height;

      // Clear the canvas
      ctx.clearRect(0, 0, width, height);

      // Fetch audio data
      analyser.getByteFrequencyData(dataArray);

      const gap = 3;
      const barWidth = (width - (gap * (barCount - 1))) / barCount;
      let x = 0;

      for (let i = 0; i < barCount; i++) {
        // Map equalizer bars to mid/high/low frequencies intelligently for sweet bouncing aesthetics
        // Human voice frequencies are lower, so we focus more on lower/middle frequency bins
        const dataIndex = Math.min(
          Math.floor((i / barCount) * bufferLength * 0.5) + 1,
          bufferLength - 1
        );
        const rawValue = dataArray[dataIndex] || 0;

        // Calculate a responsive height factor
        const amplitude = rawValue / 255;
        // Apply some scaling and a noise floor so the bars bounce beautifully even at low volumes
        const barHeight = Math.max(4, amplitude * height * 1.2);
        
        // Center the bar vertically
        const y = (height - barHeight) / 2;

        // Create a beautiful glowing red/rose gradient
        const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight);
        gradient.addColorStop(0, '#f43f5e'); // rose-500
        gradient.addColorStop(0.5, '#e11d48'); // rose-600
        gradient.addColorStop(1, '#9f1239'); // rose-800

        ctx.fillStyle = gradient;

        // Drawing a manual rounded rect path to guarantee full cross-browser support inside iframes/preview sandboxes
        ctx.beginPath();
        const r = Math.min(2, barWidth / 2); // rounded corner radius
        const w = barWidth;
        const h = barHeight;
        
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
        ctx.fill();

        x += barWidth + gap;
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      try {
        if (sourceRef.current) {
          sourceRef.current.disconnect();
        }
        if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
          audioCtxRef.current.close();
        }
      } catch (err) {
        console.warn("Muted error during audio cleanup:", err);
      }
    };
  }, [stream]);

  return (
    <div className="flex items-center justify-center bg-zinc-900/40 px-3 py-1.5 rounded-full border border-zinc-850">
      <canvas 
        ref={canvasRef} 
        width={100} 
        height={24} 
        className="w-[100px] h-[24px] block"
      />
    </div>
  );
}
