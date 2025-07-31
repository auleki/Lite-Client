// libs
import React, { FormEvent, useEffect, useState, useRef } from 'react';
import Styled from 'styled-components';
import { useSDK } from '@metamask/sdk-react';
import { ThreeDots } from 'react-loader-spinner';

// types and helpers
import { AIMessage } from '../types';
import { OllamaChannel } from './../../events';
import { useAIMessagesContext } from '../contexts';

import {
  isActionInitiated,
  handleBalanceRequest,
  handleTransactionRequest,
} from '../utils/transaction';
import { parseResponse } from '../utils/utils';
import { ActionParams } from '../utils/types';

const ChatView = (): React.JSX.Element => {
  const [selectedModel, setSelectedModel] = useState<string>('llama2');
  const [dialogueEntries, setDialogueEntries] = useAIMessagesContext();
  const [inputValue, setInputValue] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState<AIMessage>();
  const [isOllamaBeingPolled, setIsOllamaBeingPolled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { provider, account } = useSDK();

  const chatMainRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Load current model on component mount
  useEffect(() => {
    const loadCurrentModel = async () => {
      try {
        const model = await window.backendBridge.ollama.getCurrentModel();
        if (model?.name) {
          setSelectedModel(model.name);
        }
      } catch (error) {
        console.error('Failed to load current model:', error);
      }
    };

    loadCurrentModel();
  }, []);

  useEffect(() => {
    window.backendBridge.ollama.onAnswer((response) => {
      setDialogueEntries([
        ...dialogueEntries,
        { question: inputValue, answer: response.message.content, answered: true },
      ]);

      setInputValue('');
      setError(null);
      setIsLoading(false);
    });

    return () => {
      window.backendBridge.removeAllListeners(OllamaChannel.OllamaAnswer);
    };
  });

  // Scroll to bottom of chat when user adds new dialogue
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (chatMainRef.current && mutation.type === 'childList') {
          chatMainRef.current.scrollTop = chatMainRef.current.scrollHeight;
        }
      }
    });

    if (chatMainRef.current) {
      observer.observe(chatMainRef?.current, {
        childList: true, // observe direct children
      });
    }

    return () => observer.disconnect();
  }, []);

  // Refocus onto input field once new dialogue entry is added
  useEffect(() => {
    if (chatInputRef.current) {
      chatInputRef.current.focus();
    }
  }, [dialogueEntries]);

  //Function to update dialogue entries
  const updateDialogueEntries = (question: string, message: string) => {
    setCurrentQuestion(undefined);
    setDialogueEntries([
      ...dialogueEntries,
      { question: question, answer: message, answered: true },
    ]);
  };

  const checkGasCost = (balance: string, transaction: ActionParams): boolean => {
    // calculate the max gas cost in Wei (gasPrice * gas)
    // User's balance in ETH as a float string
    const balanceInEth = parseFloat(balance);
    // Convert balance to Wei
    const balanceInWei = BigInt(balanceInEth * 1e18); // 1 ETH = 10^18 Wei
    const fivePercentOfBalanceInWei = balanceInWei / BigInt(20); // Equivalent to 5%
    const gasCostInWei = BigInt(transaction.gasPrice) * BigInt(transaction.gas);
    return gasCostInWei > fivePercentOfBalanceInWei;
  };
  const processResponse = async (
    question: string,
    response: string,
    action: ActionParams | undefined,
  ) => {
    if (action == undefined) {
      action = {};
    }
    if (!isActionInitiated(action)) {
      updateDialogueEntries(question, response); //no additional logic in this case

      return;
    }

    // Sanity Checks:
    if (!account || !provider) {
      const errorMessage = `Error: Please connect to metamask`;
      updateDialogueEntries(question, errorMessage);

      return;
    }

    switch (action.type.toLowerCase()) {
      case 'balance': {
        let message: string;
        try {
          message = await handleBalanceRequest(provider, account);
        } catch (error) {
          message = `Error: Failed to retrieve a valid balance from Metamask, try reconnecting.`;
        }
        updateDialogueEntries(question, message);
        break;
      }

      case 'transfer': {
        try {
          const builtTx = await handleTransactionRequest(provider, action, account, question);
          console.log('from: ' + builtTx.params[0].from);
          //if gas is more than 5% of balance - check with user
          const balance = await handleBalanceRequest(provider, account);
          const isGasCostMoreThan5Percent = checkGasCost(balance, builtTx.params[0]);
          if (isGasCostMoreThan5Percent) {
            updateDialogueEntries(
              question,
              `Important: The gas cost is expensive relative to your balance please proceed with caution\n\n${response}`,
            );
          } else {
            updateDialogueEntries(question, response);
          }
          await provider?.request(builtTx);
        } catch (error) {
          const badTransactionMessage =
            'Error: There was an error sending your transaction, if the transaction type is balance or transfer please reconnect to metamask';
          updateDialogueEntries(question, badTransactionMessage);
        }
        break;
      }

      case 'address':
        updateDialogueEntries(question, account);
        break;

      default: {
        // If the transaction type is not recognized, we will not proceed with the transaction.
        const errorMessage = `Error: Invalid transaction type: ${action.type}`;
        updateDialogueEntries(question, errorMessage);
        break;
      }
    }
  };

  const handleQuestionAsked = async (question: string) => {
    if (!question.trim()) return;

    setError(null);
    setIsLoading(true);
    setIsOllamaBeingPolled(true);
    setCurrentQuestion({ question, answer: '', answered: false });

    try {
      const inference = await window.backendBridge.ollama.question({
        model: selectedModel,
        query: question,
      });

      if (inference) {
        const { response, action } = parseResponse(inference.message.content);

        if (response === 'error') {
          setError('Sorry, I had a problem with your request.');
          updateDialogueEntries(question, 'Sorry, I had a problem with your request.');
        } else {
          await processResponse(question, response, action);
        }
      }
    } catch (err) {
      setError('Failed to send message. Please try again.');
      setIsLoading(false);
      setIsOllamaBeingPolled(false);
      setCurrentQuestion(undefined);
    }
  };

  const handleQuestionChange = (e: FormEvent<HTMLInputElement>) => {
    setInputValue(e.currentTarget.value);
  };

  const handleRetry = () => {
    if (currentQuestion) {
      handleQuestionAsked(currentQuestion.question);
    }
  };

  return (
    <Chat.Layout>
      <Chat.Main ref={chatMainRef}>
        {dialogueEntries.length === 0 && (
          <Chat.WelcomeMessage>
            <Chat.WelcomeTitle>Welcome to Morpheus</Chat.WelcomeTitle>
            <Chat.WelcomeText>How can I help you today?</Chat.WelcomeText>
            <Chat.WelcomeHint>Try asking me anything - I'm here to help!</Chat.WelcomeHint>
          </Chat.WelcomeMessage>
        )}

        {dialogueEntries.map((entry, index) => {
          return (
            <Chat.MessageWrapper key={`dialogue-${index}`}>
              {entry.question && (
                <Chat.UserMessage>
                  <Chat.MessageContent isUser={true}>{entry.question}</Chat.MessageContent>
                </Chat.UserMessage>
              )}
              {entry.answer && (
                <Chat.AIMessage>
                  <Chat.MessageContent isUser={false}>{entry.answer}</Chat.MessageContent>
                </Chat.AIMessage>
              )}
            </Chat.MessageWrapper>
          );
        })}

        {currentQuestion && (
          <Chat.MessageWrapper>
            <Chat.UserMessage>
              <Chat.MessageContent isUser={true}>{currentQuestion.question}</Chat.MessageContent>
            </Chat.UserMessage>
            <Chat.AIMessage>
              <Chat.ThinkingIndicator>
                <Chat.PollingIndicator width="20" height="20" />
                <Chat.ThinkingText>Morpheus is thinking...</Chat.ThinkingText>
              </Chat.ThinkingIndicator>
            </Chat.AIMessage>
          </Chat.MessageWrapper>
        )}

        {error && (
          <Chat.ErrorMessage>
            <Chat.ErrorIcon>⚠️</Chat.ErrorIcon>
            <Chat.ErrorText>{error}</Chat.ErrorText>
            <Chat.RetryButton onClick={handleRetry}>Retry</Chat.RetryButton>
          </Chat.ErrorMessage>
        )}
      </Chat.Main>

      <Chat.InputContainer>
        <Chat.InputWrapper>
          <Chat.Input
            ref={chatInputRef}
            disabled={isOllamaBeingPolled}
            value={inputValue}
            onChange={handleQuestionChange}
            placeholder={isOllamaBeingPolled ? 'Morpheus is thinking...' : 'Message Morpheus...'}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleQuestionAsked(inputValue);
              }
            }}
          />
          <Chat.SendButton
            disabled={isOllamaBeingPolled || !inputValue.trim()}
            onClick={() => handleQuestionAsked(inputValue)}
          >
            <Chat.SendIcon>→</Chat.SendIcon>
          </Chat.SendButton>
        </Chat.InputWrapper>

        {isLoading && (
          <Chat.LoadingIndicator>
            <Chat.LoadingText>Processing your request...</Chat.LoadingText>
          </Chat.LoadingIndicator>
        )}
      </Chat.InputContainer>
    </Chat.Layout>
  );
};

