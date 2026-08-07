/**
 * App navbar using Material-UI AppBar, Menu, Avatar.
 */
import React, { useState } from 'react';
import {
  AppBar, Toolbar, IconButton, Avatar, Menu, MenuItem, Divider,
  Typography, Box, ListItemIcon,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';

export default function Header({ currentPage, onNavigate, user, onLogout, onToggleSidebar, style: styleProp }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const menuOpen = Boolean(anchorEl);
  const initials = user ? `${(user.first_name || '').charAt(0)}${(user.last_name || '').charAt(0)}`.toUpperCase() : '';

  const handleLogout = () => {
    setAnchorEl(null);
    onLogout?.();
  };

  return (
    <AppBar
      position="fixed"
      elevation={2}
      sx={{ height: 72, bgcolor: '#007bff', zIndex: (t) => t.zIndex.drawer + 100, ...styleProp }}
    >
      <Toolbar sx={{ height: 72, minHeight: '72px !important', px: { xs: 2, md: 3 } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, md: 2 }, flex: 1, minWidth: 0 }}>
          <IconButton
            onClick={() => onToggleSidebar?.()}
            aria-label="Toggle sidebar"
            sx={{ color: '#fff', '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' } }}
          >
            <MenuIcon />
          </IconButton>
          <Box
            component="img"
            src="/logo192.png"
            alt="Logo"
            sx={{
              width: { xs: 40, md: 44 }, height: { xs: 40, md: 44 },
              borderRadius: 2, objectFit: 'cover', flexShrink: 0,
              boxShadow: 1,
            }}
          />
          <Box sx={{ minWidth: 0, overflow: 'hidden' }}>
            <Typography
              variant="h6"
              noWrap
              sx={{ color: '#fff', fontWeight: 600, fontSize: { xs: '1.05rem', md: '1.4rem' }, lineHeight: 1.2 }}
            >
              Misha House Billing
            </Typography>
            <Typography
              variant="caption"
              noWrap
              sx={{ color: 'rgba(255,255,255,0.9)', display: { xs: 'none', md: 'block' } }}
            >
              Manage services, invoices &amp; customers
            </Typography>
          </Box>
        </Box>

        {user && (
          <Box sx={{ ml: 'auto', flexShrink: 0 }}>
            <Box
              component="button"
              type="button"
              onClick={(e) => setAnchorEl(e.currentTarget)}
              aria-label="User menu"
              sx={{
                display: 'flex', alignItems: 'center', gap: { xs: 1, md: 1.5 },
                bgcolor: 'transparent', border: 0, borderRadius: 2,
                px: 1, py: 0.75, cursor: 'pointer',
                '&:hover': { bgcolor: 'rgba(255,255,255,0.15)' },
              }}
            >
              <Avatar sx={{ width: { xs: 36, md: 40 }, height: { xs: 36, md: 40 }, bgcolor: 'rgba(255,255,255,0.25)', color: '#fff' }}>
                {initials || <PersonIcon />}
              </Avatar>
              <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', textAlign: 'left' }}>
                <Typography variant="body2" sx={{ color: '#fff', fontWeight: 500, maxWidth: 140 }} noWrap>
                  {user.first_name} {user.last_name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.8)', maxWidth: 140 }} noWrap>
                  {user.email}
                </Typography>
              </Box>
            </Box>
            <Menu
              anchorEl={anchorEl}
              open={menuOpen}
              onClose={() => setAnchorEl(null)}
              anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
              transformOrigin={{ vertical: 'top', horizontal: 'right' }}
              slotProps={{ paper: { sx: { minWidth: 220, mt: 1 } } }}
            >
              <Box sx={{ px: 2, py: 1 }}>
                <Typography variant="subtitle2" fontWeight={700}>
                  {user.first_name} {user.last_name}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {user.email}
                </Typography>
              </Box>
              <Divider />
              <MenuItem onClick={handleLogout}>
                <ListItemIcon><LogoutIcon fontSize="small" /></ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        )}
      </Toolbar>
    </AppBar>
  );
}
