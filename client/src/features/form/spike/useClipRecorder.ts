import { File } from 'expo-file-system';
import { useEffect, useRef } from 'react';
import type { CameraVideoOutput, Recorder } from 'react-native-vision-camera';

import { RECORDING_CLIP_SECONDS } from './protocol';

/** 'default' when switching the codec failed, so the clip used the output's own choice. */
export type FinishedClip = { seconds: number; bytes: number; codec: 'h264' | 'h265' | 'default' };

/** Tries before giving up on the codec (the video output may still be connecting to the session). */
const CODEC_TRIES = 6;
const RETRY_MS = 400;

/**
 * While `active`, records back-to-back clips of RECORDING_CLIP_SECONDS (about a set's length),
 * reports each clip's length and size, then deletes it, so a 30-minute run never fills the phone.
 * A failed clip is reported and the loop starts again, since a camera reconfigure (a camera flip,
 * a run step) can end one mid-way.
 */
export function useClipRecorder(
  output: CameraVideoOutput,
  active: boolean,
  codec: 'h264' | 'h265',
  onClip: (clip: FinishedClip) => void,
  onError: (message: string) => void,
) {
  const callbacks = useRef({ onClip, onError });
  useEffect(() => {
    callbacks.current = { onClip, onError };
  }, [onClip, onError]);

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let recorder: Recorder | undefined;
    let clipTimer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    // The recorder reports 0 once it has stopped, so its numbers are read just before stopping.
    let measured = { seconds: 0, bytes: 0 };

    const later = (ms: number, attempt = 0) => {
      if (stopped) return;
      retryTimer = setTimeout(() => void startClip(attempt), ms);
    };

    const stopClip = () => {
      const current = recorder;
      if (!current || !current.isRecording) return;
      measured = { seconds: current.recordedDuration, bytes: current.recordedFileSize };
      current.stopRecording().catch((e: unknown) => callbacks.current.onError(String(e)));
    };

    /** Measures and deletes a finished (or failed) clip's file. */
    const collect = (filePath: string | undefined, startedAt: number) => {
      let bytes = measured.bytes;
      const seconds = measured.seconds > 0 ? measured.seconds : (Date.now() - startedAt) / 1000;
      if (filePath) {
        const file = new File(filePath.startsWith('file://') ? filePath : `file://${filePath}`);
        try {
          bytes = file.size ?? bytes;
        } catch {
          // Keep the recorder's own count.
        }
        try {
          file.delete();
        } catch {
          // Already gone.
        }
      }
      return { seconds, bytes };
    };

    const startClip = async (attempt: number) => {
      if (stopped) return;
      let clipCodec: FinishedClip['codec'] = codec;
      try {
        await output.setOutputSettings({ codec });
      } catch (e) {
        if (attempt + 1 < CODEC_TRIES) {
          later(RETRY_MS, attempt + 1);
          return;
        }
        clipCodec = 'default';
        callbacks.current.onError(`Couldn't switch to ${codec === 'h265' ? 'HEVC' : 'H.264'}: ${String(e)}`);
      }
      if (stopped) return;
      try {
        // maxDuration is a backstop in case the timer below doesn't fire.
        const next = await output.createRecorder({ maxDuration: RECORDING_CLIP_SECONDS + 30 });
        if (stopped) return;
        recorder = next;
        measured = { seconds: 0, bytes: 0 };
        const startedAt = Date.now();
        let done = false;
        const finish = (filePath: string | undefined, error?: string) => {
          if (done) return;
          done = true;
          if (clipTimer) clearTimeout(clipTimer);
          const clip = collect(filePath, startedAt);
          if (error) callbacks.current.onError(`Recording: ${error}`);
          else callbacks.current.onClip({ ...clip, codec: clipCodec });
          later(error ? 1000 : 0);
        };
        await next.startRecording(
          (filePath) => finish(filePath),
          (error) => finish(next.filePath || undefined, error.message),
        );
        if (stopped) {
          // Cleanup ran while the recording was starting: stop it, and arm no timer.
          next.stopRecording().catch(() => {});
          return;
        }
        clipTimer = setTimeout(stopClip, RECORDING_CLIP_SECONDS * 1000);
      } catch (e) {
        callbacks.current.onError(`Recording: ${String(e)}`);
        later(1000);
      }
    };

    void startClip(0);
    return () => {
      stopped = true;
      if (clipTimer) clearTimeout(clipTimer);
      if (retryTimer) clearTimeout(retryTimer);
      stopClip();
    };
  }, [output, active, codec]);
}
