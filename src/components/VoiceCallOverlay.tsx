import React, { useEffect, useRef, useState } from 'react';
import { PhoneOff, Mic, MicOff, Volume2, ShieldCheck, Radio } from 'lucide-react';
import type { Conversation } from '../types/kestrel';

interface VoiceCallOverlayProps {
  conversation: Conversation;
  deviceId: string;
  sendSignal: (payload: Record<string, unknown>) => void;
  incomingSignal: Record<string, unknown> | null;
  onEndCall: (durationSec: number) => void;
}

export const VoiceCallOverlay: React.FC<VoiceCallOverlayProps> = ({
  conversation,
  deviceId,
  sendSignal,
  incomingSignal,
  onEndCall,
}) => {
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [peerConnected, setPeerConnected] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [micStatus, setMicStatus] = useState<'connecting' | 'live' | 'fallback'>('connecting');

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const secondsRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSeconds((s) => {
        secondsRef.current = s + 1;
        return s + 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let rafId = 0;
    let audioCtx: AudioContext | null = null;

    const initMediaAndRtc = async () => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      pcRef.current = pc;

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendSignal({
            type: 'ice',
            conversationId: conversation.id,
            fromDevice: deviceId,
            candidate: ev.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (ev) => {
        if (remoteAudioRef.current && ev.streams[0]) {
          remoteAudioRef.current.srcObject = ev.streams[0];
          setPeerConnected(true);
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setPeerConnected(true);
        }
      };

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        setMicStatus('live');
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        // Web Audio real-time microphone level meter
        audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          if (!active) return;
          analyser.getByteFrequencyData(data);
          const avg = data.reduce((acc, v) => acc + v, 0) / data.length;
          setAudioLevel(Math.min(100, Math.round((avg / 128) * 100)));
          rafId = requestAnimationFrame(tick);
        };
        tick();

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          type: 'offer',
          conversationId: conversation.id,
          fromDevice: deviceId,
          sdp: offer,
        });
      } catch {
        if (active) setMicStatus('fallback');
      }
    };

    initMediaAndRtc();

    return () => {
      active = false;
      cancelAnimationFrame(rafId);
      if (audioCtx) audioCtx.close().catch(() => {});
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (pcRef.current) {
        pcRef.current.close();
      }
    };
  }, [conversation.id, deviceId, sendSignal]);

  // Handle incoming WebRTC signaling from another synced tab/device
  useEffect(() => {
    if (!incomingSignal || incomingSignal.fromDevice === deviceId) return;
    if (incomingSignal.conversationId !== conversation.id) return;
    const pc = pcRef.current;
    if (!pc) return;

    const handleSignal = async () => {
      try {
        if (incomingSignal.type === 'offer' && incomingSignal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal.sdp as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({
            type: 'answer',
            conversationId: conversation.id,
            fromDevice: deviceId,
            sdp: answer,
          });
        } else if (incomingSignal.type === 'answer' && incomingSignal.sdp) {
          await pc.setRemoteDescription(new RTCSessionDescription(incomingSignal.sdp as RTCSessionDescriptionInit));
        } else if (incomingSignal.type === 'ice' && incomingSignal.candidate) {
          await pc.addIceCandidate(new RTCIceCandidate(incomingSignal.candidate as RTCIceCandidateInit));
        }
      } catch {
        // Ignore stale signaling frames
      }
    };
    handleSignal();
  }, [incomingSignal, conversation.id, deviceId, sendSignal]);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !next;
      });
    }
  };

  const formattedTime = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(
    seconds % 60
  ).padStart(2, '0')}`;

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[340px] bg-[#121720] border border-emerald-500/35 rounded-2xl p-4 shadow-2xl">
      <audio ref={remoteAudioRef} autoPlay className="hidden" />

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-xs text-emerald-400 font-medium flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>DTLS-SRTP Encrypted Call</span>
          </p>
          <h3 className="font-display text-base font-semibold text-slate-100 truncate mt-0.5">
            {conversation.name}
          </h3>
          <p className="text-xs text-slate-400">
            {peerConnected
              ? 'Peer audio bridge active'
              : micStatus === 'live'
                ? 'Microphone live · Awaiting peer'
                : 'Encrypted signaling channel ready'}
          </p>
        </div>

        <span className="font-mono text-sm tabular-nums text-slate-100 bg-[#090C10] px-2.5 py-1 rounded-lg border border-white/[0.08]">
          {formattedTime}
        </span>
      </div>

      {/* Real Microphone Signal Meter */}
      <div className="mb-4 p-2.5 rounded-xl bg-[#090C10] border border-white/[0.06] flex items-center gap-3">
        <Radio className="w-4 h-4 text-emerald-400 shrink-0" />
        <div className="flex-1 h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-400 transition-all duration-75"
            style={{ width: `${muted ? 0 : Math.max(8, audioLevel)}%` }}
          />
        </div>
        <span className="text-[11px] font-mono tabular-nums text-slate-400">
          {muted ? 'MUTED' : `${audioLevel}%`}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleMute}
          className={`flex-1 h-10 rounded-xl border text-xs font-medium flex items-center justify-center gap-1.5 transition-colors ${
            muted
              ? 'bg-amber-500/15 border-amber-500/35 text-amber-200'
              : 'bg-[#18202B] border-white/[0.08] text-slate-200 hover:bg-[#202B3A]'
          }`}
        >
          {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          <span>{muted ? 'Unmute' : 'Mute'}</span>
        </button>

        <div className="h-10 px-3 rounded-xl bg-[#18202B] border border-white/[0.08] text-slate-300 text-xs flex items-center gap-1.5">
          <Volume2 className="w-4 h-4 text-emerald-400" />
          <span>HD</span>
        </div>

        <button
          type="button"
          onClick={() => {
            sendSignal({ type: 'hangup', conversationId: conversation.id, fromDevice: deviceId });
            onEndCall(secondsRef.current);
          }}
          className="h-10 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End</span>
        </button>
      </div>
    </div>
  );
};
