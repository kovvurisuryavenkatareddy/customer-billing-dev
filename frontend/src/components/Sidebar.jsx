/**
 * App sidebar: fixed below header, Material-UI Drawer + List. Stays fixed while scrolling.
 */
import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Drawer, List, ListItemButton, ListItemIcon, ListItemText,
  Typography, Box, IconButton, Divider,
} from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import SettingsIcon from '@mui/icons-material/Settings';
import DescriptionIcon from '@mui/icons-material/Description';
import CloseIcon from '@mui/icons-material/Close';

const items = [
  { key: 'home', icon: <HomeIcon fontSize="small" />, label: 'Home' },
  { key: 'add-customer', icon: <PersonAddIcon fontSize="small" />, label: 'Add Customer' },
  { key: 'data-import', icon: <UploadFileIcon fontSize="small" />, label: 'Data Import' },
  { key: 'reports', icon: <DescriptionIcon fontSize="small" />, label: 'Reports' },
  { key: 'services', icon: <SettingsIcon fontSize="small" />, label: 'Services' },
];

export default function Sidebar({ currentPage, onNavigate, open = false, onClose, top = 72, width = 260 }) {
  useEffect(() => {
    if (open && window.innerWidth <= 900) {
      document.body.style.overflow = 'hidden';
      document.body.classList.add('sidebar-open-mobile');
    } else {
      document.body.style.overflow = '';
      document.body.classList.remove('sidebar-open-mobile');
    }
    return () => {
      document.body.style.overflow = '';
      document.body.classList.remove('sidebar-open-mobile');
    };
  }, [open]);

  const location = useLocation();
  const pathToKey = {
    '/': 'home',
    '/add-customer': 'add-customer',
    '/data-import': 'data-import',
    '/reports': 'reports',
    '/services': 'services',
  };
  const selectedKey = pathToKey[location.pathname] || currentPage || 'home';

  const navigate = useNavigate();

  const handleItemClick = (key) => {
    onNavigate?.(key);
    const path = key === 'home' ? '/' : `/${key}`;
    navigate(path);
    onClose?.();
  };

  return (
    <>
    <Drawer
      variant="persistent"
      anchor="left"
      open={open}
      slotProps={{
        paper: {
          sx: {
            top: `${top}px`,
            height: `calc(100% - ${top}px)`,
            width,
            borderRight: '1px solid #f0f0f0',
            boxShadow: open ? '4px 0 12px rgba(0,0,0,0.08)' : 'none',
          },
        },
      }}
      sx={{ width: open ? width : 0, flexShrink: 0 }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Box sx={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          px: 2, pt: 2, pb: 1, borderBottom: '1px solid #f3f4f6',
        }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            Menu
          </Typography>
          <IconButton
            size="small"
            onClick={onClose}
            aria-label="Close menu"
            sx={{ display: { xs: 'inline-flex', md: 'none' } }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
        <List sx={{ flex: 1, pt: 1, px: 1 }}>
          {items.map((item) => (
            <ListItemButton
              key={item.key}
              selected={selectedKey === item.key}
              onClick={() => handleItemClick(item.key)}
              sx={{
                borderRadius: 2, mb: 0.5,
                '&.Mui-selected': {
                  bgcolor: 'rgba(0,123,255,0.1)',
                  color: '#007bff',
                  '& .MuiListItemIcon-root': { color: '#007bff' },
                },
                '&.Mui-selected:hover': { bgcolor: 'rgba(0,123,255,0.16)' },
              }}
            >
              <ListItemIcon sx={{ minWidth: 36 }}>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 14 }} />
            </ListItemButton>
          ))}
        </List>
        <Divider />
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="caption" color="text.secondary">
            Misha House Billing · v1.0
          </Typography>
        </Box>
      </Box>
    </Drawer>
    {open && (
      <Box
        role="button"
        tabIndex={0}
        onClick={() => onClose?.()}
        onKeyDown={(e) => e.key === 'Escape' && onClose?.()}
        aria-label="Close sidebar overlay"
        sx={{
          display: { xs: 'block', md: 'none' },
          position: 'fixed', inset: 0, top, zIndex: (t) => t.zIndex.drawer - 1,
          bgcolor: 'rgba(0,0,0,0.3)',
        }}
      />
    )}
    </>
  );
}
