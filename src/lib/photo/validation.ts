export const MAX_PHOTOS = 5;
export const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
export const ALLOWED_PHOTO_FORMATS_LABEL = "JPG, PNG, WEBP, HEIC, or HEIF";

type FileLike = {
  name: string;
  size: number;
  type: string;
};

export type PhotoValidationResult = {
  valid: boolean;
  errors: string[];
};

export function validatePhotoFile(file: FileLike): PhotoValidationResult {
  const errors: string[] = [];

  if (!ALLOWED_PHOTO_TYPES.includes(file.type)) {
    errors.push(`${file.name}: invalid format. Use ${ALLOWED_PHOTO_FORMATS_LABEL}.`);
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    errors.push(`${file.name}: file is too large (max 5MB).`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function validatePhotoBatch(files: FileLike[]): PhotoValidationResult {
  const errors: string[] = [];

  if (files.length > MAX_PHOTOS) {
    errors.push(`You can upload up to ${MAX_PHOTOS} photos.`);
  }

  files.forEach((file) => {
    const result = validatePhotoFile(file);
    errors.push(...result.errors);
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
