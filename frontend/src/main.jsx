/**
 * Vite + React entry. Loads Tailwind base + overrides, Ant Design ConfigProvider, then App.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import 'antd/dist/reset.css';
import './index.css';
import './ant-overrides.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter } from 'react-router-dom';

const antTheme = {
  token: {
    colorPrimary: '#007bff',
    colorPrimaryHover: '#0056b3',
    borderRadius: 8,
  },
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <ConfigProvider theme={antTheme}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>
);

reportWebVitals();
