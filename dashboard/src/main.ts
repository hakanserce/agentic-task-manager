import { mount } from 'svelte';
import './app.css';
import App from './App.svelte';

// Mount straight into <body> so the DOM matches the legacy dashboard (no wrapper element).
const app = mount(App, { target: document.body });

export default app;
