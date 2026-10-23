import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/** Writes the text to a temporary file and opens the share sheet (Save to Files, AirDrop, Mail…). */
export async function shareText(fileName: string, contents: string, mimeType: string): Promise<void> {
  const file = new File(Paths.cache, fileName);
  try {
    file.delete();
  } catch {
    // Nothing to replace.
  }
  await file.write(contents);
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName, UTI: mimeType === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json' });
}
