/**
 * Estilos compartilhados dos e-mails de autenticação do CRM.
 *
 * Fundo do corpo SEMPRE branco (regra de e-mail), acentos na cor da marca.
 */
const primaria = '#1b6b74'

export const emailStyles = {
  main: { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' },
  container: { padding: '24px 28px', maxWidth: '560px' },
  marca: {
    fontSize: '13px',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    color: primaria,
    fontWeight: 'bold' as const,
    margin: '0 0 18px',
  },
  h1: {
    fontSize: '22px',
    fontWeight: 'bold' as const,
    color: '#0f172a',
    margin: '0 0 18px',
  },
  text: {
    fontSize: '14px',
    color: '#475569',
    lineHeight: '1.6',
    margin: '0 0 24px',
  },
  destaque: {
    fontSize: '14px',
    color: '#0f172a',
    lineHeight: '1.6',
    margin: '0 0 24px',
    fontWeight: 'bold' as const,
  },
  button: {
    backgroundColor: primaria,
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 'bold' as const,
    border: `1px solid ${primaria}`,
    borderRadius: '8px',
    padding: '12px 22px',
    textDecoration: 'none',
  },
  codigo: {
    fontFamily: 'Courier, monospace',
    fontSize: '24px',
    fontWeight: 'bold' as const,
    letterSpacing: '3px',
    color: '#0f172a',
    margin: '0 0 28px',
  },
  footer: { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0', lineHeight: '1.6' },
  // Renderizado como texto: sem >, & ou aspas.
  darkModeCss: `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #0f172a !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #0f172a !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #0f172a !important; }
`,
}
