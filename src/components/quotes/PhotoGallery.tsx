"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/hooks/useAuth";
import { toast } from "sonner";

type Stage = "BEFORE" | "DURING" | "AFTER" | "OTHER";

const STAGES: Stage[] = ["BEFORE", "DURING", "AFTER", "OTHER"];
const STAGE_LABELS: Record<Stage, string> = {
  BEFORE: "Before",
  DURING: "During",
  AFTER: "After",
  OTHER: "Other",
};

export interface ProjectPhoto {
  id: string;
  photo_url: string;
  stage: Stage;
  caption?: string | null;
  uploaded_by?: string | null;
  uploaded_at: string;
}

interface Props {
  photos: ProjectPhoto[];
  onDelete: (id: string) => void;
}

export default function PhotoGallery({ photos, onDelete }: Props) {
  const { profile } = useAuth();
  const [activeStage, setActiveStage] = useState<Stage>("BEFORE");
  const [lightbox, setLightbox] = useState<ProjectPhoto | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const canDelete = (photo: ProjectPhoto) =>
    profile?.role === "owner" ||
    profile?.role === "admin" ||
    photo.uploaded_by === profile?.id;

  async function handleDelete(photo: ProjectPhoto) {
    setDeleting(photo.id);
    try {
      // Extract storage path from URL
      const url = new URL(photo.photo_url);
      const pathMatch = url.pathname.match(/project-photos\/(.+)$/);
      if (pathMatch) {
        await supabase().storage.from("project-photos").remove([pathMatch[1]]);
      }
      const { error } = await supabase().from("project_photos").delete().eq("id", photo.id);
      if (error) throw new Error(error.message);
      onDelete(photo.id);
      toast.success("Photo deleted");
      if (lightbox?.id === photo.id) setLightbox(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
    setDeleting(null);
  }

  const stagesWithPhotos = STAGES.filter((s) => photos.some((p) => p.stage === s));
  const displayStages = stagesWithPhotos.length > 0 ? stagesWithPhotos : STAGES;
  const filtered = photos.filter((p) => p.stage === activeStage);

  if (photos.length === 0) {
    return (
      <div className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
        <svg className="mx-auto h-10 w-10 text-zinc-700 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-sm text-zinc-500">No photos yet. Use the upload panel above to add project documentation.</p>
      </div>
    );
  }

  return (
    <>
      {/* Stage tabs */}
      <div className="flex gap-1 flex-wrap mb-4">
        {displayStages.map((s) => {
          const count = photos.filter((p) => p.stage === s).length;
          return (
            <button
              key={s}
              onClick={() => setActiveStage(s)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition flex items-center gap-1.5 ${
                activeStage === s
                  ? "bg-brand text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {STAGE_LABELS[s]}
              {count > 0 && (
                <span className={`rounded-full px-1.5 py-0 text-[10px] ${
                  activeStage === s ? "bg-white/20" : "bg-zinc-700"
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500 text-center py-8">No {STAGE_LABELS[activeStage].toLowerCase()} photos yet.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((photo) => (
            <div key={photo.id} className="relative group rounded-xl overflow-hidden bg-zinc-900 border border-zinc-800 aspect-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.photo_url}
                alt={photo.caption ?? "Project photo"}
                className="w-full h-full object-cover cursor-pointer transition group-hover:scale-105 duration-200"
                onClick={() => setLightbox(photo)}
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex flex-col justify-end p-2 pointer-events-none">
                {photo.caption && (
                  <p className="text-xs text-white line-clamp-2">{photo.caption}</p>
                )}
              </div>
              {/* Delete button */}
              {canDelete(photo) && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo); }}
                  disabled={deleting === photo.id}
                  className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 text-white"
                  title="Delete photo"
                >
                  {deleting === photo.id ? (
                    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                  ) : (
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.photo_url}
              alt={lightbox.caption ?? "Project photo"}
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
            {lightbox.caption && (
              <p className="mt-3 text-sm text-zinc-300 text-center">{lightbox.caption}</p>
            )}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-zinc-500">
                {STAGE_LABELS[lightbox.stage]} · {new Date(lightbox.uploaded_at).toLocaleDateString()}
              </span>
              <div className="flex gap-2">
                {canDelete(lightbox) && (
                  <button
                    onClick={() => handleDelete(lightbox)}
                    disabled={deleting === lightbox.id}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium bg-red-900/50 text-red-300 hover:bg-red-800 transition"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setLightbox(null)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
