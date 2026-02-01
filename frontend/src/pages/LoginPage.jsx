/**
 * Login page using Ant Design Card, Form, Input, Button, Alert.
 */
import React, { useState } from 'react';
import { Card, Form, Input, Button, Alert } from 'antd';
import { MailOutlined, LockOutlined } from '@ant-design/icons';
import { API_BASE } from '../utils/api';
import { Link } from 'react-router-dom';

export default function LoginPage({ onLoginSuccess }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values) => {
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: values.email, password: values.password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Login failed');
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      onLoginSuccess?.(data.user);
    } catch (err) {
      setError(err.message || 'Failed to login. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-[#007bff] to-[#0056b3] p-5 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute w-[400px] h-[400px] -top-24 -left-24 rounded-full bg-white/15 blur-[60px] animate-pulse" />
        <div className="absolute w-[350px] h-[350px] -bottom-24 -right-24 rounded-full bg-white/15 blur-[60px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <Card className="relative z-10 w-full max-w-[480px] shadow-lg animate-slideUp" bodyStyle={{ padding: '32px 40px' }}>
        <div className="flex justify-center mb-6">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="#007bff" fillOpacity="0.2" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="#0056b3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="#007bff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1 className="m-0 mb-3 text-2xl md:text-3xl font-semibold text-[#1a1f36] text-center">Misha House Billing</h1>
        <p className="m-0 mb-8 text-[#6b7280] text-center text-[15px]">Please login to your account</p>

        {error && (
          <Alert type="error" message={error} showIcon className="mb-6" closable onClose={() => setError('')} />
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Invalid email' }]}>
            <Input prefix={<MailOutlined className="text-gray-400" />} placeholder="Enter your email" size="large" disabled={loading} />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter your password' }]}>
            <Input.Password prefix={<LockOutlined className="text-gray-400" />} placeholder="Enter your password" size="large" disabled={loading} />
          </Form.Item>
          <Form.Item className="mb-0 mt-8">
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>Login</Button>
          </Form.Item>
        </Form>

        <div className="mt-8 pt-6 text-center border-t border-gray-200">
          <p className="m-0 text-[#6b7280] text-sm">
            Don&apos;t have an account? <Link to="/signup" className="text-[#007bff] font-semibold hover:underline">Sign up here</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
