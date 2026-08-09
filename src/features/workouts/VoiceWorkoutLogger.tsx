import { useMemo, useRef, useState } from "react";
import { Check, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  matchVoiceExercise,
  parseVoiceWorkoutEntry,
  type VoiceWorkoutUnit,
} from "@/lib/voiceWorkout";

type Exercise = { id: string; name?: string };

type Props = {
  exercises: Exercise[];
  defaultUnit: VoiceWorkoutUnit;
  disabled?: boolean;
  onApply: (args: {
    exerciseId: string;
    load: string | null;
    repsDone: string | null;
  }) => void | Promise<void>;
};

type RecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  onend: (() => void) | null;
};

export function VoiceWorkoutLogger({
  exercises,
  defaultUnit,
  disabled = false,
  onApply,
}: Props) {
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);

  const speechSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const w = window as any;
    return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
  }, []);

  const parsed = useMemo(
    () => parseVoiceWorkoutEntry(transcript, defaultUnit),
    [defaultUnit, transcript]
  );
  const match = useMemo(
    () => (parsed ? matchVoiceExercise(parsed, exercises) : null),
    [exercises, parsed]
  );

  const beginListening = () => {
    setMessage(null);
    if (!speechSupported || disabled || typeof window === "undefined") return;
    const w = window as any;
    const Recognition = w.SpeechRecognition || w.webkitSpeechRecognition;
    const recognition = new Recognition() as RecognitionLike;
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event: any) => {
      const next = event?.results?.[0]?.[0]?.transcript;
      if (typeof next === "string") setTranscript(next.trim());
    };
    recognition.onerror = () => {
      setMessage("Voice input was not captured. Type the set instead.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const apply = async () => {
    if (!parsed) {
      setMessage(
        "Try “bench press 225 for 8” or “squat 3 sets of 5 at 315 pounds.”"
      );
      return;
    }
    if (!match) {
      setMessage(
        `I heard “${parsed.exercise},” but it does not uniquely match today’s exercises.`
      );
      return;
    }
    const load =
      parsed.weight == null
        ? null
        : `${parsed.weight}${parsed.unit ? ` ${parsed.unit}` : ""}`;
    await onApply({
      exerciseId: match.id,
      load,
      repsDone:
        parsed.reps == null
          ? null
          : parsed.sets == null
            ? String(parsed.reps)
            : `${parsed.sets}×${parsed.reps}`,
    });
    const completed =
      parsed.reps == null
        ? ""
        : parsed.sets == null
          ? `${parsed.reps} reps`
          : `${parsed.sets}×${parsed.reps}`;
    setMessage(
      `Logged ${match.name || parsed.exercise}${load ? ` · ${load}` : ""}${completed ? ` · ${completed}` : ""}.`
    );
    setTranscript("");
  };

  return (
    <Card className="border-primary/20 bg-card/60">
      <CardContent className="space-y-3 p-4">
        <div>
          <p className="font-medium">Voice log</p>
          <p className="text-xs text-muted-foreground">
            Say a working set, then confirm it before it is saved.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            className="min-h-11 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm"
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setMessage(null);
            }}
            placeholder={`e.g. bench press ${defaultUnit === "kg" ? "80 kg" : "185 lb"} for 8`}
            aria-label="Workout voice transcript"
            disabled={disabled}
          />
          {speechSupported ? (
            <Button
              type="button"
              variant={listening ? "destructive" : "outline"}
              size="icon"
              className="h-11 w-11 shrink-0"
              onClick={listening ? stopListening : beginListening}
              disabled={disabled}
              aria-label={listening ? "Stop listening" : "Log set by voice"}
            >
              {listening ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </Button>
          ) : null}
        </div>
        {parsed && match ? (
          <div className="rounded-lg border bg-background/70 p-3 text-sm">
            <p className="font-medium">{match.name || parsed.exercise}</p>
            <p className="text-muted-foreground">
              {parsed.weight != null
                ? `${parsed.weight} ${parsed.unit ?? defaultUnit}`
                : "Bodyweight / no load"}
              {parsed.reps != null ? ` · ${parsed.reps} reps` : ""}
              {parsed.sets != null ? ` · ${parsed.sets} sets` : ""}
            </p>
          </div>
        ) : null}
        <Button
          type="button"
          className="w-full"
          onClick={() => void apply()}
          disabled={disabled || !transcript.trim()}
        >
          <Check className="mr-2 h-4 w-4" /> Confirm log
        </Button>
        {!speechSupported ? (
          <p className="text-xs text-muted-foreground">
            Voice recognition is not available in this browser. The same
            quick-log phrase can still be typed.
          </p>
        ) : null}
        {message ? (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
