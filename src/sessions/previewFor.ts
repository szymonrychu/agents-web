import { base } from '../api/client'
import { postTemplatePreview } from '../editor/TemplateEditor'

export type Surface = 'web_chat_start' | 'preset_text' | 'init_script' | 'archive_name'

/** Renders a template through the orchestrator's preview for the surface it is sent on. */
export const previewFor = (surface: Surface) => postTemplatePreview(`${base()}/templates/preview`, surface)