const Chat = {
  Layout: Styled.div`
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    background: ${(props) => props.theme.colors.core};
  `,
  Main: Styled.div`
    display: flex;
    width: 100%;
    flex: 1;
    flex-direction: column;
    padding: 20px;
    overflow-y: auto;
    max-width: 800px;
    margin: 0 auto;
  `,
  WelcomeMessage: Styled.div`
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    text-align: center;
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.medium};
  `,
  WelcomeIcon: Styled.span`
    font-size: 60px;
    margin-bottom: 20px;
  `,
  WelcomeTitle: Styled.h2`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.bold};
    font-size: 2rem;
    margin-bottom: 10px;
  `,
  WelcomeText: Styled.p`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 1.1rem;
    margin: 0;
    opacity: 0.8;
  `,
  WelcomeHint: Styled.p`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 0.9rem;
    margin-top: 10px;
    opacity: 0.7;
  `,
  MessageWrapper: Styled.div`
    display: flex;
    flex-direction: column;
    margin-bottom: 20px;
  `,
  UserMessage: Styled.div`
    display: flex;
    justify-content: flex-end;
    margin-bottom: 10px;
  `,
  AIMessage: Styled.div`
    display: flex;
    justify-content: flex-start;
    margin-bottom: 10px;
  `,
  MessageContent: Styled.div<{ isUser?: boolean }>`
    display: inline-block;
    padding: 12px 16px;
    border-radius: 18px;
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
    word-wrap: break-word;
    max-width: 70%;
    line-height: 1.4;
    background: ${(props) => (props.isUser ? props.theme.colors.emerald : props.theme.colors.hunter)};
    color: ${(props) => (props.isUser ? props.theme.colors.core : props.theme.colors.notice)};
  `,
  ThinkingIndicator: Styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 16px;
    background: ${(props) => props.theme.colors.hunter};
    border-radius: 18px;
    color: ${(props) => props.theme.colors.notice};
  `,
  ThinkingText: Styled.span`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.small};
  `,
  PollingIndicator: Styled(ThreeDots)`
    display: flex;
  `,
  ErrorMessage: Styled.div`
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 15px 20px;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 15px;
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.medium};
    margin: 20px auto;
    max-width: 80%;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  `,
  ErrorIcon: Styled.span`
    font-size: 24px;
  `,
  ErrorText: Styled.span`
    flex: 1;
  `,
  RetryButton: Styled.button`
    background: ${(props) => props.theme.colors.emerald};
    color: white;
    padding: 8px 15px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.medium};
    transition: background 0.2s ease;

    &:hover {
      background: ${(props) => props.theme.colors.hunter};
    }
  `,
  LoadingIndicator: Styled.div`
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: ${(props) => props.theme.colors.hunter};
    border-radius: 15px;
    margin: 20px auto;
    max-width: 80%;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
  `,
  LoadingText: Styled.span`
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.medium};
  `,
  InputContainer: Styled.div`
    display: flex;
    flex-direction: column;
    padding: 20px;
    background: ${(props) => props.theme.colors.core};
    border-top: 1px solid ${(props) => props.theme.colors.hunter};
    gap: 15px;
  `,
  InputWrapper: Styled.div`
    display: flex;
    align-items: center;
    max-width: 800px;
    margin: 0 auto;
    width: 100%;
    position: relative;
  `,
  Input: Styled.input`
    display: flex;
    width: 100%;
    height: 50px;
    border-radius: 25px;
    padding: 0 60px 0 20px;
    background: ${(props) => props.theme.colors.hunter};
    border: 2px solid ${(props) => props.theme.colors.hunter};
    color: ${(props) => props.theme.colors.notice};
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: ${(props) => props.theme.fonts.size.medium};
    outline: none;
    transition: border-color 0.2s ease;

    &:focus {
      border-color: ${(props) => props.theme.colors.emerald};
    }

    &::placeholder {
      color: ${(props) => props.theme.colors.notice};
      opacity: 0.6;
    }
  `,
  SendButton: Styled.button`
    display: flex;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: ${(props) => props.theme.colors.emerald};
    position: absolute;
    right: 5px;
    cursor: ${(props) => (props.disabled ? 'not-allowed' : 'pointer')};
    border: none;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;

    &:hover {
      background: ${(props) => (props.disabled ? props.theme.colors.emerald : props.theme.colors.hunter)};
      transform: ${(props) => (props.disabled ? 'none' : 'scale(1.05)')};
    }
  `,
  SendIcon: Styled.span`
    display: flex;
    color: white;
    font-family: ${(props) => props.theme.fonts.family.primary.regular};
    font-size: 1.2rem;
    font-weight: bold;
  `,
};

export default ChatView;
