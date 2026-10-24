import { mount } from 'svelte';
import './app.css';
import './themes/default.css';
import './themes/nord.css';
import './themes/solarized.css';
import './themes/catppuccin.css';
import './themes/tokyo-night.css';
import './themes/high-contrast.css';
import App from './App.svelte';

// Mount straight into <body> so the DOM matches the legacy dashboard (no wrapper element).
const app = mount(App, { target: document.body });

export default app;
