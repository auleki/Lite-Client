import Store from 'electron-store';
import { InferenceConfig } from './types';

export type SchemaType = {
  modelsPath: string;
  inferenceConfig: InferenceConfig;
  lastUsedLocalModel?: string;
};

const store = new Store<SchemaType>({
  defaults: {
    modelsPath: '',
    inferenceConfig: {
      mode: 'local',
    },
    lastUsedLocalModel: 'orca-mini:latest',
  },
});

export const saveModelPathToStorage = (path: string) => {
  store.set('modelsPath', path);
};

export const getModelPathFromStorage = () => {
  return store.get('modelsPath');
};

export const saveInferenceConfigToStorage = (config: InferenceConfig) => {
  store.set('inferenceConfig', config);
};

export const getInferenceConfigFromStorage = (): InferenceConfig => {
  return store.get('inferenceConfig');
};

export const saveLastUsedLocalModelToStorage = (model: string) => {
  store.set('lastUsedLocalModel', model);
};

export const getLastUsedLocalModelFromStorage = (): string => {
  return store.get('lastUsedLocalModel') || 'orca-mini:latest';
};

export const clearStore = () => {
  store.clear();
};
