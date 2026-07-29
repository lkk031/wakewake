import { createContext, type PropsWithChildren, useContext, useMemo } from 'react';
import { useSQLiteContext } from 'expo-sqlite';

import { BackupRepository } from '@/db/repositories/BackupRepository';
import { NotificationRepository } from '@/db/repositories/NotificationRepository';
import { SettingsRepository } from '@/db/repositories/SettingsRepository';
import { TodoRepository } from '@/db/repositories/TodoRepository';
import { TodoTemplateRepository } from '@/db/repositories/TodoTemplateRepository';
import { BackupService } from '@/services/backup/BackupService';
import { NotificationCoordinator } from '@/services/notifications/NotificationCoordinator';
import { ExpoNotificationAdapter } from '@/services/notifications/nativeAdapter';

export interface AppServices {
  todoRepository: TodoRepository;
  todoTemplateRepository: TodoTemplateRepository;
  settingsRepository: SettingsRepository;
  notificationRepository: NotificationRepository;
  notificationCoordinator: NotificationCoordinator;
  backupService: BackupService;
}

const AppServicesContext = createContext<AppServices | null>(null);

export function AppServicesProvider({ children }: PropsWithChildren) {
  const database = useSQLiteContext();
  const services = useMemo<AppServices>(() => {
    const todoRepository = new TodoRepository(database);
    const notificationRepository = new NotificationRepository(database);
    return {
      todoRepository,
      todoTemplateRepository: new TodoTemplateRepository(database),
      settingsRepository: new SettingsRepository(database),
      notificationRepository,
      notificationCoordinator: new NotificationCoordinator(
        todoRepository,
        notificationRepository,
        new ExpoNotificationAdapter(),
      ),
      backupService: new BackupService(new BackupRepository(database)),
    };
  }, [database]);

  return <AppServicesContext value={services}>{children}</AppServicesContext>;
}

export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (services === null) {
    throw new Error('useAppServices must be used inside AppServicesProvider');
  }
  return services;
}
