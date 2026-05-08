"use client";

import Image from "next/image";
import { X } from "lucide-react";

type PhotoPreviewProps = {
  src: string;
  onRemove: () => void;
  index: number;
};

export default function PhotoPreview({ src, onRemove, index }: PhotoPreviewProps) {
  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white">
      <Image
        src={src}
        alt={`Registration photo ${index + 1}`}
        width={240}
        height={240}
        className="h-36 w-full object-cover"
      />

      <button
        type="button"
        onClick={onRemove}
        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black"
      >
        <X className="h-4 w-4" />
      </button>

      {index === 0 ? (
        <span className="absolute bottom-2 left-2 rounded-full bg-[#1f419a] px-2 py-0.5 text-[11px] font-medium text-white">
          Primary
        </span>
      ) : null}
    </div>
  );
}
