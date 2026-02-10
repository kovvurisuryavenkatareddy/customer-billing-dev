/**
 * Filter Participants panel using Ant Design Card, Form, Input, Select, DatePicker, Button.
 */
import React, { useEffect } from 'react';
import { Card, Form, Input, Select, DatePicker, Button, Row, Col, Space } from 'antd';
import { FilterOutlined, ClearOutlined, SearchOutlined } from '@ant-design/icons';
import { toISO } from '../utils/dates';

export default function CustomerSearch({ onSearch, status = 'active', onStatusChange }) {
  const [form] = Form.useForm();

  useEffect(() => {
    form.setFieldValue('status', status);
  }, [status, form]);

  const dateToISO = (d) => {
    if (!d) return '';
    const str = typeof d === 'string' ? d : (d.format ? d.format('YYYY-MM-DD') : '');
    return toISO(str);
  };

  const triggerSearch = (values = {}) => {
    const v = form.getFieldsValue();
    const firstName = (values.firstName ?? v.firstName ?? '').trim();
    const lastName = (values.lastName ?? v.lastName ?? '').trim();
    const st = values.status ?? v.status ?? status;
    const dob = values.dateOfBirth ?? v.dateOfBirth;
    const startDate = values.startDate ?? v.startDate;
    const endDate = values.endDate ?? v.endDate;
    onSearch({
      firstName,
      lastName,
      dateOfBirth: dateToISO(dob),
      status: st,
      startDate: dateToISO(startDate),
      endDate: dateToISO(endDate),
      _rawStart: startDate?.format?.('YYYY-MM-DD') ?? '',
      _rawEnd: endDate?.format?.('YYYY-MM-DD') ?? '',
      _rawDOB: dob?.format?.('YYYY-MM-DD') ?? '',
    });
  };

  const clearFilters = () => {
    form.resetFields();
    onStatusChange?.('active');
    onSearch({
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      status: 'active',
      startDate: '',
      endDate: '',
    });
  };

  return (
    <Card
      className="mb-6 shadow-sm border border-blue-100"
      styles={{ body: { padding: '20px 24px' } }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <Space align="center">
          <FilterOutlined className="text-[#007bff] text-lg" />
          <span className="text-base font-semibold text-[#1a253c]">Filter Participants</span>
        </Space>
        <Button icon={<ClearOutlined />} onClick={clearFilters}>
          Clear filters
        </Button>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          status: status,
          firstName: '',
          lastName: '',
          dateOfBirth: null,
          startDate: null,
          endDate: null,
        }}
        onValuesChange={(_, all) => triggerSearch(all)}
      >
        <Row gutter={[16, 12]}>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="status" label="Status">
              <Select
                options={[
                  { value: 'active', label: 'Active' },
                  { value: 'inactive', label: 'Inactive' },
                  { value: 'all', label: 'All' },
                ]}
                onChange={(val) => {
                  onStatusChange?.(val);
                  triggerSearch({ ...form.getFieldsValue(), status: val });
                }}
                allowClear={false}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="firstName" label="First Name">
              <Input placeholder="First name" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="lastName" label="Last Name">
              <Input placeholder="Last name" allowClear />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="dateOfBirth" label="Date of Birth">
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="startDate" label="From Date">
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Form.Item name="endDate" label="To Date">
              <DatePicker
                format="MM-DD-YYYY"
                className="w-full"
                placeholder="MM-DD-YYYY"
                allowClear
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Card>
  );
}
