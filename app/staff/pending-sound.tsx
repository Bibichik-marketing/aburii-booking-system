"use client";
import { useRef, useState } from "react";
import { pendingAlerts } from "@/lib/pending-approval.mjs";
const key = "aburii-pending-alert-ids-v1";
export function usePendingSound() {
  const audio = useRef<AudioContext | null>(null);
  const latestIds = useRef<string[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  async function toggle() {
    if (enabled) { setEnabled(false); return; }
    try {
      if (!navigator.locks) throw Error("Sound locking unavailable");
      audio.current ??= new AudioContext();
      await audio.current.resume();
      // Enabling sound starts from the currently visible queue, without old alerts.
      await navigator.locks.request(key, async () => {
        const stored = localStorage.getItem(key);
        const parsed = stored ? JSON.parse(stored) : [];
        const seen = Array.isArray(parsed) && parsed.every(id => typeof id === "string") ? parsed : [];
        localStorage.setItem(key, JSON.stringify(pendingAlerts(seen, latestIds.current).seen));
      });
      setEnabled(true); setFailed(false);
    } catch { setFailed(true); }
  }
  async function observe(ids: string[]) {
    latestIds.current = ids;
    // A browser-wide lock prevents two Staff tabs sounding for the same booking.
    if (!navigator.locks) return;
    await navigator.locks.request(key, async () => {
      try {
        const stored = localStorage.getItem(key);
        const parsed = stored ? JSON.parse(stored) : null;
        const seen = Array.isArray(parsed) && parsed.every(id => typeof id === "string") ? parsed : null;
        if (!enabled && seen !== null) return;
        const next = pendingAlerts(seen, ids);
        localStorage.setItem(key, JSON.stringify(next.seen));
        if (!enabled || !next.fresh.length || audio.current?.state !== "running") return;
        const context = audio.current;
        const tone = context.createOscillator(), gain = context.createGain();
        tone.frequency.value = 660;
        gain.gain.setValueAtTime(0.08, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.35);
        tone.connect(gain); gain.connect(context.destination);
        tone.start(); tone.stop(context.currentTime + 0.35);
      } catch { setFailed(true); }
    });
  }
  return { enabled, failed, toggle, observe };
}
