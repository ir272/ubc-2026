import { createRoot } from 'react-dom/client';
import { applyTheme } from './themes';
import './styles.css';
import './fx.css';
import { App } from './App';

applyTheme();
createRoot(document.getElementById('root')!).render(<App />);
