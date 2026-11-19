export const ADMIN_PUBLISHED_ORIGIN = 'https://pdf-to-word-markdown-text-converter.ai.studio';

export const ADMIN_CONSOLE_LINKS = {
  publishedUrl: `${ADMIN_PUBLISHED_ORIGIN}/`,
  adminUrl: `${ADMIN_PUBLISHED_ORIGIN}/?admin=1`,
  fallbackPreUrl: 'https://ais-pre-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app',
  devUrl: 'https://ais-dev-wpsct27fdufcpry5x6ikjn-685461883733.europe-west2.run.app',
  studioEditorUrl: 'https://aistudio.google.com/apps/003b657a-dcce-45ea-a80a-255c7ae94b18',
  deployCommand: 'bash deploy-cloudrun.sh doc-studio-team europe-west2',
} as const;

export function getCliServerOrigin(): string {
  const rawOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  if (rawOrigin.includes('.ai.studio') || rawOrigin.includes('wpsct27fdufcpry5x6ikjn')) {
    return ADMIN_PUBLISHED_ORIGIN;
  }
  return rawOrigin;
}
