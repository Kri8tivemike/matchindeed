"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Info } from "lucide-react";
import {
  ALLOWED_PHOTO_TYPES,
  ALLOWED_PHOTO_FORMATS_LABEL,
  MAX_PHOTOS,
  MAX_PHOTO_SIZE_BYTES,
  validatePhotoBatch,
} from "@/lib/photo/validation";
import PhotoPreview from "@/components/registration/photo-preview";

type PhotoUploadProps = {
  files: File[];
  onChange: (files: File[]) => void;
};

const MAX_PHOTO_SIZE_MB = Math.round(MAX_PHOTO_SIZE_BYTES / (1024 * 1024));

export default function PhotoUpload({ files, onChange }: PhotoUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const selfieInputRef = useRef<HTMLInputElement | null>(null);

  const safeFiles = useMemo(
    () => files.filter((file): file is File => file instanceof File),
    [files]
  );
  const previews = useMemo(
    () => safeFiles.map((file) => URL.createObjectURL(file)),
    [safeFiles]
  );

  useEffect(() => {
    return () => {
      previews.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previews]);

  const handleFileSelection = (list: FileList | null) => {
    if (!list) return;

    const picked = Array.from(list);
    const next = [...safeFiles, ...picked].slice(0, MAX_PHOTOS);
    const validation = validatePhotoBatch(next);

    if (!validation.valid) {
      setError(validation.errors[0]);
      return;
    }

    setError(null);
    onChange(next);
  };

  const removePhoto = (index: number) => {
    const next = safeFiles.filter((_, idx) => idx !== index);
    setError(null);
    onChange(next);
  };

  const openGalleryPicker = () => {
    galleryInputRef.current?.click();
  };

  const openSelfieCamera = () => {
    selfieInputRef.current?.click();
  };

  return (
    <div className="space-y-4">
      <label className="block cursor-pointer rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-4 py-6 text-center transition-colors hover:border-[#1f419a] hover:bg-[#f8faff]">
        <input
          ref={galleryInputRef}
          type="file"
          accept={ALLOWED_PHOTO_TYPES.join(",")}
          multiple
          className="hidden"
          onChange={(event) => handleFileSelection(event.target.files)}
        />
        <input
          ref={selfieInputRef}
          type="file"
          accept="image/*"
          capture="user"
          className="hidden"
          onChange={(event) => handleFileSelection(event.target.files)}
        />

        <ImagePlus className="mx-auto h-8 w-8 text-[#1f419a]" />
        <p className="mt-2 text-sm font-medium text-gray-800">Upload up to {MAX_PHOTOS} photos</p>
        <p className="mt-1 text-xs text-gray-500">
          {ALLOWED_PHOTO_FORMATS_LABEL}. Max {MAX_PHOTO_SIZE_MB}MB per image.
        </p>
      </label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={openSelfieCamera}
          className="rounded-xl border border-[#1f419a]/30 bg-[#1f419a]/5 px-3 py-2 text-sm font-medium text-[#1f419a] transition-colors hover:bg-[#1f419a]/10"
        >
          Take selfie
        </button>
        <button
          type="button"
          onClick={openGalleryPicker}
          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Upload from gallery
        </button>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4" />
          <p>
            Face-forward photos perform best. Uploaded images enter moderation review before full
            visibility.
          </p>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {safeFiles.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {previews.map((src, index) => (
            <PhotoPreview
              key={`${src}-${index}`}
              src={src}
              index={index}
              onRemove={() => removePhoto(index)}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500">No photos selected yet.</p>
      )}
    </div>
  );
}
