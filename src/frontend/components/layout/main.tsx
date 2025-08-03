// libs
import React, { useEffect, useState } from 'react';
import Styled from 'styled-components';
import { useNavigate, useLocation } from 'react-router-dom';

// layout components
import TopBar from './top-bar';
// import BottomBar from './bottom-bar';

// components
import InferenceModeButton from '../buttons/inference-mode-button';

// types
import { InferenceMode } from '../../renderer';

// router
import { MainRouter } from '../../router';

export default () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [currentModel, setCurrentModel] = useState<string | null>(null);

  // Add inference mode state
  const [inferenceMode, setInferenceMode] = useState<InferenceMode>('local');

  useEffect(() => {
    const loadCurrentModel = async () => {
      try {
        // First try to get the "current" model (loaded model)
        const currentModel = await window.backendBridge.ollama.getCurrentModel();
        console.log('Current model:', currentModel);

        if (currentModel?.name) {
          setCurrentModel(currentModel.name);
        } else {
          // If no current model, check for last used model first
          let preferredModel = 'orca-mini:latest';
          try {
            const lastUsedModel = await window.backendBridge.ollama.getLastUsedLocalModel();
            if (lastUsedModel) {
              preferredModel = lastUsedModel;
            }
          } catch (error) {
            console.warn('Could not get last used model, using default:', error);
          }

          const allModels = await window.backendBridge.ollama.getAllModels();
          console.log('All available models:', allModels);

          if (allModels?.models && allModels.models.length > 0) {
            const preferredModelObj = allModels.models.find((m) => m.name === preferredModel);

            if (preferredModelObj) {
              // Preferred model is available, use it
              setCurrentModel(`${preferredModel} (preferred)`);
            } else if (preferredModel !== 'orca-mini:latest') {
              // Preferred model not available, try orca-mini:latest
              const orcaMini = allModels.models.find((m) => m.name === 'orca-mini:latest');
              if (orcaMini) {
                setCurrentModel('orca-mini:latest (default)');
              } else {
                // Neither preferred nor orca-mini available, download orca-mini
                console.log('orca-mini:latest not found, downloading...');
                setCurrentModel('Downloading orca-mini:latest...');

                try {
                  await window.backendBridge.ollama.getModel('orca-mini:latest');
                  setCurrentModel('orca-mini:latest (default)');
                  console.log('orca-mini:latest downloaded successfully');
                } catch (downloadError) {
                  console.error('Failed to download orca-mini:latest:', downloadError);
                  // Fallback to first available model
                  const fallbackModel = allModels.models[0];
                  setCurrentModel(`${fallbackModel.name} (fallback)`);
                }
              }
            } else {
              // orca-mini:latest not available, download it
              console.log('orca-mini:latest not found, downloading...');
              setCurrentModel('Downloading orca-mini:latest...');

              try {
                await window.backendBridge.ollama.getModel('orca-mini:latest');
                setCurrentModel('orca-mini:latest (default)');
                console.log('orca-mini:latest downloaded successfully');
              } catch (downloadError) {
                console.error('Failed to download orca-mini:latest:', downloadError);
                // Fallback to first available model
                const fallbackModel = allModels.models[0];
                setCurrentModel(`${fallbackModel.name} (fallback)`);
              }
            }
          } else {
            setCurrentModel(null);
          }
        }
      } catch (error) {
        console.error('Failed to load current model:', error);
        setCurrentModel(null);
      }
    };

    // Load inference mode
    const loadInferenceMode = async () => {
      try {
        const mode = await window.backendBridge.inference.getMode();
        setInferenceMode(mode);
      } catch (error) {
        console.error('Failed to load inference mode:', error);
      }
    };

    loadCurrentModel();
    loadInferenceMode();
  }, []);

  const handleNewChat = () => {
    navigate('/chat');
  };

  const handleModels = () => {
    navigate('/registry');
  };

  const handleSettings = () => {
    navigate('/settings');
  };

  // Add inference mode toggle handler
  const handleInferenceModeToggle = async () => {
    const newMode: InferenceMode = inferenceMode === 'local' ? 'remote' : 'local';

    try {
      await window.backendBridge.inference.setMode(newMode);
      setInferenceMode(newMode);
    } catch (error) {
      console.error('Failed to update inference mode:', error);
      alert('Failed to update inference mode. Please ensure Ollama is running for local mode.');
    }
  };

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  return (
    <Main.Layout>
      <Main.Sidebar>
        <Main.SidebarContent>
          <Main.SidebarHeader>
            <Main.AppTitle>Morpheus</Main.AppTitle>
            <Main.AppSubtitle>Private AI</Main.AppSubtitle>
          </Main.SidebarHeader>

          <Main.SidebarActions>
            <Main.ActionButton onClick={handleNewChat} $active={isActive('/chat')}>
              <Main.ActionIcon>💬</Main.ActionIcon>
              <Main.ActionText>New Chat</Main.ActionText>
            </Main.ActionButton>

            <Main.ActionButton onClick={handleModels} $active={isActive('/registry')}>
              <Main.ActionIcon>📦</Main.ActionIcon>
              <Main.ActionText>Models</Main.ActionText>
            </Main.ActionButton>

            <Main.ActionButton onClick={handleSettings} $active={isActive('/settings')}>
              <Main.ActionIcon>⚙️</Main.ActionIcon>
              <Main.ActionText>Settings</Main.ActionText>
            </Main.ActionButton>
          </Main.SidebarActions>

          <Main.SidebarFooter>
            {/* Add inference toggle here */}
            <Main.InferenceToggleSection>
              <Main.InferenceToggleLabel>Inference Mode</Main.InferenceToggleLabel>
              <Main.InferenceToggleWrapper>
                <InferenceModeButton
                  currentMode={inferenceMode}
                  onToggle={handleInferenceModeToggle}
                  disabled={false}
                  compact={false}
                />
              </Main.InferenceToggleWrapper>
              <Main.InferenceModeIndicator $mode={inferenceMode}>
                {inferenceMode === 'local' ? '🏠 Private & Local' : '☁️ Cloud Processing'}
              </Main.InferenceModeIndicator>
            </Main.InferenceToggleSection>

            <Main.StatusIndicator>
              <Main.StatusDot />
              <Main.StatusText>Ollama Connected</Main.StatusText>
            </Main.StatusIndicator>
            {currentModel && (
              <Main.ModelIndicator>
                <Main.ModelIcon>🎯</Main.ModelIcon>
                <Main.ModelText>{currentModel}</Main.ModelText>
              </Main.ModelIndicator>
            )}
          </Main.SidebarFooter>
        </Main.SidebarContent>
      </Main.Sidebar>

      <Main.ContentArea>
        <Main.TopWrapper>
          <TopBar />
        </Main.TopWrapper>
        <Main.MainWrapper>
          <MainRouter />
        </Main.MainWrapper>
      </Main.ContentArea>
    </Main.Layout>
  );
};

