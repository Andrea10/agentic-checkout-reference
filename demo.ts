import { fileURLToPath } from 'node:url';

/**
 * Placeholder demo. T09 replaces this with the real end-to-end run
 * (mandate issued, server started, agent shops, order and audit log printed).
 */
export const demoMessage =
  'agentic-checkout-reference: demo placeholder. The end-to-end demo arrives with T09.';

function isRunDirectly(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === entry;
}

if (isRunDirectly()) {
  console.log(demoMessage);
}
