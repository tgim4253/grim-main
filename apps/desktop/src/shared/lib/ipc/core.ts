import { invoke } from '@tauri-apps/api/core';
import { convertKeysToCamel } from '../object';

export const invokeCamel = async <T>(
  command: string,
  payload?: Record<string, unknown>,
): Promise<T> => {
  const response = await invoke(command, payload);
  return convertKeysToCamel(response) as T;
};

export const invokeRaw = (command: string, payload?: Record<string, unknown>) =>
  invoke(command, payload);
