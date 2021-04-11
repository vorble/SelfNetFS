import React, {
  useEffect,
  useState,
  useRef,
} from 'react';

const HISTORY_MAX = 1000;

interface ReadlineProps {
  onSubmit?: (line: string) => any;
}

const Readline: React.FC<ReadlineProps> = (props) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [buffers, setBuffers] = useState<Array<string>>(['']);
  const [bufferIndex, setBufferIndex] = useState<number>(0);
  const [history, setHistory] = useState<Array<string>>([]);

  // gotoEndSignal: set to true with setGotoEndSignal(true) when the user navigates up
  // or down in the history to have the input cursor go to the end of the line.
  const [gotoEndSignal, setGotoEndSignal] = useState<boolean>(false);
  useEffect(() => {
    if (gotoEndSignal && inputRef.current) {
      const end = inputRef.current.value.length;
      inputRef.current.setSelectionRange(end, end);
      setGotoEndSignal(false);
    }
  }, [gotoEndSignal])

  function up() {
    if (bufferIndex > 0) {
      setBufferIndex(bufferIndex - 1);
      setGotoEndSignal(true);
    }
  }

  function down() {
    if (bufferIndex < buffers.length - 1) {
      setBufferIndex(bufferIndex + 1);
      setGotoEndSignal(true);
    }
  }

  function submit() {
    const line = buffers[bufferIndex];
    // Keep the line in history if it's not blank and if it's not the same as the previous line.
    const keepLine = !/^\s*$/.test(line) && (history.length === 0 || history[history.length - 1] !== line);
    // Keep at most HISTORY_MAX items in the history.
    const newHistory = history.slice(history.length - HISTORY_MAX + (keepLine ? 1 : 0));
    if (keepLine) {
      newHistory.push(line);
    }
    const newBuffers = [...newHistory, ''];
    const newBufferIndex = newBuffers.length - 1;
    setBuffers(newBuffers);
    setBufferIndex(newBufferIndex);
    setHistory(newHistory);
    if (props.onSubmit) {
      props.onSubmit(line);
    }
  }

  function cancel() {
    const newBuffers = [...history, ''];
    const newBufferIndex = newBuffers.length - 1;
    setBuffers(newBuffers);
    setBufferIndex(newBufferIndex);
  }

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newBuffers = [...buffers];
    newBuffers[bufferIndex] = e.target.value;
    setBuffers(newBuffers);
  };

  const onKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Enter':
        submit();
        break;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'Tab':
        e.preventDefault();
        // Tab completion logic can go here.
        break;
      case 'ArrowUp':
        e.preventDefault();
        up();
        break;
      case 'ArrowDown':
        e.preventDefault();
        down();
        break;
      case 'c':
      case 'C':
        if (e.ctrlKey) {
          e.preventDefault();
          cancel();
        }
        break;
    }
  };

  return (
    <div>
      <input
        ref={ inputRef }
        value={ buffers[bufferIndex] }
        onChange={ onChange }
        onKeyPress={ onKeyPress }
        onKeyDown={ onKeyDown }
      />
    </div>
  );
};

export default Readline;
