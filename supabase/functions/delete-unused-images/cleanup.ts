export const fileNameFromUri = (uri: string | null | undefined) =>
  uri?.split('/').pop()?.split('?')[0] || null;

export const findUnusedFiles = (fileNames: string[], usedUris: (string | null)[]) => {
  const used = new Set(usedUris.map(fileNameFromUri).filter(Boolean));
  return fileNames.filter((name) => !used.has(name));
};
