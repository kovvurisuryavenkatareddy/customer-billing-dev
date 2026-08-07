/**
 * Shared Material-UI theme. Colors match the app's existing palette
 * (#007bff primary) so the visual identity carries over during migration.
 */
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#007bff',
      dark: '#0056b3',
      light: '#3395ff',
      contrastText: '#fff',
    },
    secondary: {
      main: '#6c757d',
    },
    error: {
      main: '#dc3545',
    },
    warning: {
      main: '#d97706',
    },
    success: {
      main: '#16a34a',
    },
    background: {
      default: '#f4f7f9',
      paper: '#ffffff',
    },
    text: {
      primary: '#1f2937',
      secondary: '#64748b',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: [
      '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto',
      '"Helvetica Neue"', 'Arial', 'sans-serif',
    ].join(','),
    button: {
      textTransform: 'none',
      fontWeight: 600,
    },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiSelect: {
      defaultProps: { size: 'small' },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontWeight: 600,
          background: '#007bff',
          color: '#fff',
          borderBottom: '1px solid #0056b3',
        },
      },
    },
    MuiTableSortLabel: {
      styleOverrides: {
        root: {
          color: '#fff',
          '&:hover': { color: '#fff', opacity: 0.85 },
          '&.Mui-active': { color: '#fff' },
          '& .MuiTableSortLabel-icon': { color: '#fff !important' },
        },
      },
    },
  },
});

export default theme;
