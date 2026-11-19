import { exportDatabase } from '../../scripts/export-database.js';

const debounceMs = 2000;
let timer;
let exporting = false;
let changedDuringExport = false;

export function scheduleDatabaseBackup() {
  if (exporting) {
    changedDuringExport = true;
    return;
  }

  clearTimeout(timer);
  timer = setTimeout(async () => {
    timer = undefined;
    exporting = true;
    try {
      await exportDatabase();
    } catch (error) {
      console.error('Automatic database export failed:', error);
    } finally {
      exporting = false;
      if (changedDuringExport) {
        changedDuringExport = false;
        scheduleDatabaseBackup();
      }
    }
  }, debounceMs);
}
