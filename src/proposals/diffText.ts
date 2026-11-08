/** Text forms of a proposal value, shared by the CodeMirror diff and the stacked narrow-screen view. */
import { stringify } from 'yaml'

export const isStructured = (v: unknown): boolean => typeof v === 'object' && v !== null

export const toYaml = (v: unknown): string => stringify(v, { sortMapEntries: true })

/** Strings diff as raw multi-line text (a schedule prompt) when `text`, everything else as sorted YAML. */
export const toDoc = (v: unknown, text?: boolean): string => (text ? (typeof v === 'string' ? v : '') : toYaml(v))
