import React from 'react';
import './App.css';
import CommandPrompt from './CommandPrompt';

function App() {
  const promptText = '$ ';

  return (
    <div>
      <CommandPrompt promptText={ promptText }/>
    </div>
  );
}

export default App;
