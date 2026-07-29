import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { BACKUP_VERSION, BackupV3Schema, type BackupV3 } from '@wakewake/domain';

import type { BackupRepository } from '@/db/repositories/BackupRepository';
import { parseBackup, serializeBackup } from './backupFormat';

export { parseBackup, serializeBackup } from './backupFormat';

export const MAX_BACKUP_BYTES = 10 * 1_024 * 1_024;

export interface PickedBackup {
  backup: BackupV3;
  name: string;
}

export class BackupService {
  public constructor(private readonly backupRepository: BackupRepository) {}

  public async exportAndShare(now = new Date()): Promise<void> {
    if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is unavailable');
    const backup = await this.backupRepository.createBackup(now);
    const file = new File(Paths.cache, backupFilename('wakewake-backup', now));
    try {
      file.create({ overwrite: true });
      file.write(serializeBackup(backup));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        UTI: 'public.json',
        dialogTitle: '导出 WakeWake 备份',
      });
    } finally {
      if (file.exists) file.delete();
    }
  }

  public async pickBackup(): Promise<PickedBackup | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/json',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return null;
    const asset = result.assets[0];
    if (asset === undefined) throw new Error('No backup file was selected');
    if (asset.size !== undefined && asset.size > MAX_BACKUP_BYTES) throw backupTooLargeError();

    const file = new File(asset.uri);
    if (!file.exists) throw new Error('Selected backup file cannot be read');
    if (file.size > MAX_BACKUP_BYTES) throw backupTooLargeError();
    const text = await file.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BACKUP_BYTES) throw backupTooLargeError();
    return { backup: parseBackup(text), name: asset.name };
  }

  public async replaceFromBackup(backupValue: BackupV3, now = new Date()): Promise<string> {
    const backup = BackupV3Schema.parse(backupValue);
    const current = await this.backupRepository.createBackup(now);
    const recoveryFile = new File(Paths.document, backupFilename('wakewake-pre-import', now));
    recoveryFile.create({ overwrite: false });
    recoveryFile.write(serializeBackup(current));
    if (!recoveryFile.exists || recoveryFile.size === 0) {
      throw new Error('Could not create the pre-import recovery backup');
    }
    await this.backupRepository.replaceAll(backup, now);
    return recoveryFile.uri;
  }
}

function backupFilename(prefix: string, date: Date): string {
  const stamp = date.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `${prefix}-v${BACKUP_VERSION}-${stamp}.wakewake.json`;
}

function backupTooLargeError(): Error {
  return new Error(`Backup file exceeds ${MAX_BACKUP_BYTES / 1_024 / 1_024} MB`);
}
