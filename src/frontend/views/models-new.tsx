import React, { useState, useEffect } from 'react';
import styled, { useTheme } from 'styled-components';

// Types for our models
interface LocalModel {
  name: string;
  size: number;
  modified_at: string;
}

interface CommunityModel {
  model_identifier: string;
  model_name: string;
  description: string;
  pulls: number;
  tags: number;
  url: string;
}

interface RemoteModel {
  id: string;
  name: string;
  description: string;
  isFavorite?: boolean;
}

const ModelsView: React.FC = () => {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<'local' | 'remote'>('local');
  const [localModels, setLocalModels] = useState<LocalModel[]>([]);
  const [communityModels, setCommunityModels] = useState<CommunityModel[]>([]);
  const [remoteModels, setRemoteModels] = useState<RemoteModel[]>([]);
  const [loading, setLoading] = useState(false);

  // Load data when tab changes
  useEffect(() => {
    loadTabData();
  }, [activeTab]);

  const loadTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'local') {
        // Load downloaded models
        const localResponse = await window.backendBridge.ollama.getAllModels();
        setLocalModels(localResponse.models || []);

        // Load community models
        const communityResponse =
          await window.backendBridge.ollama.getAvailableModelsFromRegistry();
        setCommunityModels(communityResponse || []);
      } else {
        // Load remote models
        const remoteResponse = await window.backendBridge.morpheus.getModels();
        setRemoteModels(remoteResponse || []);
      }
    } catch (error) {
      console.error('Failed to load models:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (modelName: string) => {
    try {
      await window.backendBridge.ollama.getModel(modelName);
      // Refresh local models
      if (activeTab === 'local') {
        loadTabData();
      }
    } catch (error) {
      console.error('Failed to download model:', error);
    }
  };

  const handleDelete = async (modelName: string) => {
    if (confirm(`Are you sure you want to delete ${modelName}?`)) {
      try {
        await window.backendBridge.ollama.deleteModel(modelName);
        // Refresh local models
        loadTabData();
      } catch (error) {
        console.error('Failed to delete model:', error);
      }
    }
  };

  const handleToggleFavorite = (modelId: string) => {
    // TODO: Implement favorites in local storage
    console.log('Toggle favorite for:', modelId);
  };

  return (
    <Container theme={theme}>
      <Header theme={theme}>
        <Title theme={theme}>Models</Title>
        <TabContainer theme={theme}>
          <Tab theme={theme} active={activeTab === 'local'} onClick={() => setActiveTab('local')}>
            Local Mode
          </Tab>
          <Tab theme={theme} active={activeTab === 'remote'} onClick={() => setActiveTab('remote')}>
            Remote Mode
          </Tab>
        </TabContainer>
      </Header>

      <Content theme={theme}>
        {loading ? (
          <LoadingMessage theme={theme}>Loading models...</LoadingMessage>
        ) : (
          <>
            {activeTab === 'local' ? (
              <LocalTabContent
                localModels={localModels}
                communityModels={communityModels}
                onDownload={handleDownload}
                onDelete={handleDelete}
                theme={theme}
              />
            ) : (
              <RemoteTabContent
                remoteModels={remoteModels}
                onToggleFavorite={handleToggleFavorite}
                theme={theme}
              />
            )}
          </>
        )}
      </Content>
    </Container>
  );
};

// Local Tab Component
const LocalTabContent: React.FC<{
  localModels: LocalModel[];
  communityModels: CommunityModel[];
  onDownload: (modelName: string) => void;
  onDelete: (modelName: string) => void;
  theme: any;
}> = ({ localModels, communityModels, onDownload, onDelete, theme }) => (
  <LocalContainer theme={theme}>
    <Section theme={theme}>
      <SectionTitle theme={theme}>Downloaded Models</SectionTitle>
      <ModelList theme={theme}>
        {localModels.map((model) => (
          <ModelItem key={model.name} theme={theme}>
            <ModelInfo theme={theme}>
              <ModelName theme={theme}>{model.name}</ModelName>
              <ModelMeta theme={theme}>
                Size: {(model.size / (1024 * 1024 * 1024)).toFixed(1)}GB
              </ModelMeta>
            </ModelInfo>
            <ActionButton theme={theme} variant="delete" onClick={() => onDelete(model.name)}>
              Delete
            </ActionButton>
          </ModelItem>
        ))}
        {localModels.length === 0 && (
          <EmptyMessage theme={theme}>No models downloaded</EmptyMessage>
        )}
      </ModelList>
    </Section>

    <Section theme={theme}>
      <SectionTitle theme={theme}>Available Models</SectionTitle>
      <ModelList theme={theme}>
        {communityModels.map((model) => (
          <ModelItem key={model.model_identifier} theme={theme}>
            <ModelInfo theme={theme}>
              <ModelName theme={theme}>{model.model_name}</ModelName>
              <ModelMeta theme={theme}>{model.pulls?.toLocaleString()} downloads</ModelMeta>
            </ModelInfo>
            <ActionButton
              theme={theme}
              variant="download"
              onClick={() => onDownload(model.model_identifier)}
            >
              Download
            </ActionButton>
          </ModelItem>
        ))}
        {communityModels.length === 0 && (
          <EmptyMessage theme={theme}>No models available</EmptyMessage>
        )}
      </ModelList>
    </Section>
  </LocalContainer>
);

