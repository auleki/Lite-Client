import React, { useState } from 'react';
import RegistryModels from '../components/registry-models';

const RegistryView: React.FC = (): JSX.Element => {
  const [isPulling, setIsPulling] = useState<string | null>(null);

  const handleModelPull = async (modelName: string) => {
    setIsPulling(modelName);
    try {
      console.log(`Starting to pull model: ${modelName}`);

      // Use the existing getModel handler to pull the model
      const result = await window.backendBridge.ollama.getModel(modelName);

      console.log(`Successfully pulled model: ${modelName}`, result);

      // Show success feedback (you could add a toast notification here)
      alert(`Successfully pulled model: ${modelName}`);
    } catch (error) {
      console.error(`Failed to pull model ${modelName}:`, error);

      // Show error feedback
      alert(`Failed to pull model ${modelName}: ${error}`);
    } finally {
      setIsPulling(null);
    }
  };

  const handleCancelPull = () => {
    setIsPulling(null);
    console.log('Pull operation cancelled');
  };

  return (
    <RegistryModels
      onModelPull={handleModelPull}
      isPulling={isPulling}
      onCancelPull={handleCancelPull}
    />
  );
};

export default RegistryView;
