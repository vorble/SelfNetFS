import React, {
  useEffect,
  useState,
  useRef,
} from 'react';
import Readline from './Readline';
import './CommandPrompt.css';

interface CommandPromptProps {
  promptText: string;
  onSubmit?: (line: string) => any;
}

const CommandPrompt: React.FC<CommandPromptProps> = (props) => {
  return (
    <div className="command-prompt">
      <span>{ props.promptText }</span>
      <Readline onSubmit={ props.onSubmit } />
    </div>
  );
};

export default CommandPrompt;
