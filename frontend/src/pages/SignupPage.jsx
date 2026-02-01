/**
 * Signup page using Ant Design Card, Form, Input, Button, Alert.
 */
import React, { useState } from 'react';
import { Card, Form, Input, Button, Alert } from 'antd';
import { MailOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { API_BASE } from '../utils/api';
import { Link } from 'react-router-dom';

export default function SignupPage({ onSignupSuccess }) {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const handleSubmit = async (values) => {
    if (values.password !== values.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          first_name: values.firstName,
          last_name: values.lastName,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Signup failed');
      localStorage.setItem('token', data.access_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (window.showToast) window.showToast({ message: 'Account created successfully!', type: 'success' });
      onSignupSuccess?.(data.user);
    } catch (err) {
      setError(err.message || 'Failed to create account. Please try again.');
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
        <h1 className="m-0 mb-3 text-2xl md:text-3xl font-semibold text-[#1a1f36] text-center">Join Us Today</h1>
        <p className="m-0 mb-8 text-[#6b7280] text-center text-[15px]">Create your account to get started</p>

        {error && (
          <Alert type="error" message={error} showIcon className="mb-6" closable onClose={() => setError('')} />
        )}

        <Form form={form} layout="vertical" onFinish={handleSubmit} requiredMark={false}>
          <Form.Item noStyle shouldUpdate={(a, b) => a.password !== b.password}>
            {() => null}
          </Form.Item>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Form.Item name="firstName" label="First Name" rules={[{ required: true, message: 'Enter first name' }]}>
              <Input prefix={<UserOutlined className="text-gray-400" />} placeholder="First name" size="large" disabled={loading} />
            </Form.Item>
            <Form.Item name="lastName" label="Last Name" rules={[{ required: true, message: 'Enter last name' }]}>
              <Input prefix={<UserOutlined className="text-gray-400" />} placeholder="Last name" size="large" disabled={loading} />
            </Form.Item>
          </div>
          <Form.Item name="email" label="Email Address" rules={[{ required: true, message: 'Enter your email' }, { type: 'email', message: 'Invalid email' }]}>
            <Input prefix={<MailOutlined className="text-gray-400" />} placeholder="Enter your email" size="large" disabled={loading} />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, message: 'Enter password' }, { min: 6, message: 'At least 6 characters' }]}>
            <Input.Password prefix={<LockOutlined className="text-gray-400" />} placeholder="Password (min 6 characters)" size="large" disabled={loading} />
          </Form.Item>
          <Form.Item
            name="confirmPassword"
            label="Confirm Password"
            dependencies={['password']}
            rules={[
              { required: true, message: 'Confirm your password' },
              ({ getFieldValue }) => ({ validator(_, value) {
                if (!value || getFieldValue('password') === value) return Promise.resolve();
                return Promise.reject(new Error('Passwords do not match'));
              } }),
            ]}
          >
            <Input.Password prefix={<LockOutlined className="text-gray-400" />} placeholder="Confirm password" size="large" disabled={loading} />
          </Form.Item>
          <Form.Item className="mb-0 mt-8">
            <Button type="primary" htmlType="submit" size="large" block loading={loading}>Sign Up</Button>
          </Form.Item>
        </Form>

        <div className="mt-8 pt-6 text-center border-t border-gray-200">
          <p className="m-0 text-[#6b7280] text-sm">
            Already have an account? <Link to="/login" className="text-[#007bff] font-semibold hover:underline">Login here</Link>
          </p>
        </div>
      </Card>
    </div>
  );
}
