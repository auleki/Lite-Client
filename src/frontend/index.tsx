// libs
import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';

// components
import Main from './components/layout/main';
import AppInit from './components/layout/app-init';
// import ChooseDirectoryModalComponent from './components/modals/choose-directory-modal';

// providers
import ThemeProvider from './theme/theme-provider';
import { AIMessagesProvider } from './contexts';
// import { MetaMaskProvider } from '@metamask/sdk-react';

// modals
// import QrCodeModal from './components/modals/qr-code-modal';

// styles
import GlobalStyle from './theme/index';

// constants
// import { LOGO_METAMASK_BASE64 } from './constants';

// utils
// import { updateQrCode } from './utils/utils';

// events
// import { IpcChannel } from '../events';

// root
const rootElement = document.querySelector('#root') as Element;
const root = createRoot(rootElement);

const AppRoot = () => {
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    handleOllamaInit();
  }, []);

  const handleOllamaInit = async () => {
    const ollamaInit = await window.backendBridge.ollama.init();

    if (ollamaInit) {
      const model = await window.backendBridge.ollama.getModel('llama2');

      if (model) {
        setIsInitialized(true);

        return;
      } else {
        console.error(`Something went wrong with pulling model ${'llama2'}`);
      }
    }

    console.error(`Couldn't initialize Ollama correctly.`);
  };

  return (
    <React.StrictMode>
      <ThemeProvider>
        <AIMessagesProvider>
          {!isInitialized && <AppInit />}
          {isInitialized && <Main />}
        </AIMessagesProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
};

root.render(
  <HashRouter>
    <GlobalStyle />
    <AppRoot />
  </HashRouter>,
);
