import { json } from 'react-router-dom';
import { ModelResponse } from './types';

export const parseResponse = (jsonString: string) => {
  // Assert the type of the parsed object.
  console.log('Raw response from AI:', jsonString);

  // Clean the response string - remove any leading/trailing whitespace
  const cleanedString = jsonString.trim();

  // Try to extract JSON from the response if it's not pure JSON
  const jsonStart = cleanedString.indexOf('{');
  const jsonEnd = cleanedString.lastIndexOf('}');

  let jsonToParse = cleanedString;
  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    jsonToParse = cleanedString.substring(jsonStart, jsonEnd + 1);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(jsonToParse);
  } catch (error) {
    console.error('Failed to parse JSON response:', error);
    console.error('Attempted to parse:', jsonToParse);
    return { response: 'error', action: {} };
  }

  if (isModelResponse(parsed)) {
    return { response: parsed.response, action: parsed.action };
  } else {
    console.error('Invalid ModelResponse format:', parsed);
    throw new Error('Invalid ModelResponse format');
  }
};

const isModelResponse = (object: any): object is ModelResponse => {
  return 'response' in object && 'action' in object;
};
