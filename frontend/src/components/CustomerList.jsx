import React, { useMemo, useCallback, useState, useEffect } from 'react';
import { Table, Button, Dropdown, Typography, Space } from 'antd';
import { EditOutlined, EllipsisOutlined } from '@ant-design/icons';
import { formatMMDDYYYY } from '../utils/dates';
import CustomerEntryModal from './CustomerEntryModal';

const { Link: TypographyLink } = Typography;

export default function CustomerList({
  customers = [],
  onEdit,
  onAddService,
  onChangeStatus,
  onCustomerUpdated,
  searchText = ''
}) {
  const [pagination, setPagination] = useState({ current: 1, pageSize: 10 });
  const [editingStatusFor, setEditingStatusFor] = useState(null);
  const [savingStatusFor, setSavingStatusFor] = useState(null);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [selectedCustomerCode, setSelectedCustomerCode] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (customers.length > 0 && isInitialLoad) {
      setIsInitialLoad(false);
    }
  }, [customers, isInitialLoad]);

  const formatDate = useCallback((d) => {
    return formatMMDDYYYY(d);
  }, []);

  // Group entries by batch_id so we show one row per batch
  const dataSource = useMemo(() => {
    const batchKey = (c) => c.batch_id || (c.entry_id != null ? `legacy-${c.entry_id}` : `single-${c.id}-${c.entry_id}`);
    const groups = new Map();
    for (const c of customers) {
      const key = batchKey(c);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    return Array.from(groups.entries()).map(([batchKeyId, entries]) => {
      const first = entries[0];
      const daysSum = entries.reduce((s, e) => s + (Number(e.days) || 0), 0);
      const billedSum = entries.reduce((s, e) => s + (Number(e.amount_billed) || 0), 0);
      const paidSum = entries.reduce((s, e) => s + (Number(e.amount_paid) || 0), 0);
      const serviceNames = [...new Set(entries.map(e => e.service_name || e.serviceName || '—').filter(Boolean))];
      const serviceName = serviceNames.length === 0
        ? 'No service'
        : serviceNames.length <= 2
          ? serviceNames.join(', ')
          : `${serviceNames.slice(0, 2).join(', ')} +${serviceNames.length - 2} more`;
      const startDates = entries.map(e => e.start_date).filter(Boolean);
      const endDates = entries.map(e => e.end_date).filter(Boolean);
      const startDate = startDates.length ? startDates.sort()[0] : first.start_date;
      const endDate = endDates.length ? endDates.sort().reverse()[0] : first.end_date;
      return {
        key: batchKeyId,
        id: first.id,
        customerId: first.id,
        name: `${(first.first_name || '').trim()}${first.last_name ? ', ' + (first.last_name || '').trim() : ''}`.trim(),
        firstName: first.first_name || '',
        lastName: first.last_name || '',
        dateOfBirth: first.date_of_birth || '',
        activeStatus: first.active_status || 'active',
        idNumber: first.id_number || '',
        fIdNumber: first.f_id_number || '',
        serviceName,
        startDate,
        endDate,
        days: daysSum,
        ratePerDay: first.rate_per_day || 0,
        amountBilled: billedSum,
        amountPaid: paidSum,
        due: billedSum - paidSum,
        paymentDate: first.date_of_payment,
        dateSubmitted: first.date_submitted,
        denialCodes: first.denial_codes || [],
        isResubmission: first.is_resubmission || false,
        entryId: first.entry_id,
        batchId: first.batch_id || (first.entry_id != null ? `legacy-${first.entry_id}` : null),
        customer: first,
      };
    });
  }, [customers]);

  // Filter data based on search text
  const filteredData = useMemo(() => {
    if (!searchText) return dataSource;
    const lowerSearch = searchText.toLowerCase();
    return dataSource.filter(row =>
      row.firstName.toLowerCase().includes(lowerSearch) ||
      row.lastName.toLowerCase().includes(lowerSearch) ||
      (row.idNumber && String(row.idNumber).toLowerCase().includes(lowerSearch)) ||
      (row.fIdNumber && String(row.fIdNumber).toLowerCase().includes(lowerSearch)) ||
      row.serviceName.toLowerCase().includes(lowerSearch) ||
      (row.startDate && formatDate(row.startDate).toLowerCase().includes(lowerSearch)) ||
      (row.endDate && formatDate(row.endDate).toLowerCase().includes(lowerSearch)) ||
      (row.dateOfBirth && formatDate(row.dateOfBirth).toLowerCase().includes(lowerSearch))
    );
  }, [dataSource, searchText, formatDate]);

  // compute totals across all service lines (all pages)
  const allPagesTotals = useMemo(() => {
    const computed = filteredData.reduce((acc, row) => {
      acc.amountBilled += row.amountBilled;
      acc.amountPaid += row.amountPaid;
      return acc;
    }, { amountBilled: 0, amountPaid: 0 });
    computed.totalDue = computed.amountBilled - computed.amountPaid;
    return computed;
  }, [filteredData]);

  // Get unique values for filters
  const uniqueFirstNames = useMemo(() =>
    [...new Set(dataSource.map(item => item.firstName))].filter(Boolean).map(text => ({ text, value: text })),
    [dataSource]
  );

  const uniqueLastNames = useMemo(() =>
    [...new Set(dataSource.map(item => item.lastName))].filter(Boolean).map(text => ({ text, value: text })),
    [dataSource]
  );

  // Define columns for Ant Design Table with sorting and filtering
  const columns = [
    {
      title: 'S.No',
      key: 'sno',
      width: 50,
      align: 'center',
      render: (_, __, index) => index + 1,
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      width: 170,
      sorter: (a, b) => (a.name || '').localeCompare(b.name || ''),
      render: (text, record) => (
        <TypographyLink
          className="customer-name font-semibold"
          onClick={() => {
            setSelectedCustomerId(record.customerId);
            setSelectedBatchId(record.batchId ?? null);
            setShowEntryModal(true);
          }}
          title="Click to view customer details"
        >
          {text || 'N/A'}
        </TypographyLink>
      ),
    },
    {
      title: 'DOB',
      dataIndex: 'dateOfBirth',
      key: 'dateOfBirth',
      width: 100,
      sorter: (a, b) => {
        if (!a.dateOfBirth) return 1;
        if (!b.dateOfBirth) return -1;
        return new Date(a.dateOfBirth) - new Date(b.dateOfBirth);
      },
      render: (date) => formatDate(date),
    },
    {
      title: 'ID #',
      dataIndex: 'idNumber',
      key: 'idNumber',
      width: 100,
      ellipsis: true,
      render: (text) => text || '—',
    },
    {
      title: 'F ID #',
      dataIndex: 'fIdNumber',
      key: 'fIdNumber',
      width: 100,
      ellipsis: true,
      render: (text) => text || '—',
    },
    {
      title: 'Amount Billed',
      dataIndex: 'amountBilled',
      key: 'amountBilled',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.amountBilled - b.amountBilled,
      render: (value) => (
        <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>
          ${value.toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Amount Paid',
      dataIndex: 'amountPaid',
      key: 'amountPaid',
      width: 120,
      align: 'right',
      sorter: (a, b) => a.amountPaid - b.amountPaid,
      render: (value) => (
        <span style={{ fontWeight: '600', fontFamily: 'monospace' }}>
          ${value.toFixed(2)}
        </span>
      ),
    },
    {
      title: 'Due',
      key: 'due',
      width: 90,
      align: 'right',
      sorter: (a, b) => (a.amountBilled - a.amountPaid) - (b.amountBilled - b.amountPaid),
      render: (_, record) => {
        const due = record.amountBilled - record.amountPaid;
        return (
          <span style={{
            color: due > 0 ? '#e74c3c' : '#95a5a6',
            fontWeight: '600',
            fontFamily: 'monospace'
          }}>
            ${due.toFixed(2)}
          </span>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 90,
      fixed: 'right',
      render: (_, record) => {
        const handleEdit = () => {
          onEdit({
            customer: record.customer,
            batchId: record.batchId,
            service: {
              id: record.entryId,
              entryId: record.entryId,
              entry_id: record.entryId,
              serviceName: record.serviceName,
              days: record.days,
              ratePerDay: record.ratePerDay,
              amountBilled: record.amountBilled,
              amountPaid: record.amountPaid,
              dateOfPayment: record.paymentDate,
              startDate: record.startDate,
              endDate: record.endDate,
              denialCodes: record.denialCodes,
            },
          });
        };

        const items = [{ key: 'edit', label: 'Edit', icon: <EditOutlined /> }];

        return (
          <div className="flex items-center justify-end">
            <Space size={4} className="hidden md:inline-flex">
              <Button
                type="primary"
                size="small"
                icon={<EditOutlined />}
                onClick={handleEdit}
                style={{ padding: '2px 8px', fontSize: '12px', minWidth: 'auto', height: 26 }}
              >
                Edit
              </Button>
            </Space>

            <div className="md:hidden">
              <Dropdown
                trigger={['click']}
                menu={{
                  items,
                  onClick: ({ key }) => {
                    if (key === 'edit') handleEdit();
                  },
                }}
                placement="bottomRight"
              >
                <Button size="small" type="text" aria-label="Actions" icon={<EllipsisOutlined />} />
              </Dropdown>
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <Table
        className="customer-ledger-table"
        dataSource={filteredData}
        columns={columns}
        size="small"
        bordered
        sticky
        pagination={{
          ...pagination,
          showSizeChanger: window.innerWidth >= 576,
          showTotal: (total, range) => `${range[0]}-${range[1]} of ${total} records`,
          pageSizeOptions: ['10', '20', '50', '100'],
          responsive: true,
          simple: window.innerWidth < 576,
          showQuickJumper: window.innerWidth >= 768,
          onChange: (page, pageSize) => {
            setPagination({ current: page, pageSize: pageSize || 10 });
          },
          onShowSizeChange: (current, size) => {
            setPagination({ current: 1, pageSize: size });
          },
        }}
        scroll={{ x: 1200 }}
        tableLayout="fixed"
        summary={(pageData) => {
          const pageTotals = pageData.reduce((acc, row) => {
            acc.amountBilled += row.amountBilled || 0;
            acc.amountPaid += row.amountPaid || 0;
            return acc;
          }, { amountBilled: 0, amountPaid: 0 });
          pageTotals.totalDue = pageTotals.amountBilled - pageTotals.amountPaid;

          const formatCurrency = (value) =>
            value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

          const TotalsBar = ({ label, billed, paid, due, isAllPages }) => (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '2rem',
                padding: '10px 16px',
                background: isAllPages ? 'linear-gradient(to right, #f1f5f9, #e2e8f0)' : '#f8fafc',
                borderTop: '1px solid #e2e8f0',
                fontSize: '13px',
                fontWeight: 500,
              }}
            >
              <span style={{ color: '#475569', minWidth: '140px', fontWeight: 600 }}>{label}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ color: '#64748b' }}>Billed</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                  ${formatCurrency(billed)}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1rem', borderLeft: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b' }}>Paid</span>
                <span style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e293b' }}>
                  ${formatCurrency(paid)}
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', paddingLeft: '1rem', borderLeft: '1px solid #e2e8f0' }}>
                <span style={{ color: '#64748b' }}>Due</span>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: due > 0 ? '#dc2626' : due < 0 ? '#d97706' : '#64748b',
                  }}
                >
                  ${formatCurrency(due)}
                </span>
              </span>
            </div>
          );

          return (
            <Table.Summary fixed>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={columns.length} style={{ padding: 0, borderBottom: 'none' }}>
                  <TotalsBar
                    label="Current Page Totals"
                    billed={pageTotals.amountBilled}
                    paid={pageTotals.amountPaid}
                    due={pageTotals.totalDue}
                    isAllPages={false}
                  />
                </Table.Summary.Cell>
              </Table.Summary.Row>
              <Table.Summary.Row>
                <Table.Summary.Cell index={0} colSpan={columns.length} style={{ padding: 0, borderBottom: 'none' }}>
                  <TotalsBar
                    label="All Pages Totals"
                    billed={allPagesTotals.amountBilled}
                    paid={allPagesTotals.amountPaid}
                    due={allPagesTotals.totalDue}
                    isAllPages
                  />
                </Table.Summary.Cell>
              </Table.Summary.Row>
            </Table.Summary>
          );
        }}
      />

      {showEntryModal && (
        <CustomerEntryModal
          customerId={selectedCustomerId}
          batchId={selectedBatchId}
          onUpdated={onCustomerUpdated}
          onClose={() => {
            setShowEntryModal(false);
            setSelectedCustomerId(null);
            setSelectedBatchId(null);
          }}
        />
      )}
    </div>
  );
}