// Remote Tab Component
const RemoteTabContent: React.FC<{
  remoteModels: RemoteModel[];
  onToggleFavorite: (modelId: string) => void;
  theme: any;
}> = ({ remoteModels, onToggleFavorite, theme }) => (
  <Section theme={theme}>
    <SectionTitle theme={theme}>Morpheus API Models</SectionTitle>
    <ModelList theme={theme}>
      {remoteModels.map((model) => (
        <ModelItem key={model.id} theme={theme}>
          <ModelInfo theme={theme}>
            <ModelName theme={theme}>{model.name}</ModelName>
            <ModelMeta theme={theme}>{model.description}</ModelMeta>
          </ModelInfo>
          <ActionButton
            theme={theme}
            variant={model.isFavorite ? 'favorited' : 'favorite'}
            onClick={() => onToggleFavorite(model.id)}
          >
            {model.isFavorite ? 'Unfavorite' : 'Favorite'}
          </ActionButton>
        </ModelItem>
      ))}
      {remoteModels.length === 0 && (
        <EmptyMessage theme={theme}>No remote models available</EmptyMessage>
      )}
    </ModelList>
  </Section>
);

// Styled Components
const Container = styled.div<{ theme: any }>`
  padding: 20px;
  background: ${(props) => props.theme.colors.background};
  color: ${(props) => props.theme.colors.text};
  min-height: 100vh;
`;

const Header = styled.div<{ theme: any }>`
  margin-bottom: 30px;
`;

const Title = styled.h1<{ theme: any }>`
  color: ${(props) => props.theme.colors.emerald};
  margin: 0 0 20px 0;
  font-size: 24px;
  font-weight: 600;
`;

const TabContainer = styled.div<{ theme: any }>`
  display: flex;
  gap: 10px;
`;

const Tab = styled.button<{ theme: any; active: boolean }>`
  padding: 12px 24px;
  background: ${(props) => (props.active ? props.theme.colors.emerald : 'transparent')};
  color: ${(props) => (props.active ? props.theme.colors.background : props.theme.colors.emerald)};
  border: 2px solid ${(props) => props.theme.colors.emerald};
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.2s ease;

  &:hover {
    background: ${(props) =>
      props.active ? props.theme.colors.emerald : props.theme.colors.emerald + '20'};
  }
`;

const Content = styled.div<{ theme: any }>`
  background: ${(props) => props.theme.colors.surface};
  border-radius: 12px;
  padding: 20px;
`;

const LocalContainer = styled.div<{ theme: any }>`
  display: flex;
  flex-direction: column;
  gap: 30px;
`;

const Section = styled.div<{ theme: any }>`
  margin-bottom: 20px;
`;

const SectionTitle = styled.h2<{ theme: any }>`
  color: ${(props) => props.theme.colors.emerald};
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 15px 0;
`;

const ModelList = styled.div<{ theme: any }>`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const ModelItem = styled.div<{ theme: any }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  background: ${(props) => props.theme.colors.background};
  border-radius: 8px;
  border: 1px solid ${(props) => props.theme.colors.border};
`;

const ModelInfo = styled.div<{ theme: any }>`
  flex: 1;
`;

const ModelName = styled.div<{ theme: any }>`
  color: ${(props) => props.theme.colors.text};
  font-weight: 500;
  margin-bottom: 4px;
`;

const ModelMeta = styled.div<{ theme: any }>`
  color: ${(props) => props.theme.colors.textSecondary};
  font-size: 12px;
`;

const ActionButton = styled.button<{ theme: any; variant: string }>`
  padding: 8px 16px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;

  ${(props) => {
    switch (props.variant) {
      case 'download':
        return `
          background: ${props.theme.colors.emerald};
          color: ${props.theme.colors.background};
          &:hover { background: ${props.theme.colors.emerald}dd; }
        `;
      case 'delete':
        return `
          background: ${props.theme.colors.error || '#ff4444'};
          color: white;
          &:hover { background: ${props.theme.colors.error || '#ff4444'}dd; }
        `;
      case 'favorite':
        return `
          background: transparent;
          color: ${props.theme.colors.emerald};
          border: 1px solid ${props.theme.colors.emerald};
          &:hover { background: ${props.theme.colors.emerald}20; }
        `;
      case 'favorited':
        return `
          background: ${props.theme.colors.emerald};
          color: ${props.theme.colors.background};
          &:hover { background: ${props.theme.colors.emerald}dd; }
        `;
      default:
        return '';
    }
  }}
`;

const LoadingMessage = styled.div<{ theme: any }>`
  text-align: center;
  color: ${(props) => props.theme.colors.textSecondary};
  padding: 40px;
`;

const EmptyMessage = styled.div<{ theme: any }>`
  text-align: center;
  color: ${(props) => props.theme.colors.textSecondary};
  padding: 20px;
  font-style: italic;
`;

export default ModelsView;
