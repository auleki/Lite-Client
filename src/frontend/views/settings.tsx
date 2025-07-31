import React, { useState, useEffect } from 'react';
import Styled from 'styled-components';

const SettingsView = (): JSX.Element => {
  const [ollamaPath, setOllamaPath] = useState<string>('');
  const [modelsPath, setModelsPath] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        // Load current settings
        const currentOllamaPath = await window.backendBridge.ollama.getOllamaPath();
        const currentModelsPath = await window.backendBridge.ollama.getModelsPath();

        setOllamaPath(currentOllamaPath || 'Default');
        setModelsPath(currentModelsPath || 'Default');
      } catch (error) {
        console.error('Failed to load settings:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const handleResetSettings = async () => {
    try {
      await window.backendBridge.ollama.resetSettings();
      // Reload settings
      const currentOllamaPath = await window.backendBridge.ollama.getOllamaPath();
      const currentModelsPath = await window.backendBridge.ollama.getModelsPath();

      setOllamaPath(currentOllamaPath || 'Default');
      setModelsPath(currentModelsPath || 'Default');
    } catch (error) {
      console.error('Failed to reset settings:', error);
    }
  };

  const handleClearCache = async () => {
    try {
      await window.backendBridge.ollama.clearRegistryCache();
      alert('Cache cleared successfully!');
    } catch (error) {
      console.error('Failed to clear cache:', error);
      alert('Failed to clear cache. Please try again.');
    }
  };

  if (isLoading) {
    return (
      <Settings.Layout>
        <Settings.LoadingSpinner />
        <Settings.LoadingText>Loading settings...</Settings.LoadingText>
      </Settings.Layout>
    );
  }

  return (
    <Settings.Layout>
      <Settings.Header>
        <Settings.Title>Settings</Settings.Title>
        <Settings.Subtitle>Configure your Morpheus experience</Settings.Subtitle>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>System Configuration</Settings.SectionTitle>

        <Settings.SettingRow>
          <Settings.SettingLabel>Ollama Path:</Settings.SettingLabel>
          <Settings.SettingValue>{ollamaPath}</Settings.SettingValue>
        </Settings.SettingRow>

        <Settings.SettingRow>
          <Settings.SettingLabel>Models Path:</Settings.SettingLabel>
          <Settings.SettingValue>{modelsPath}</Settings.SettingValue>
        </Settings.SettingRow>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Maintenance</Settings.SectionTitle>

        <Settings.ActionButton onClick={handleClearCache}>
          <Settings.ButtonIcon>🗑️</Settings.ButtonIcon>
          <Settings.ButtonText>Clear Registry Cache</Settings.ButtonText>
        </Settings.ActionButton>

        <Settings.ActionButton onClick={handleResetSettings}>
          <Settings.ButtonIcon>🔄</Settings.ButtonIcon>
          <Settings.ButtonText>Reset to Defaults</Settings.ButtonText>
        </Settings.ActionButton>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>About</Settings.SectionTitle>

        <Settings.InfoRow>
          <Settings.InfoLabel>Version:</Settings.InfoLabel>
          <Settings.InfoValue>0.0.6</Settings.InfoValue>
        </Settings.InfoRow>

        <Settings.InfoRow>
          <Settings.InfoLabel>Build:</Settings.InfoLabel>
          <Settings.InfoValue>Apple Silicon (ARM64)</Settings.InfoValue>
        </Settings.InfoRow>

        <Settings.InfoRow>
          <Settings.InfoLabel>Status:</Settings.InfoLabel>
          <Settings.InfoValue>✅ Notarized & Code Signed</Settings.InfoValue>
        </Settings.InfoRow>
      </Settings.Section>
    </Settings.Layout>
  );
};

const Settings = {
  Layout: Styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 30px;
    background: ${(props) => props.theme.colors.core};
    overflow-y: auto;
  `,
  Header: Styled.div`
    margin-bottom: 40px;
  `,
  Title: Styled.h1`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.bold};
    font-size: 2rem;
    margin: 0 0 10px 0;
  `,
  Subtitle: Styled.p`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.secondary.regular};
    font-size: 1.1rem;
    margin: 0;
  `,
  Section: Styled.div`
    margin-bottom: 30px;
    padding: 20px;
    background: ${(props) => props.theme.colors.hunter};
    border-radius: 15px;
  `,
  SectionTitle: Styled.h2`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.bold};
    font-size: 1.3rem;
    margin: 0 0 20px 0;
  `,
  SettingRow: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 15px;
    padding: 10px 0;
    border-bottom: 1px solid rgba(148, 163, 184, 0.1);
  `,
  SettingLabel: Styled.span`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 1rem;
  `,
  SettingValue: Styled.span`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.bold};
    font-size: 1rem;
  `,
  ActionButton: Styled.button`
    display: flex;
    align-items: center;
    width: 100%;
    padding: 15px;
    margin-bottom: 10px;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    border-radius: 10px;
    color: ${(props) => props.theme.colors.emerald};
    cursor: pointer;
    transition: all 0.3s ease;

    &:hover {
      background: rgba(16, 185, 129, 0.2);
      transform: translateY(-1px);
    }
  `,
  ButtonIcon: Styled.span`
    font-size: 1.2rem;
    margin-right: 10px;
  `,
  ButtonText: Styled.span`
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 1rem;
  `,
  InfoRow: Styled.div`
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
  `,
  InfoLabel: Styled.span`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 0.9rem;
  `,
  InfoValue: Styled.span`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.bold};
    font-size: 0.9rem;
  `,
  LoadingSpinner: Styled.div`
    width: 40px;
    height: 40px;
    border: 3px solid rgba(148, 163, 184, 0.2);
    border-top: 3px solid ${(props) => props.theme.colors.emerald};
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 20px;

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `,
  LoadingText: Styled.div`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 1rem;
    text-align: center;
  `,
};

export default SettingsView;