const Main = {
  Layout: Styled.div`
    display: flex;
    width: 100%;
    height: 100%;
    background: ${(props) => props.theme.colors.core};
  `,
  Sidebar: Styled.div`
    display: flex;
    width: 280px;
    background: ${(props) => props.theme.colors.hunter};
    border-right: 1px solid ${(props) => props.theme.colors.hunter};
    flex-shrink: 0;
    height: 100vh;
  `,
  SidebarContent: Styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: 20px;
  `,
  SidebarHeader: Styled.div`
    margin-bottom: 30px;
    text-align: center;
  `,
  AppTitle: Styled.h1`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.bold};
    font-size: 1.8rem;
    margin: 0 0 5px 0;
  `,
  AppSubtitle: Styled.p`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.secondary.regular};
    font-size: 0.9rem;
    margin: 0;
    opacity: 0.8;
  `,
  SidebarActions: Styled.div`
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: auto;
  `,
  ActionButton: Styled.button<{ $active: boolean }>`
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: ${(props) => (props.$active ? props.theme.colors.emerald : 'transparent')};
    border: none;
    border-radius: 8px;
    color: ${(props) => (props.$active ? props.theme.colors.core : props.theme.colors.notice)};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 0.95rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: left;

    &:hover {
      background: ${(props) => props.theme.colors.emerald};
      color: ${(props) => props.theme.colors.core};
    }
  `,
  ActionIcon: Styled.span`
    font-size: 1.1rem;
  `,
  ActionText: Styled.span`
    font-weight: 500;
  `,
  SidebarFooter: Styled.div`
    margin-top: auto;
    padding-top: 20px;
    border-top: 1px solid ${(props) => props.theme.colors.hunter};
  `,

  // Add new inference toggle styles
  InferenceToggleSection: Styled.div`
    margin-bottom: 16px;
    padding: 16px;
    background: rgba(0, 0, 0, 0.1);
    border-radius: 10px;
    border: 1px solid rgba(148, 163, 184, 0.2);
  `,

  InferenceToggleLabel: Styled.div`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 0.8rem;
    font-weight: 500;
    margin-bottom: 8px;
    text-align: center;
    opacity: 0.8;
  `,

  InferenceToggleWrapper: Styled.div`
    display: flex;
    justify-content: center;
    margin-bottom: 8px;
  `,

  InferenceModeIndicator: Styled.div<{ $mode: InferenceMode }>`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 8px;
    border-radius: 12px;
    background: ${({ $mode }) =>
      $mode === 'remote' ? 'rgba(74, 144, 226, 0.15)' : 'rgba(23, 156, 101, 0.15)'};
    border: 1px solid ${({ $mode }) =>
      $mode === 'remote' ? 'rgba(74, 144, 226, 0.3)' : 'rgba(23, 156, 101, 0.3)'};
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 0.75rem;
    font-weight: 500;
    text-align: center;
  `,

  StatusIndicator: Styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: ${(props) => props.theme.colors.emerald};
    border-radius: 6px;
  `,
  StatusDot: Styled.div`
    width: 8px;
    height: 8px;
    background: white;
    border-radius: 50%;
  `,
  StatusText: Styled.span`
    color: white;
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 0.8rem;
    font-weight: 500;
  `,
  ModelIndicator: Styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    margin-top: 8px;
    background: ${(props) => props.theme.colors.hunter};
    border: 1px solid ${(props) => props.theme.colors.emerald};
    border-radius: 6px;
  `,
  ModelIcon: Styled.span`
    font-size: 0.9rem;
  `,
  ModelText: Styled.span`
    color: ${(props) => props.theme.colors.emerald};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 0.8rem;
    font-weight: 500;
  `,
  ContentArea: Styled.div`
    display: flex;
    flex-direction: column;
    flex: 1;
    background: ${(props) => props.theme.colors.core};
    height: 100vh;
  `,
  TopWrapper: Styled.div`
    display: flex;
    width: 100%;
    height: ${(props) => props.theme.layout.topBarHeight}px;
    flex-shrink: 0;
  `,
  MainWrapper: Styled.div`
    display: flex;
    flex: 1;
    background: ${(props) => props.theme.colors.core};
    overflow: hidden;
    height: calc(100vh - ${(props) => props.theme.layout.topBarHeight}px);
  `,
};
