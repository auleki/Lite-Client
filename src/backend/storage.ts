import Store from 'electron-store';
import { InferenceConfig } from './types';

export type SchemaType = {
  modelsPath: string;
  inferenceConfig: InferenceConfig;
};

const store = new Store<SchemaType>({
  defaults: {
    modelsPath: '',
    inferenceConfig: {
      mode: 'local',
    },
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

export const clearStore = () => {
  store.clear();
};
