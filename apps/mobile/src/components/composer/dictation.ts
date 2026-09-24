import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";
import { intlLocale } from "@/lib/i18n";

/** Words said after what is already written, with a space between them. */
const join = (before: string, spoken: string) => (!spoken ? before : !before || /\s$/.test(before) ? before + spoken : `${before} ${spoken}`);

/**
 * The composer's dictation: the phone's speech recognizer (SFSpeechRecognizer on iOS) writes what is said
 * after the text already in the field, live, until `stop`. `onText` gets the field's whole new text.
 */
export function useDictation(onText: (text: string) => void) {
  const [listening, setListening] = useState(false);
  // The field's text before the words being recognized: a final result is added to it.
  const base = useRef("");

  useSpeechRecognitionEvent("start", () => setListening(true));
  useSpeechRecognitionEvent("end", () => setListening(false));
  useSpeechRecognitionEvent("error", (e) => {
    setListening(false);
    // Stopped by us, or silence: nothing to report.
    if (e.error !== "aborted" && e.error !== "no-speech") haptic.error();
  });
  useSpeechRecognitionEvent("result", (e) => {
    const spoken = e.results[0]?.transcript.trim() ?? "";
    const text = join(base.current, spoken);
    // Android's continuous mode starts each sentence over after a final result; iOS gives the whole session.
    if (e.isFinal) base.current = text;
    onText(text);
  });

  // Leaving the conversation stops listening.
  useEffect(() => () => ExpoSpeechRecognitionModule.abort(), []);

  const start = async (text: string) => {
    if (!(await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted) {
      haptic.error();
      return;
    }
    base.current = text;
    haptic.tap();
    ExpoSpeechRecognitionModule.start({
      lang: intlLocale,
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
    });
  };

  const stop = () => {
    if (listening) ExpoSpeechRecognitionModule.stop();
  };

  return { listening, start, stop, abort: () => ExpoSpeechRecognitionModule.abort() };
}
