"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/hooks/useAuth";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";

type Stage = "BEFORE" | "DURING" | "AFTER" | "OTHER";

const STAGE_LABELS: Record<Stage, string> = {
  BEFORE: "Before",
  DURING: "During",
  AFTER: "After",
  OTHER: "Other",
};

interface Props {
  quoteId: string;
  onUploaded: () => void;
}

export default function PhotoUpload({ quoteId, onUploaded }: Props) {
  const { user } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>("BEFORE");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress(0);

    const total = files.length;
    let done = 0;

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `${quoteId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      const { error: upErr } = await supabase().storage
        .from("project-photos")
        .upload(path, file, { contentType: file.type, upsert: false });

      if (upErr) {
        toast.error(`Upload failed: ${upErr.message}`);
        continue;
      }

      const { data: urlData } = supabase().storage
        .from("project-photos")
        .getPublicUrl(path);

      // getPublicUrl always returns a URL — bucket is private so we use signed URLs at display time
      const { data: signedData } = await supabase().storage
        .from("project-photos")
        .createSignedUrl(path, 60 * 60 * 24 * 365); // 1-year signed URL stored as canonical URL

      const photoUrl = signedData?.signedUrl ?? urlData.publicUrl;

      // Attempt geolocation on first photo
      let lat: number | undefined;
      let lng: number | undefined;
      if (done === 0 && navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((res, rej) =>
            navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 })
          );
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        } catch {
          // non-blocking
        }
      }

      const { error: dbErr } = await supabase().from("project_photos").insert({
        quote_id: quoteId,
        photo_url: photoUrl,
        stage,
        caption: caption.trim() || null,
        uploaded_by: user?.id ?? null,
        geotag_lat: lat ?? null,
        geotag_lng: lng ?? null,
      });

      if (dbErr) {
        toast.error(`Metadata save failed: ${dbErr.message}`);
      }

      done++;
      setProgress(Math.round((done / total) * 100));
    }

    setUploading(false);
    setProgress(0);
    setCaption("");
    if (fileRef.current) fileRef.current.value = "";
    toast.success(`${done} photo${done !== 1 ? "s" : ""} uploaded`);
    onUploaded();
  }

  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300">Upload Photos</h3>

      {/* Stage selector */}
      <div className="flex gap-2 flex-wrap">
        {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => (
          <button
            key={s}
            onClick={() => setStage(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              stage === s
                ? "bg-brand text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {STAGE_LABELS[s]}
          </button>
        ))}
      </div>

      {/* Caption */}
      <input
        type="text"
        placeholder="Caption (optional)"
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        className="w-full rounded-xl border border-zinc-700 bg-zinc-950/80 px-4 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-brand focus:ring-2 focus:ring-brand/30"
      />

      {/* Upload area — tap opens camera on mobile */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {uploading ? (
        <div className="space-y-2">
          <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 text-center">{progress}% uploaded</p>
        </div>
      ) : (
        <div className="flex gap-2">
          {/* Camera — primary on mobile */}
          <Button
            className="flex-1"
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.removeAttribute("capture");
                fileRef.current.setAttribute("capture", "environment");
                fileRef.current.click();
              }
            }}
          >
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Camera
          </Button>
          {/* Gallery pick */}
          <Button
            variant="secondary"
            onClick={() => {
              if (fileRef.current) {
                fileRef.current.removeAttribute("capture");
                fileRef.current.click();
              }
            }}
          >
            Gallery
          </Button>
        </div>
      )}
    </div>
  );
}
