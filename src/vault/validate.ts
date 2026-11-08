export const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;
export const MAX_ENVS = 20;

/** Why an env name is not acceptable, or undefined when it is. */
export function envNameError(name: string, others: string[] = []): string | undefined {
  if (name === '') return 'Env name is required';
  if (!ENV_NAME.test(name)) return 'Use A-Z, 0-9 and _, not starting with a digit, up to 128 characters';
  if (others.includes(name)) return 'Duplicate env name';
  return undefined;
}

export const parseLabels = (text: string): string[] => [...new Set(text.split(',').map((l) => l.trim()).filter((l) => l !== ''))];
