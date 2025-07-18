import React from 'react';
import RegistryModels from '../components/registry-models';

const RegistryView: React.FC = (): JSX.Element => {
  const handleModelPull = async (modelName: string) => {
    try {
      // Use the existing getModel handler to pull the model
      await window.backendBridge.ollama.getModel(modelName);
      console.log(`Successfully pulled model: ${modelName}`);
    } catch (error) {
      console.error(`Failed to pull model ${modelName}:`, error);
    }
  };

  return <RegistryModels onModelPull={handleModelPull} />;
};

export default RegistryView;
